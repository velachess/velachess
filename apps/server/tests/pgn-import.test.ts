// @vitest-environment node
/**
 * Manual PGN import, over HTTP with the real migrations. Pins the issue's
 * acceptance criteria: one library across sources, idempotent re-import,
 * duplicate-only success, per-game perspective in mixed-color files,
 * cross-user independence of the same file, no connected account, no
 * and no engine.
 */
import { parseResponse } from "hono/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  IMPORTED_PLAYER_NAME,
  MIXED_COLOR_PGN,
  NAMED_SECOND_GAME_PGN,
  NAMED_FIRST_GAME_PGN,
} from "@velachess/fixtures";

import { createApiHarness, type ApiHarness, type AuthedApp } from "./harness.ts";

let harness: ApiHarness;

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

function library(app: AuthedApp) {
  return parseResponse(app.api.games.$get({ query: {} }));
}

beforeAll(async () => {
  harness = await createApiHarness();
});

afterAll(async () => {
  await harness.close();
});

const byName = (playerName: string) => ({ mode: "byName" as const, playerName });

describe("POST /games/import", () => {
  it("a mixed-color file resolves the player's seat per game", async () => {
    const owner = (await harness.signUp("pgn-owner@api.test")).app;

    const response = await owner.request(
      "/games/import",
      json({ pgn: MIXED_COLOR_PGN, participation: byName(IMPORTED_PLAYER_NAME) }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      imported: 2,
      duplicates: 0,
      rejected: 0,
    });

    // One library row per seat — the same person on both sides of the file.
    const seats = (await library(owner)).games.map((game) => game.perspective);
    expect(seats.toSorted()).toEqual(["black", "white"]);

    // The color filter reads those resolved seats.
    const asWhite = await parseResponse(
      owner.api.games.$get({ query: { color: "white" } }),
    );
    expect(asWhite.total).toBe(1);

    // No connected account was created: PGN is a manual source, not a handle.
    const accounts = await parseResponse(owner.api.accounts.$get());
    expect(accounts).toHaveLength(0);
  });

  it("re-importing the same file is a counted no-op, and duplicates alone still succeed", async () => {
    const owner = (await harness.signUp("pgn-again@api.test")).app;
    const body = { pgn: MIXED_COLOR_PGN, participation: byName(IMPORTED_PLAYER_NAME) };

    await owner.request("/games/import", json(body));
    const again = await owner.request("/games/import", json(body));
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ imported: 0, duplicates: 2 });
    expect((await library(owner)).total).toBe(2);

    // A file whose every game is already present is a success, not an error.
    const duplicatesOnly = await owner.request(
      "/games/import",
      json({
        pgn: NAMED_FIRST_GAME_PGN + NAMED_SECOND_GAME_PGN,
        participation: byName(IMPORTED_PLAYER_NAME),
      }),
    );
    expect(duplicatesOnly.status).toBe(200);
    expect(await duplicatesOnly.json()).toMatchObject({
      imported: 2,
      duplicates: 0,
    });
  });

  it("two users importing the same PGN each get their own copy", async () => {
    const alice = (await harness.signUp("pgn-alice@api.test")).app;
    const bob = (await harness.signUp("pgn-bob@api.test")).app;
    const body = json({
      pgn: MIXED_COLOR_PGN,
      participation: byName(IMPORTED_PLAYER_NAME),
    });

    expect((await alice.request("/games/import", body)).status).toBe(200);
    expect((await bob.request("/games/import", body)).status).toBe(200);

    const aliceIds = (await library(alice)).games.map(({ id }) => id);
    const bobIds = (await library(bob)).games.map(({ id }) => id);
    expect(aliceIds).toHaveLength(2);
    expect(bobIds).toHaveLength(2);
    expect(bobIds.filter((id) => aliceIds.includes(id))).toEqual([]);
  });

  it("unparseable chunks are rejected without sinking the parseable ones", async () => {
    const owner = (await harness.signUp("pgn-mixed@api.test")).app;
    const response = await owner.request(
      "/games/import",
      json({
        pgn: "complete garbage\n\n" + NAMED_FIRST_GAME_PGN,
        participation: byName(IMPORTED_PLAYER_NAME),
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      imported: 1,
      duplicates: 0,
      rejected: 1,
    });
  });

  it("pure garbage with no parseable game at all is never saved", async () => {
    const owner = (await harness.signUp("pgn-garbage@api.test")).app;
    const response = await owner.request(
      "/games/import",
      json({ pgn: "adkadsa", participation: byName(IMPORTED_PLAYER_NAME) }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ imported: 0, rejected: 1 });
    expect((await library(owner)).total).toBe(0);
  });

  it("an empty or blank upload answers invalid body", async () => {
    const owner = (await harness.signUp("pgn-empty@api.test")).app;
    expect((await owner.request("/games/import", json({ pgn: "" }))).status).toBe(400);
    expect((await owner.request("/games/import", json({}))).status).toBe(400);
  });

  it("rejects a body exceeding the server's 256 KiB limit", async () => {
    const owner = (await harness.signUp("pgn-oversized@api.test")).app;
    const huge = "x".repeat(300 * 1024);
    expect((await owner.request("/games/import", json({ pgn: huge }))).status).toBe(413);
  });

  it("forces White for every game regardless of the headers", async () => {
    const owner = (await harness.signUp("pgn-white@api.test")).app;
    const response = await owner.request(
      "/games/import",
      json({ pgn: MIXED_COLOR_PGN, participation: { mode: "white" } }),
    );
    expect(response.status).toBe(200);
    const seats = (await library(owner)).games.map((game) => game.perspective);
    expect(seats).toEqual(["white", "white"]);
  });

  it("rejects a malformed participation value", async () => {
    const owner = (await harness.signUp("pgn-bad-participation@api.test")).app;
    const response = await owner.request(
      "/games/import",
      json({ pgn: MIXED_COLOR_PGN, participation: { mode: "byName", playerName: "" } }),
    );
    expect(response.status).toBe(400);
  });
});

describe("imported games join the library", () => {
  it("lists them", async () => {
    const owner = (await harness.signUp("pgn-flow@api.test")).app;

    const outcome = await parseResponse(
      owner.api.games.import.$post({
        json: {
          pgn: NAMED_SECOND_GAME_PGN + NAMED_FIRST_GAME_PGN,
          participation: byName(IMPORTED_PLAYER_NAME),
        },
      }),
    );
    expect(outcome.imported).toBe(2);

    const games = (await library(owner)).games;
    expect(games).toHaveLength(2);
  });
});
