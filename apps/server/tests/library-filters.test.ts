// @vitest-environment node
/**
 * What the SQL predicate answers: games bucketed by estimated duration
 * (initial + 40 × increment), each boundary an exclusive upper bound, and a
 * game with no clock in no class at all. Every expectation is written out
 * rather than computed by the production rule.
 */
import { parseResponse } from "hono/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApiHarness, type ApiHarness, type AuthedApp } from "./harness.ts";

let harness: ApiHarness;

const TIME_CLASSES = ["bullet", "blitz", "rapid", "classical"] as const;
type TimeClass = (typeof TIME_CLASSES)[number];
type Outcome = "win" | "loss" | "draw";

/**
 * Each with its own first move, because deduplication is `(user, account,
 * movetext hash)` and nine games sharing a movetext land as one row.
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

async function labelsIn(app: AuthedApp, outcome: Outcome): Promise<string[]> {
  const library = await parseResponse(app.api.games.$get({ query: { outcome } }));
  return library.games.map((game) => game.openingName ?? "?").toSorted();
}

async function namesIn(
  app: AuthedApp,
  timeClass: TimeClass | TimeClass[],
): Promise<string[]> {
  const library = await parseResponse(app.api.games.$get({ query: { timeClass } }));
  return library.games.map((game) => game.whiteName).toSorted();
}

let owner: AuthedApp;
let player: AuthedApp;

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
    expect(await namesIn(owner, "bullet")).toEqual(["tc-179-0", "tc-60-0"]);
    expect(await namesIn(owner, "blitz")).toEqual(["tc-180-0", "tc-479-0", "tc-60-3"]);
    expect(await namesIn(owner, "rapid")).toEqual(["tc-1499-0", "tc-480-0"]);
    expect(await namesIn(owner, "classical")).toEqual(["tc-1500-0"]);
  });

  it("counts the increment: 1+3 is blitz where 1+0 is bullet", async () => {
    // Both start from a 60-second clock: only the increment separates
    // them.
    expect(await namesIn(owner, "bullet")).toContain("tc-60-0");
    expect(await namesIn(owner, "blitz")).toContain("tc-60-3");
  });

  it("leaves a game with no clock out of every class, without losing it", async () => {
    for (const timeClass of TIME_CLASSES) {
      expect(await namesIn(owner, timeClass)).not.toContain("tc-none");
    }

    const library = await parseResponse(owner.api.games.$get({ query: {} }));
    expect(library.total).toBe(CLOCKS.length);
    expect(library.games.map((game) => game.whiteName)).toContain("tc-none");
  });

  it("reports the page total of the filtered set, not of the library", async () => {
    const blitz = await parseResponse(
      owner.api.games.$get({ query: { timeClass: "blitz" } }),
    );
    expect(blitz.total).toBe(3);
  });
});

/**
 * From the player's seat, not the scoresheet's: whether "1-0" is a win
 * depends on which side they were, so the filter reads the result and the
 * resolved seat together. The SQL predicate is one of two independent
 * expressions of that rule.
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

describe("GET /games?outcome", () => {
  it("reads the result from the player's seat, not the scoresheet's", async () => {
    expect(await labelsIn(player, "win")).toEqual(["win-as-black", "win-as-white"]);
    expect(await labelsIn(player, "loss")).toEqual(["loss-as-black", "loss-as-white"]);
  });

  it("calls a draw a draw from either seat, and with no seat at all", async () => {
    expect(await labelsIn(player, "draw")).toEqual([
      "draw-as-black",
      "draw-as-white",
      "drawn-unattributed",
    ]);
  });

  it("leaves a decided game with no resolved seat out of win and loss", async () => {
    // The result is real, the seat is not.
    expect(await labelsIn(player, "win")).not.toContain("decided-unattributed");
    expect(await labelsIn(player, "loss")).not.toContain("decided-unattributed");
  });

  it("leaves an unfinished game out of every outcome, without losing it", async () => {
    for (const outcome of ["win", "loss", "draw"] as const) {
      expect(await labelsIn(player, outcome)).not.toContain("unfinished-as-white");
    }

    const library = await parseResponse(player.api.games.$get({ query: {} }));
    expect(library.total).toBe(OUTCOMES.length);
    expect(library.games.map((game) => game.openingName)).toContain(
      "unfinished-as-white",
    );
  });

  it("offers only the three decided outcomes as filter values", async () => {
    // A state a game can be in, not a filter the API takes.
    const response = await player.request("/games?outcome=unfinished");
    expect(response.status).toBe(400);
  });
});

describe("GET /games?timeClass repeated", () => {
  it("takes any of the classes, and a single value still arrives as one", async () => {
    expect(await namesIn(owner, ["bullet", "blitz"])).toEqual([
      "tc-179-0",
      "tc-180-0",
      "tc-479-0",
      "tc-60-0",
      "tc-60-3",
    ]);
    expect(await namesIn(owner, ["classical"])).toEqual(["tc-1500-0"]);
  });

  it("counts the union, not one class, in the page total", async () => {
    const both = await parseResponse(
      owner.api.games.$get({ query: { timeClass: ["rapid", "classical"] } }),
    );
    expect(both.total).toBe(3);
  });

  it("refuses a class it does not offer, rather than ignoring it", async () => {
    const response = await owner.request("/games?timeClass=blitz&timeClass=hyper");
    expect(response.status).toBe(400);
  });
});

/** `opposite(perspective)` in `@velachess/chess`, which the SQL predicate
 * is the second expression of. */
async function opponentLabels(app: AuthedApp, opponent: string): Promise<string[]> {
  const library = await parseResponse(app.api.games.$get({ query: { opponent } }));
  return library.games.map((game) => game.openingName ?? "?").toSorted();
}

describe("GET /games?opponent", () => {
  it("matches the other seat, case-insensitively", async () => {
    expect(await opponentLabels(player, "RIVAL")).toEqual([
      "draw-as-black",
      "draw-as-white",
      "loss-as-black",
      "loss-as-white",
      "unfinished-as-white",
      "win-as-black",
      "win-as-white",
    ]);
  });

  it("never matches the player's own seat", async () => {
    expect(await opponentLabels(player, OUTCOME_PLAYER)).toEqual([]);
  });

  it("matches either name when nothing attributed the game", async () => {
    expect(await opponentLabels(player, "Stranger One")).toEqual([
      "decided-unattributed",
      "drawn-unattributed",
    ]);
    expect(await opponentLabels(player, "Stranger Two")).toEqual([
      "decided-unattributed",
      "drawn-unattributed",
    ]);
  });

  it("reads a wildcard as a character, not as a pattern", async () => {
    expect(await opponentLabels(player, "%")).toEqual([]);
    expect(await opponentLabels(player, "_")).toEqual([]);
  });

  it("narrows together with a filter rather than replacing it", async () => {
    const won = await parseResponse(
      player.api.games.$get({ query: { opponent: "rival", outcome: "win" } }),
    );
    expect(won.games.map((game) => game.openingName).toSorted()).toEqual([
      "win-as-black",
      "win-as-white",
    ]);
    expect(won.total).toBe(2);
  });
});

describe("GET /games?source", () => {
  it("keeps only the rows that came from that source", async () => {
    const pasted = await parseResponse(
      owner.api.games.$get({ query: { source: "pgn" } }),
    );
    expect(pasted.total).toBe(CLOCKS.length);

    const synced = await parseResponse(
      owner.api.games.$get({ query: { source: "lichess" } }),
    );
    expect(synced.total).toBe(0);
  });
});
