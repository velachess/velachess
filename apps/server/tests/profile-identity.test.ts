// @vitest-environment node
import { parseResponse } from "hono/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  LISTER_ARCHIVE_MONTH,
  LISTER_ARCHIVES_INDEX,
  LICHESS_PGN_EXPORT,
} from "@velachess/fixtures";
import { chessComFixtureFetch } from "@velachess/test-utils";
import { providerProfiles } from "@velachess/infra-db";

import { createApiHarness, type ApiHarness, type AuthedApp } from "./harness.ts";

const CHESS_COM_AVATAR =
  "https://images.chesscomfiles.com/uploads/v1/user/461825478.97ae265f.200x200o.5fa38b32b080.jpg";
const RIVAL_AVATAR =
  "https://images.chesscomfiles.com/uploads/v1/user/rival.97ae265f.200x200o.jpg";
const LICHESS_FLAIR = "people.santa-claus-light-skin-tone";

/**
 * Every profile attempt is counted, so caching is asserted by what stops
 * being asked for, and a dead provider is simulated with
 * `setProfilesUp(false)` rather than awaited.
 */
function fakeSyncFetch() {
  const base = chessComFixtureFetch();
  let profilesUp = true;
  /** 200 OK with no `avatar` key: an answer saying there is none, distinct
   * from a failed request. */
  let avatarless = false;
  const profileRequests: string[] = [];

  const doFetch: typeof globalThis.fetch = async (input, init) => {
    const url = String(input);

    if (CHESS_COM_PROFILE_URL.test(url)) {
      const username = url.split("/").pop()!.toLowerCase();
      profileRequests.push(`chess_com:${username}`);
      if (!profilesUp) return new Response("unavailable", { status: 503 });
      if (avatarless) {
        return Response.json({
          username,
          country: "https://api.chess.com/pub/country/BR",
        });
      }
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
    // A second player whose games are against the same opponent, so a
    // second user owns games without re-importing looper's rows.
    if (url.endsWith("/player/lister/games/archives")) {
      return Response.json(LISTER_ARCHIVES_INDEX);
    }
    if (url.endsWith("/player/lister/games/2026/06")) {
      return Response.json(LISTER_ARCHIVE_MONTH);
    }
    return base(input, init);
  };

  return {
    fetch: doFetch,
    setProfilesUp: (up: boolean) => void (profilesUp = up),
    setAvatarless: (value: boolean) => void (avatarless = value),
    profileRequests,
  };
}

/** Exactly `/pub/player/{name}`: the archives index lives one segment
 * deeper and must fall through. */
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

async function firstGameId(app: AuthedApp, source = "chess_com"): Promise<string> {
  const page = await parseResponse(app.api.games.$get({ query: {} }));
  const pick = page.games.find((game) => game.source === source);
  expect(pick, `no ${source} game in the library`).toBeDefined();
  return pick!.id;
}

function openGame(app: AuthedApp, gameId: string) {
  return parseResponse(app.api.games[":id"].$get({ param: { id: gameId } }));
}

async function connectAccount(
  app: AuthedApp,
  platform: "chess_com" | "lichess",
  username: string,
) {
  const created = await app.api.accounts.$post({ json: { platform, username } });
  expect(created.status).toBe(201);
  if (created.status !== 201) throw new Error("unreachable");
  return created.json();
}

describe("provider profile identity on game review", () => {
  it("carries the provider picture of both seats, connected player or opponent", async () => {
    const created = await connectAccount(owner, "chess_com", "Looper");
    if (!created.syncId) throw new Error("expected a first sync on a fresh connect");
    await harness.runSync(created.syncId);

    // Connect warmed my handle; the opponent's is a cold miss.
    const before = sync.profileRequests.length;
    const game = await firstGameId(owner);
    const body = await openGame(owner, game);
    expect(body.whiteIdentity).toEqual({ avatarUrl: CHESS_COM_AVATAR, flair: null });
    expect(body.blackIdentity).toEqual({ avatarUrl: RIVAL_AVATAR, flair: null });

    // One request for the one opponent, never a fan-out.
    expect(sync.profileRequests.slice(before)).toEqual(["chess_com:rival"]);
  });

  it("reopening the same game spends no further provider request", async () => {
    const game = await firstGameId(owner);
    const before = sync.profileRequests.length;

    const body = await openGame(owner, game);
    expect(body.blackIdentity.avatarUrl).toBe(RIVAL_AVATAR);

    expect(sync.profileRequests.slice(before)).toEqual([]);
  });

  it("shares one cached profile between users", async () => {
    // A second user tracks a different handle against the same opponent, so
    // their connect warms only their own and the opponent comes from the row
    // the first user's open wrote.
    const second = (await harness.signUp("colleague@api.test")).app;
    const connected = await connectAccount(second, "chess_com", "Lister");
    if (!connected.syncId) throw new Error("expected a first sync on a fresh connect");
    await harness.runSync(connected.syncId);

    const before = sync.profileRequests.length;
    const game = await firstGameId(second);
    const body = await openGame(second, game);
    expect(body.whiteIdentity).toEqual({ avatarUrl: RIVAL_AVATAR, flair: null });
    expect(body.blackIdentity).toEqual({ avatarUrl: CHESS_COM_AVATAR, flair: null });

    // Once across both users' opens.
    expect(
      sync.profileRequests.filter((request) => request === "chess_com:rival"),
    ).toHaveLength(1);
    expect(sync.profileRequests.slice(before)).toEqual([]);
  });

  it("reconnecting a handle whose profile is already fresh asks nothing", async () => {
    // Warmed at this user's first connect, so connecting again reuses that
    // row.
    const before = sync.profileRequests.length;
    await connectAccount(owner, "chess_com", "Looper");
    expect(sync.profileRequests.slice(before)).toEqual([]);
  });

  it("reads a Lichess flair for either seat, and never an avatar", async () => {
    const created = await connectAccount(owner, "lichess", "Sea-Lion");
    if (!created.syncId) throw new Error("expected a first sync on a fresh connect");
    await harness.runSync(created.syncId);

    const game = await firstGameId(owner, "lichess");
    const body = await openGame(owner, game);
    for (const seat of [body.whiteIdentity, body.blackIdentity]) {
      expect(seat.flair).toBe(LICHESS_FLAIR);
      // Lichess has no profile pictures: the field exists and stays empty.
      expect(seat.avatarUrl).toBeNull();
    }
  });

  it("a failed ask keeps serving the stored identity", async () => {
    // The cache holds real values from the tests above, so an outage ages
    // the refresh window without blanking them and the response says what
    // the database kept.
    sync.setProfilesUp(false);
    try {
      const stale = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      await harness.db.update(providerProfiles).set({ fetchedAt: stale });

      const game = await firstGameId(owner);
      const body = await openGame(owner, game);
      expect(body.whiteIdentity).toEqual({ avatarUrl: CHESS_COM_AVATAR, flair: null });
      expect(body.blackIdentity).toEqual({ avatarUrl: RIVAL_AVATAR, flair: null });
    } finally {
      sync.setProfilesUp(true);
    }
  });

  it("an entry past its refresh window is asked for again", async () => {
    // The outage above re-stamped both rows, so aging them past the window
    // asks again and a healthy provider writes through.
    const stale = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    await harness.db.update(providerProfiles).set({ fetchedAt: stale });

    const before = sync.profileRequests.length;
    const game = await firstGameId(owner);
    const body = await openGame(owner, game);
    expect(body.whiteIdentity.avatarUrl).toBe(CHESS_COM_AVATAR);
    expect(body.blackIdentity.avatarUrl).toBe(RIVAL_AVATAR);
    expect(sync.profileRequests.slice(before)).toHaveLength(2);
  });

  it("a successful answer with no avatar clears the stored one", async () => {
    // Removal is a real event, so an OK without an avatar clears the cached
    // picture, unlike a failed ask.
    sync.setAvatarless(true);
    try {
      const stale = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      await harness.db.update(providerProfiles).set({ fetchedAt: stale });

      const game = await firstGameId(owner);
      const body = await openGame(owner, game);
      expect(body.whiteIdentity).toEqual({ avatarUrl: null, flair: null });
      expect(body.blackIdentity).toEqual({ avatarUrl: null, flair: null });
    } finally {
      sync.setAvatarless(false);
    }
  });
});
