// @vitest-environment node
/**
 * The library's time-class filter, over HTTP with the real migrations.
 *
 * Written before the rule moves out of `@velachess/infra-platforms`, to
 * pin what the SQL predicate answers today: games are bucketed by
 * estimated duration (initial + 40 × increment), each boundary is an
 * exclusive upper bound, and a game with no clock belongs to no class at
 * all. Every expectation below is a written-out class, never one the
 * production rule computed — a single-sourced rule must not also
 * single-source its own expectation.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApiHarness, type ApiHarness, type AuthedApp } from "./harness.ts";

let harness: ApiHarness;

interface LibraryRow {
  whiteName: string;
  timeControlInitialSeconds: number | null;
  timeControlIncrementSeconds: number | null;
}

interface Library {
  games: LibraryRow[];
  total: number;
}

/**
 * One game per clock, each with its own first move: deduplication is
 * `(user, account, movetext hash)`, so nine games sharing one movetext
 * would land as one row and eight no-ops.
 */
const CLOCKS: { name: string; timeControl: string | null; firstMove: string }[] = [
  { name: "tc-60-0", timeControl: "60", firstMove: "e4" },
  { name: "tc-179-0", timeControl: "179", firstMove: "d4" },
  { name: "tc-180-0", timeControl: "180", firstMove: "c4" },
  { name: "tc-60-3", timeControl: "60+3", firstMove: "Nf3" },
  { name: "tc-479-0", timeControl: "479", firstMove: "g3" },
  { name: "tc-480-0", timeControl: "480", firstMove: "b3" },
  { name: "tc-1499-0", timeControl: "1499", firstMove: "f4" },
  { name: "tc-1500-0", timeControl: "1500", firstMove: "Nc3" },
  { name: "tc-none", timeControl: null, firstMove: "e3" },
];

const LIBRARY_PGN = CLOCKS.map(
  ({ name, timeControl, firstMove }) => `[Event "${name}"]
[Site "?"]
[White "${name}"]
[Black "Invented Opponent"]
[Result "*"]
${timeControl === null ? "" : `[TimeControl "${timeControl}"]\n`}
1. ${firstMove} *
`,
).join("\n");

async function namesIn(app: AuthedApp, query: string): Promise<string[]> {
  const response = await app.request(query);
  expect(response.status).toBe(200);
  const library = (await response.json()) as Library;
  return library.games.map((game) => game.whiteName).toSorted();
}

let owner: AuthedApp;

beforeAll(async () => {
  harness = await createApiHarness();
  owner = (await harness.signUp("library-filters@api.test")).app;

  const response = await owner.request("/games/import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pgn: LIBRARY_PGN }),
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ imported: CLOCKS.length, rejected: 0 });
});

afterAll(async () => {
  await harness.close();
});

describe("GET /games?timeClass", () => {
  it("buckets by estimated duration, with the ceiling belonging to the next class", async () => {
    expect(await namesIn(owner, "/games?timeClass=bullet")).toEqual([
      "tc-179-0",
      "tc-60-0",
    ]);
    expect(await namesIn(owner, "/games?timeClass=blitz")).toEqual([
      "tc-180-0",
      "tc-479-0",
      "tc-60-3",
    ]);
    expect(await namesIn(owner, "/games?timeClass=rapid")).toEqual([
      "tc-1499-0",
      "tc-480-0",
    ]);
    expect(await namesIn(owner, "/games?timeClass=classical")).toEqual(["tc-1500-0"]);
  });

  it("counts the increment: 1+3 is blitz where 1+0 is bullet", async () => {
    // Both start from a 60-second clock; only the increment separates them.
    expect(await namesIn(owner, "/games?timeClass=bullet")).toContain("tc-60-0");
    expect(await namesIn(owner, "/games?timeClass=blitz")).toContain("tc-60-3");
  });

  it("leaves a game with no clock out of every class, without losing it", async () => {
    for (const timeClass of ["bullet", "blitz", "rapid", "classical"]) {
      // oxlint-disable-next-line eslint/no-await-in-loop
      expect(await namesIn(owner, `/games?timeClass=${timeClass}`)).not.toContain(
        "tc-none",
      );
    }

    const library = (await (await owner.request("/games")).json()) as Library;
    expect(library.total).toBe(CLOCKS.length);
    expect(library.games.map((game) => game.whiteName)).toContain("tc-none");
  });

  it("reports the page total of the filtered set, not of the library", async () => {
    const blitz = (await (
      await owner.request("/games?timeClass=blitz")
    ).json()) as Library;
    expect(blitz.total).toBe(3);
  });
});
