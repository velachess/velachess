// @vitest-environment node
/**
 * Provider identity on game review: GET /games/:id carries BOTH seats'
 * picture or flair, resolved from a per-handle cache shared by every
 * user — asked for once, reused until stale, and never a reason for the
 * read to fail.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  LISTER_ARCHIVE_MONTH,
  LISTER_ARCHIVES_INDEX,
  LICHESS_PGN_EXPORT,
} from "@velachess/fixtures";
import { chessComFixtureFetch } from "@velachess/test-utils";
import { providerProfiles } from "@velachess/db";

import { createApiHarness, type ApiHarness, type AuthedApp } from "./harness.ts";

const CHESS_COM_AVATAR =
  "https://images.chesscomfiles.com/uploads/v1/user/461825478.97ae265f.200x200o.5fa38b32b080.jpg";
const RIVAL_AVATAR =
  "https://images.chesscomfiles.com/uploads/v1/user/rival.97ae265f.200x200o.jpg";
const LICHESS_FLAIR = "people.santa-claus-light-skin-tone";

/**
 * The suite's chess.com fixtures plus the profile endpoints the review
 * read resolves through. Every profile attempt is counted — caching is
 * asserted by what stops being asked for, and a dead provider is
 * simulated rather than awaited (`setProfilesUp(false)`).
 */
function fakeSyncFetch() {
  const base = chessComFixtureFetch();
  let profilesUp = true;
  const profileRequests: string[] = [];

  const doFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (CHESS_COM_PROFILE_URL.test(url)) {
      const username = url.split("/").pop()!.toLowerCase();
      profileRequests.push(`chess_com:${username}`);
      if (!profilesUp) return new Response("unavailable", { status: 503 });
      return Response.json({
        username,
        avatar: username === "rival" ? RIVAL_AVATAR : CHESS_COM_AVATAR,
        country: "https://api.chess.com/pub/country/BR",
      });
    }
    if (url.startsWith("https://lichess.org/api/user/")) {
      profileRequests.push(`lichess:${url.split("/").pop()!.toLowerCase()}`);
      if (!profilesUp) return new Response("unavailable", { status: 503 });
      return Response.json({
        id: "sea-lion",
        username: url.split("/").pop(),
        flair: LICHESS_FLAIR,
      });
    }
    if (url.startsWith("https://lichess.org/api/games/user/")) {
      return new Response(LICHESS_PGN_EXPORT, {
        headers: { "content-type": "application/x-chess-pgn" },
      });
    }
    // The lister archive — a second player whose games are against the
    // same opponent, so a second user can own games without re-importing
    // looper's rows (games dedup globally on source+externalId).
    if (url.endsWith("/player/lister/games/archives")) {
      return Response.json(LISTER_ARCHIVES_INDEX);
    }
    if (url.endsWith("/player/lister/games/2026/06")) {
      return Response.json(LISTER_ARCHIVE_MONTH);
    }
    return base(input, init);
  }) as typeof globalThis.fetch;

  return {
    fetch: doFetch,
    setProfilesUp: (up: boolean) => void (profilesUp = up),
    profileRequests,
  };
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

/** Exactly `/pub/player/{name}` — the archives index lives one segment
 * deeper (`/pub/player/{name}/games/archives`) and must fall through. */
const CHESS_COM_PROFILE_URL = /^https:\/\/api\.chess\.com\/pub\/player\/[^/]+$/;

const sync = fakeSyncFetch();

let harness: ApiHarness;
let owner: AuthedApp;

beforeAll(async () => {
  harness = await createApiHarness({ fetch: sync.fetch });
  owner = (await harness.signUp("identity@api.test")).app;
});

afterAll(async () => {
  await harness.close();
});

interface SeatIdentity {
  avatarUrl: string | null;
  flair: string | null;
}

interface GameView {
  whiteIdentity: SeatIdentity;
  blackIdentity: SeatIdentity;
}

/** First imported game of an archive — any one will do for seat reads. */
async function firstGameId(
  app: AuthedApp,
  platform: string,
  username: string,
): Promise<string> {
  const page = (await (
    await app.request(`/games?platform=${platform}&username=${username}`)
  ).json()) as { games: { id: string }[] };
  expect(page.games.length).toBeGreaterThan(0);
  return page.games[0]!.id;
}

async function openGame(app: AuthedApp, gameId: string): Promise<Response> {
  return app.request(`/games/${gameId}`);
}

