// @vitest-environment node
/**
 * Manual PGN import, over HTTP with the real migrations. Pins the issue's
 * acceptance criteria: one library across sources, idempotent re-import,
 * duplicate-only success, per-game perspective in mixed-color files,
 * cross-user independence of the same file, no connected account, no
 * engine, and the existing judge → deviations flow afterwards.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  IMPORTED_PLAYER_NAME,
  MIXED_COLOR_PGN,
  NAMED_DEVIATION_GAME_PGN,
  NAMED_IN_BOOK_GAME_PGN,
  RUY_LOPEZ_REPERTOIRE_PGN,
} from "@velachess/fixtures";

import { createApiHarness, type ApiHarness, type AuthedApp } from "./harness.ts";

let harness: ApiHarness;

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

interface Library {
  games: { id: string; source: string; perspective: string | null }[];
  total: number;
}

async function library(app: AuthedApp): Promise<Library> {
  return (await (await app.request("/games")).json()) as Library;
}

beforeAll(async () => {
  harness = await createApiHarness();
});

afterAll(async () => {
  await harness.close();
});

describe("POST /games/import", () => {
  it("a mixed-color file resolves the player's seat per game", async () => {
    const owner = (await harness.signUp("pgn-owner@api.test")).app;

    const response = await owner.request(
      "/games/import",
      json({ pgn: MIXED_COLOR_PGN, playerName: IMPORTED_PLAYER_NAME }),
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
    const asWhite = await owner.request("/games?color=white");
    expect(((await asWhite.json()) as Library).total).toBe(1);

    // No connected account was created: PGN is a manual source, not a handle.
    const accounts = (await (await owner.request("/accounts")).json()) as unknown[];
    expect(accounts).toHaveLength(0);
  });

  it("re-importing the same file is a counted no-op, and duplicates alone still succeed", async () => {
    const owner = (await harness.signUp("pgn-again@api.test")).app;
    const body = { pgn: MIXED_COLOR_PGN, playerName: IMPORTED_PLAYER_NAME };

    await owner.request("/games/import", json(body));
    const again = await owner.request("/games/import", json(body));
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ imported: 0, duplicates: 2 });
    expect((await library(owner)).total).toBe(2);

    // A file whose every game is already present is a success, not an error.
    const duplicatesOnly = await owner.request(
      "/games/import",
      json({
        pgn: NAMED_IN_BOOK_GAME_PGN + NAMED_DEVIATION_GAME_PGN,
        playerName: IMPORTED_PLAYER_NAME,
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
    const body = json({ pgn: MIXED_COLOR_PGN, playerName: IMPORTED_PLAYER_NAME });

    expect((await alice.request("/games/import", body)).status).toBe(200);
    expect((await bob.request("/games/import", body)).status).toBe(200);

    expect((await library(alice)).total).toBe(2);
    expect((await library(bob)).total).toBe(2);
  });

  it("unparseable chunks are rejected without sinking the parseable ones", async () => {
    const owner = (await harness.signUp("pgn-mixed@api.test")).app;
    const response = await owner.request(
      "/games/import",
      json({
        pgn: "complete garbage\n\n" + NAMED_IN_BOOK_GAME_PGN,
        playerName: IMPORTED_PLAYER_NAME,
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      imported: 1,
      duplicates: 0,
      rejected: 1,
    });
  });

  it("an empty or blank upload answers invalid body", async () => {
    const owner = (await harness.signUp("pgn-empty@api.test")).app;
    expect((await owner.request("/games/import", json({ pgn: "" }))).status).toBe(400);
    expect((await owner.request("/games/import", json({}))).status).toBe(400);
  });
});

describe("imported games join the existing flow", () => {
  it("judge runs against the book, and the deviation reaches GET /deviations", async () => {
    const owner = (await harness.signUp("pgn-flow@api.test")).app;

    // The user declares preparation BEFORE importing, like a real setup.
    const repertoire = (await (
      await owner.request("/repertoires", json({ name: "Ruy", color: "white" }))
    ).json()) as { id: string };
    await owner.request(`/repertoires/${repertoire.id}/chapters`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Spanish", pgn: RUY_LOPEZ_REPERTOIRE_PGN }),
    });

    const imported = await owner.request(
      "/games/import",
      json({
        pgn: NAMED_DEVIATION_GAME_PGN + NAMED_IN_BOOK_GAME_PGN,
        playerName: IMPORTED_PLAYER_NAME,
      }),
    );
    const outcome = (await imported.json()) as { imported: number; judged: number };
    expect(outcome.imported).toBe(2);
    // Both games were judged by the pass that import itself ran.
    expect(outcome.judged).toBe(2);

    // The deviation the player left their own book with is listed.
    const deviations = (await (await owner.request("/deviations")).json()) as {
      gameId: string;
      playedSan: string | null;
    }[];
    expect(deviations).toHaveLength(1);
    expect(deviations[0]!.playedSan).toBe("Bc4");

    // Import never queued Stockfish — analysis waits for an opened game.
    const games = (await library(owner)).games;
    for (const game of games) {
      expect(await harness.deps.analysisQueue.getState(game.id)).toBe("none");
    }
  });
});
