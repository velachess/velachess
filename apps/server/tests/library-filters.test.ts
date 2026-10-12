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
  /** Every seeded game carries its case in its `[Opening]` header. */
  openingName: string | null;
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

async function labelsIn(app: AuthedApp, query: string): Promise<string[]> {
  const response = await app.request(query);
  expect(response.status).toBe(200);
  const library = (await response.json()) as Library;
  return library.games.map((game) => game.openingName ?? "?").toSorted();
}

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

/**
 * Won, lost or drew — from the player's seat, not the scoresheet's. The
 * scoresheet says "1-0"; whether that is a win depends on which side the
 * player was, so the filter has to read the result and the resolved seat
 * together. Pinned here before the rule is consolidated, because the SQL
 * predicate is one of two independent expressions of it today.
 */
const OUTCOME_PLAYER = "Outcome Player";

const OUTCOMES: {
  label: string;
  white: string;
  black: string;
  result: string;
  firstMove: string;
}[] = [
  {
    label: "win-as-white",
    white: OUTCOME_PLAYER,
    black: "Rival",
    result: "1-0",
    firstMove: "e4",
  },
  {
    label: "win-as-black",
    white: "Rival",
    black: OUTCOME_PLAYER,
    result: "0-1",
    firstMove: "d4",
  },
  {
    label: "loss-as-white",
    white: OUTCOME_PLAYER,
    black: "Rival",
    result: "0-1",
    firstMove: "c4",
  },
  {
    label: "loss-as-black",
    white: "Rival",
    black: OUTCOME_PLAYER,
    result: "1-0",
    firstMove: "Nf3",
  },
  {
    label: "draw-as-white",
    white: OUTCOME_PLAYER,
    black: "Rival",
    result: "1/2-1/2",
    firstMove: "g3",
  },
  {
    label: "draw-as-black",
    white: "Rival",
    black: OUTCOME_PLAYER,
    result: "1/2-1/2",
    firstMove: "b3",
  },
  {
    label: "unfinished-as-white",
    white: OUTCOME_PLAYER,
    black: "Rival",
    result: "*",
    firstMove: "f4",
  },
  {
    label: "decided-unattributed",
    white: "Stranger One",
    black: "Stranger Two",
    result: "1-0",
    firstMove: "Nc3",
  },
  {
    label: "drawn-unattributed",
    white: "Stranger One",
    black: "Stranger Two",
    result: "1/2-1/2",
    firstMove: "e3",
  },
];

const OUTCOMES_PGN = OUTCOMES.map(
  ({ label, white, black, result, firstMove }) => `[Event "${label}"]
[Site "?"]
[White "${white}"]
[Black "${black}"]
[Result "${result}"]
[Opening "${label}"]

1. ${firstMove} ${result}
`,
).join("\n");

describe("GET /games?outcome", () => {
  let player: AuthedApp;

  beforeAll(async () => {
    player = (await harness.signUp("library-outcomes@api.test")).app;

    const response = await player.request("/games/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pgn: OUTCOMES_PGN,
        // The two unattributed games name neither side as the uploader, so
        // they import with no seat at all — which is a fact, not a gap.
        participation: { mode: "byName", playerName: OUTCOME_PLAYER },
      }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      imported: OUTCOMES.length,
      rejected: 0,
    });
  });

  it("reads the result from the player's seat, not the scoresheet's", async () => {
    expect(await labelsIn(player, "/games?outcome=win")).toEqual([
      "win-as-black",
      "win-as-white",
    ]);
    expect(await labelsIn(player, "/games?outcome=loss")).toEqual([
      "loss-as-black",
      "loss-as-white",
    ]);
  });

  it("calls a draw a draw from either seat, and with no seat at all", async () => {
    expect(await labelsIn(player, "/games?outcome=draw")).toEqual([
      "draw-as-black",
      "draw-as-white",
      "drawn-unattributed",
    ]);
  });

  it("leaves a decided game with no resolved seat out of win and loss", async () => {
    // Nobody can be said to have won it: the result is real, the seat is not.
    expect(await labelsIn(player, "/games?outcome=win")).not.toContain(
      "decided-unattributed",
    );
    expect(await labelsIn(player, "/games?outcome=loss")).not.toContain(
      "decided-unattributed",
    );
  });

  it("leaves an unfinished game out of every outcome, without losing it", async () => {
    for (const outcome of ["win", "loss", "draw"]) {
      expect(await labelsIn(player, `/games?outcome=${outcome}`)).not.toContain(
        "unfinished-as-white",
      );
    }

    const library = (await (await player.request("/games")).json()) as Library;
    expect(library.total).toBe(OUTCOMES.length);
    expect(library.games.map((game) => game.openingName)).toContain(
      "unfinished-as-white",
    );
  });

  it("offers only the three decided outcomes as filter values", async () => {
    // `unfinished` is a state a game can be in, not a filter the API takes.
    const response = await player.request("/games?outcome=unfinished");
    expect(response.status).toBe(400);
  });
});