describe("provider profile identity on game review", () => {
  it("carries the provider picture of both seats, connected player or opponent", async () => {
    const created = await owner.request(
      "/accounts",
      json({ platform: "chess_com", username: "Looper" }),
    );
    expect(created.status).toBe(201);

    // Connect-time warmed my handle; the opponent's is a cold miss here.
    const before = sync.profileRequests.length;
    const game = await firstGameId(owner, "chess_com", "looper");
    const response = await openGame(owner, game);
    expect(response.status).toBe(200);

    const body = (await response.json()) as GameView;
    expect(body.whiteIdentity).toEqual({ avatarUrl: CHESS_COM_AVATAR, flair: null });
    expect(body.blackIdentity).toEqual({ avatarUrl: RIVAL_AVATAR, flair: null });

    // Exactly the one opponent was worth a request — never a fan-out.
    expect(sync.profileRequests.slice(before)).toEqual(["chess_com:rival"]);
  });

  it("reopening the same game spends no further provider request", async () => {
    const game = await firstGameId(owner, "chess_com", "looper");
    const before = sync.profileRequests.length;

    const response = await openGame(owner, game);
    expect(response.status).toBe(200);
    expect(((await response.json()) as GameView).blackIdentity.avatarUrl).toBe(
      RIVAL_AVATAR,
    );

    expect(sync.profileRequests.slice(before)).toEqual([]);
  });

  it("shares one cached profile between users", async () => {
    // A second user tracks a DIFFERENT handle whose games are against the
    // same opponent — their connect warms only their own handle, and the
    // opponent's identity comes from the row the first user's open wrote.
    const second = (await harness.signUp("colleague@api.test")).app;
    const connected = await second.request(
      "/accounts",
      json({ platform: "chess_com", username: "Lister" }),
    );
    expect(connected.status).toBe(201);

    const before = sync.profileRequests.length;
    const game = await firstGameId(second, "chess_com", "lister");
    const response = await openGame(second, game);
    expect(response.status).toBe(200);
    const body = (await response.json()) as GameView;
    // The lister fixture's latest game is lister as black, rival as white.
    expect(body.whiteIdentity).toEqual({ avatarUrl: RIVAL_AVATAR, flair: null });
    expect(body.blackIdentity).toEqual({ avatarUrl: CHESS_COM_AVATAR, flair: null });

    // The opponent was asked for exactly once across both users' opens.
    expect(
      sync.profileRequests.filter((request) => request === "chess_com:rival"),
    ).toHaveLength(1);
    expect(sync.profileRequests.slice(before)).toEqual([]);
  });

  it("reads a Lichess flair for either seat, and never an avatar", async () => {
    const created = await owner.request(
      "/accounts",
      json({ platform: "lichess", username: "Sea-Lion" }),
    );
    expect(created.status).toBe(201);

    const game = await firstGameId(owner, "lichess", "sea-lion");
    const response = await openGame(owner, game);
    expect(response.status).toBe(200);

    const body = (await response.json()) as GameView;
    for (const seat of [body.whiteIdentity, body.blackIdentity]) {
      expect(seat.flair).toBe(LICHESS_FLAIR);
      // Lichess has no profile pictures at all — the field exists and stays empty.
      expect(seat.avatarUrl).toBeNull();
    }
  });

  it("a dead profile endpoint costs the decoration, not the game", async () => {
    // Forget the cache so both seats are cold, then blackhole the provider.
    await harness.db.delete(providerProfiles);
    sync.setProfilesUp(false);
    try {
      const game = await firstGameId(owner, "chess_com", "looper");
      const response = await openGame(owner, game);
      expect(response.status).toBe(200);

      const body = (await response.json()) as GameView;
      expect(body.whiteIdentity).toEqual({ avatarUrl: null, flair: null });
      expect(body.blackIdentity).toEqual({ avatarUrl: null, flair: null });
    } finally {
      sync.setProfilesUp(true);
    }
  });

  it("an entry past its refresh window is asked for again", async () => {
    // The failed attempts above wrote negative entries — they age out
    // like any other, instead of pinning initials for a refresh cycle.
    const stale = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    await harness.db.update(providerProfiles).set({ fetchedAt: stale });

    const before = sync.profileRequests.length;
    const game = await firstGameId(owner, "chess_com", "looper");
    const response = await openGame(owner, game);
    expect(response.status).toBe(200);

    const body = (await response.json()) as GameView;
    expect(body.whiteIdentity.avatarUrl).toBe(CHESS_COM_AVATAR);
    expect(body.blackIdentity.avatarUrl).toBe(RIVAL_AVATAR);
    // One request per seat, both seats asked.
    expect(sync.profileRequests.slice(before)).toHaveLength(2);
  });
});
