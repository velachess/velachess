// @vitest-environment node
/**
 * Provider profile identity over the real route: an avatar read off
 * Chess.com and a flair read off Lichess land in the tracked account,
 * survive listing, and never cost a connection when the provider's
 * profile endpoint is down.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LICHESS_PGN_EXPORT } from "@velachess/fixtures";
import { chessComFixtureFetch } from "@velachess/test-utils";

import { createApiHarness, type ApiHarness, type AuthedApp } from "./harness.ts";

const CHESS_COM_AVATAR =
  "https://images.chesscomfiles.com/uploads/v1/user/461825478.97ae265f.200x200o.5fa38b32b080.jpg";
const LICHESS_FLAIR = "people.santa-claus-light-skin-tone";

/**
 * The suite's chess.com fixtures, plus the two profile endpoints the
 * connect slice now reads. `setProfilesUp(false)` blackholes them —
 * the failure mode every test below leans on.
 */
function fakeSyncFetch() {
  const base = chessComFixtureFetch();
  let profilesUp = true;

  const doFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (CHESS_COM_PROFILE_URL.test(url)) {
      if (!profilesUp) return new Response("not found", { status: 404 });
      return Response.json({
        username: url.split("/").pop(),
        avatar: CHESS_COM_AVATAR,
        country: "https://api.chess.com/pub/country/BR",
      });
    }
    if (url.startsWith("https://lichess.org/api/user/")) {
      if (!profilesUp) return new Response("not found", { status: 404 });
      return Response.json({
        id: "sea-lion",
        username: "Sea-Lion",
        flair: LICHESS_FLAIR,
      });
    }
    if (url.startsWith("https://lichess.org/api/games/user/")) {
      return new Response(LICHESS_PGN_EXPORT, {
        headers: { "content-type": "application/x-chess-pgn" },
      });
    }
    return base(input, init);
  }) as typeof globalThis.fetch;

  return { fetch: doFetch, setProfilesUp: (up: boolean) => void (profilesUp = up) };
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

interface AccountView {
  id: string;
  platform: string;
  username: string;
  avatarUrl: string | null;
  flair: string | null;
}

async function listAccounts(): Promise<AccountView[]> {
  return (await (await owner.request("/accounts")).json()) as AccountView[];
}

describe("provider profile identity", () => {
  it("a chess.com import stores the avatar the provider reports", async () => {
    const created = await owner.request(
      "/accounts",
      json({ platform: "chess_com", username: "Looper" }),
    );
    expect(created.status).toBe(201);
    const account = (await created.json()) as AccountView;
    expect(account.username).toBe("looper");
    expect(account.avatarUrl).toBe(CHESS_COM_AVATAR);
    // Chess.com has no flair concept — the field exists and stays empty.
    expect(account.flair).toBeNull();

    const listed = await listAccounts();
    expect(listed.find((entry) => entry.id === account.id)?.avatarUrl).toBe(
      CHESS_COM_AVATAR,
    );
  });

  it("a lichess import stores the flair, and never an avatar", async () => {
    const created = await owner.request(
      "/accounts",
      json({ platform: "lichess", username: "Sea-Lion" }),
    );
    expect(created.status).toBe(201);
    const account = (await created.json()) as AccountView;
    // Flair decorates the name; it is not a face, so avatar stays null
    // even though the connection succeeded.
    expect(account.flair).toBe(LICHESS_FLAIR);
    expect(account.avatarUrl).toBeNull();

    const listed = await listAccounts();
    expect(listed.find((entry) => entry.id === account.id)?.flair).toBe(LICHESS_FLAIR);
  });

  it("a re-import that cannot reach the profile keeps the identity already stored", async () => {
    // First import reads the avatar…
    await owner.request("/accounts", json({ platform: "chess_com", username: "looper" }));
    // …then the provider's profile endpoint goes down and the handle is
    // imported again (the documented way to refresh a connection).
    sync.setProfilesUp(false);
    try {
      const again = await owner.request(
        "/accounts",
        json({ platform: "chess_com", username: "looper" }),
      );
      expect(again.status).toBe(201);
      expect(((await again.json()) as AccountView).avatarUrl).toBe(CHESS_COM_AVATAR);
    } finally {
      sync.setProfilesUp(true);
    }
  });

  it("a dead profile endpoint costs the decoration, not the connection", async () => {
    sync.setProfilesUp(false);
    try {
      const created = await owner.request(
        "/accounts",
        json({ platform: "lichess", username: "sea-wolf" }),
      );
      expect(created.status).toBe(201);
      const account = (await created.json()) as AccountView;
      expect(account.avatarUrl).toBeNull();
      expect(account.flair).toBeNull();

      // The archive was filled regardless — the account works.
      const games = await owner.request(`/accounts/${account.id}/games`);
      expect(games.status).toBe(200);
    } finally {
      sync.setProfilesUp(true);
    }
  });
});
