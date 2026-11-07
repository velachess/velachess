// @vitest-environment node
import { parseResponse } from "hono/client";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  CLOSED_RUY_LOPEZ_AFTER_EIGHT_MOVES,
  CLOSED_RUY_LOPEZ_PGN,
  FOOLS_MATE_CHECKMATE,
  FOOLS_MATE_PGN,
} from "@velachess/fixtures";
import { games } from "@velachess/infra-db";

import { createApiHarness, type ApiHarness, type AuthedApp } from "./harness.ts";

let harness: ApiHarness;
let owner: AuthedApp;
let stranger: AuthedApp;

async function importPgn(app: AuthedApp, pgn: string) {
  const response = await app.api.games.import.$post({
    json: { pgn, participation: { mode: "white" } },
  });
  expect(response.status).toBe(200);
}

beforeAll(async () => {
  harness = await createApiHarness();
  owner = (await harness.signUp("thumbnails@api.test")).app;
  stranger = (await harness.signUp("thumbnails-stranger@api.test")).app;
  await importPgn(owner, CLOSED_RUY_LOPEZ_PGN);
  await importPgn(owner, FOOLS_MATE_PGN);
});

afterAll(async () => {
  await harness.close();
});

describe("GET /games thumbnailFen", () => {
  it("is the position after eight moves, or the last one of a shorter game", async () => {
    const page = await parseResponse(owner.api.games.$get({ query: {} }));

    expect(page.games.map((game) => game.thumbnailFen).toSorted()).toEqual(
      [CLOSED_RUY_LOPEZ_AFTER_EIGHT_MOVES, FOOLS_MATE_CHECKMATE].toSorted(),
    );
  });

  it("never carries the PGN", async () => {
    const page = await parseResponse(owner.api.games.$get({ query: {} }));

    for (const game of page.games) {
      expect(game).not.toHaveProperty("rawPgn");
    }
  });

  it("follows the page and the filters rather than the whole library", async () => {
    const first = await parseResponse(
      owner.api.games.$get({ query: { page: "1", pageSize: "1" } }),
    );
    const second = await parseResponse(
      owner.api.games.$get({ query: { page: "2", pageSize: "1" } }),
    );
    const seen = [...first.games, ...second.games].map((game) => game.thumbnailFen);

    expect(first.games).toHaveLength(1);
    expect(second.games).toHaveLength(1);
    expect(first.total).toBe(2);
    expect(new Set(seen).size).toBe(2);
  });

  it("is never derived from another user's games", async () => {
    const page = await parseResponse(stranger.api.games.$get({ query: {} }));

    expect(page.games).toEqual([]);
    expect(page.total).toBe(0);
  });

  it("is null for a stored PGN that cannot be read, without failing the list", async () => {
    const before = await parseResponse(owner.api.games.$get({ query: {} }));
    const target = before.games.find(
      (game) => game.thumbnailFen === CLOSED_RUY_LOPEZ_AFTER_EIGHT_MOVES,
    );
    await harness.db
      .update(games)
      .set({ rawPgn: '[Event "Broken"]\n[FEN "not a fen"]\n[SetUp "1"]\n\n1. e4 *\n' })
      .where(eq(games.id, target!.id));

    const page = await parseResponse(owner.api.games.$get({ query: {} }));

    expect(page.games).toHaveLength(2);
    expect(page.games.filter((game) => game.thumbnailFen === null)).toHaveLength(1);
  });
});
