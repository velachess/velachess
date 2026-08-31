import { describe, expect, it } from "vitest";

import { rankFindings } from "../finding.ts";
import { openingWeaknessFindings } from "../opening-weakness.ts";
import { performanceTrendFinding } from "../performance-trend.ts";
import { phasePerformanceFinding } from "../phase-performance.ts";
import { recurringMistakeFinding } from "../recurring-mistake.ts";
import type { GameSample, MoveCategory, SamplePly } from "../sample.ts";
import { winningPositionBlundersFinding } from "../winning-position-blunders.ts";

/**
 * Each source, at its floors: what makes it speak, and — the half that
 * matters more — what keeps it silent. A finding drawn from a thin or
 * noisy sample is worse than none, so most assertions here are `null`.
 */

/** Middlegame FEN (10 majors+minors, full-enough back ranks). */
const MIDDLEGAME_FEN = "r1bqkb1r/pppppppp/8/8/8/8/PPPPPPPP/R1BQKB1R w - - 0 1";
/** Endgame FEN (two majors in total). */
const ENDGAME_FEN = "4k3/1r6/8/8/8/8/6R1/4K3 w - - 0 1";

let nextGameId = 0;

function ply(overrides: Partial<SamplePly> = {}): SamplePly {
  return {
    ply: 1,
    fen: MIDDLEGAME_FEN,
    category: "good",
    winChanceLoss: 0,
    evalBefore: { cp: 0 },
    ...overrides,
  };
}

function game(overrides: Partial<GameSample> = {}): GameSample {
  nextGameId++;
  return {
    id: `game-${nextGameId}`,
    playedAt: new Date(Date.UTC(2026, 0, 1) + nextGameId * 86_400_000),
    perspective: "white",
    result: "1-0",
    whiteRating: 1500,
    blackRating: 1500,
    openingName: "London System",
    openingEco: "D02",
    plies: null,
    ...overrides,
  };
}

/** White's own plies (odd), all in one phase, n of them bad. */
function ownPliesWith(
  total: number,
  bad: number,
  category: MoveCategory,
  fen = MIDDLEGAME_FEN,
): SamplePly[] {
  return Array.from({ length: total }, (_, index) =>
    ply({
      ply: index * 2 + 1,
      fen,
      category: index < bad ? category : "good",
      winChanceLoss: index < bad ? 0.25 : 0,
    }),
  );
}

describe("recurringMistakeFinding", () => {
  it("names the bucket where your blunders concentrate", () => {
    // 60 middlegame moves with 10 blunders, 60 endgame moves with 0:
    // middlegame blunder rate 1/6 vs overall 1/12 — a real lift.
    const finding = recurringMistakeFinding([
      game({ plies: ownPliesWith(60, 10, "blunder") }),
      game({ plies: ownPliesWith(60, 0, "blunder", ENDGAME_FEN) }),
    ]);

    expect(finding).not.toBeNull();
    expect(finding!.id).toBe("recurring-mistake:blunder:middlegame");
    expect(finding!.section).toBe("training");
    expect(finding!.evidence.mistakes).toBe(10);
    expect(finding!.evidence.ownMovesInPhase).toBe(60);
    expect(finding!.evidence.rate).toBeCloseTo(10 / 60);
    expect(finding!.evidence.overallRate).toBeCloseTo(10 / 120);
    // The evidence names the opening the games shared — supporting, not grouping.
    expect(finding!.evidence.topOpening).toEqual({
      name: "London System",
      mistakes: 10,
    });
  });

  it("stays silent under the occurrence floor", () => {
    // 7 blunders is one short of the floor, however lopsided the rate.
    expect(
      recurringMistakeFinding([
        game({ plies: ownPliesWith(60, 7, "blunder") }),
        game({ plies: ownPliesWith(60, 0, "blunder", ENDGAME_FEN) }),
      ]),
    ).toBeNull();
  });

  it("stays silent when mistakes are merely proportional to exposure", () => {
    // Same rate in both phases: no bucket stands out, nothing to say.
    expect(
      recurringMistakeFinding([
        game({ plies: ownPliesWith(60, 9, "blunder") }),
        game({ plies: ownPliesWith(60, 9, "blunder", ENDGAME_FEN) }),
      ]),
    ).toBeNull();
  });

  it("never blames a game it cannot attribute", () => {
    expect(
      recurringMistakeFinding([
        game({ perspective: null, plies: ownPliesWith(120, 30, "blunder") }),
      ]),
    ).toBeNull();
  });
});

describe("phasePerformanceFinding", () => {
  it("reports the phase that deviates, with every phase in evidence", () => {
    const finding = phasePerformanceFinding([
      game({ plies: ownPliesWith(100, 20, "mistake") }),
      game({ plies: ownPliesWith(100, 4, "mistake", ENDGAME_FEN) }),
    ]);

    expect(finding).not.toBeNull();
    expect(finding!.id).toBe("phase-performance:middlegame");
    expect(finding!.evidence.errorRate).toBeCloseTo(0.2);
    expect(finding!.evidence.overallErrorRate).toBeCloseTo(0.12);
    // All phases calculated; the unplayed one carries a null rate rather
    // than a confident zero.
    const opening = finding!.evidence.byPhase.find((entry) => entry.phase === "opening");
    expect(opening).toEqual({ phase: "opening", errors: 0, ownMoves: 0, rate: null });
  });

  it("stays silent under the exposure floor", () => {
    expect(
      phasePerformanceFinding([game({ plies: ownPliesWith(70, 20, "mistake") })]),
    ).toBeNull();
  });
});

describe("winningPositionBlundersFinding", () => {
  const winning = (bad: boolean, index: number) =>
    ply({
      ply: index * 2 + 1,
      evalBefore: { cp: 250 },
      category: bad ? "blunder" : "good",
      winChanceLoss: bad ? 0.35 : 0.01,
    });

  it("measures conversion, not raw blunders", () => {
    const plies = Array.from({ length: 25 }, (_, index) => winning(index < 5, index));
    const finding = winningPositionBlundersFinding([game({ plies })]);

    expect(finding).not.toBeNull();
    expect(finding!.evidence.winningPositions).toBe(25);
    expect(finding!.evidence.throws).toBe(5);
    expect(finding!.weight).toBeCloseTo(0.2);
    expect(finding!.evidence.worst?.winChanceLoss).toBeCloseTo(0.35);
  });

  it("reads the eval from the mover's side, not White's", () => {
    // Black to move at -250 White-POV is WINNING for black; at +250 it
    // is lost, and a blunder there is not a conversion failure.
    const asBlack = (cp: number, index: number) =>
      ply({
        ply: index * 2 + 2,
        evalBefore: { cp },
        category: "blunder",
        winChanceLoss: 0.35,
      });
    const losing = winningPositionBlundersFinding([
      game({
        perspective: "black",
        plies: Array.from({ length: 25 }, (_, index) => asBlack(250, index)),
      }),
    ]);
    expect(losing).toBeNull();

    const winningForBlack = winningPositionBlundersFinding([
      game({
        perspective: "black",
        plies: Array.from({ length: 25 }, (_, index) => asBlack(-250, index)),
      }),
    ]);
    expect(winningForBlack).not.toBeNull();
  });

  it("stays silent with too few winning positions to judge conversion", () => {
    const plies = Array.from({ length: 10 }, (_, index) => winning(index < 5, index));
    expect(winningPositionBlundersFinding([game({ plies })])).toBeNull();
  });
});

describe("openingWeaknessFindings", () => {
  const gamesWith = (opening: string, results: ("1-0" | "0-1")[]) =>
    results.map((result) => game({ openingName: opening, result }));

  it("compares an opening against the player's own baseline", () => {
    const findings = openingWeaknessFindings([
      // Baseline lifted by 15 wins elsewhere…
      ...gamesWith(
        "Italian Game",
        Array.from({ length: 15 }, () => "1-0" as const),
      ),
      // …against a Sicilian that keeps losing.
      ...gamesWith("Sicilian Defense", ["0-1", "0-1", "0-1", "0-1", "1-0"]),
    ]);

    expect(findings).toHaveLength(1);
    expect(findings[0]!.id).toBe("opening-weakness:Sicilian Defense");
    expect(findings[0]!.evidence.games).toBe(5);
    expect(findings[0]!.evidence.winRate).toBeCloseTo(0.2);
    expect(findings[0]!.evidence.baselineWinRate).toBeCloseTo(16 / 20);
  });

  it("stays silent below the per-opening sample floor", () => {
    expect(
      openingWeaknessFindings([
        ...gamesWith(
          "Italian Game",
          Array.from({ length: 16 }, () => "1-0" as const),
        ),
        ...gamesWith("Sicilian Defense", ["0-1", "0-1", "0-1", "0-1"]),
      ]),
    ).toHaveLength(0);
  });

  it("stays silent when the whole sample is too small to be a baseline", () => {
    expect(
      openingWeaknessFindings([
        ...gamesWith(
          "Italian Game",
          Array.from({ length: 10 }, () => "1-0" as const),
        ),
        ...gamesWith("Sicilian Defense", ["0-1", "0-1", "0-1", "0-1", "0-1"]),
      ]),
    ).toHaveLength(0);
  });
});

describe("performanceTrendFinding", () => {
  const run = (results: ("1-0" | "0-1")[]) => results.map((result) => game({ result }));

  it("compares the last twenty against the twenty before", () => {
    const finding = performanceTrendFinding([
      ...run(Array.from({ length: 20 }, () => "0-1" as const)),
      ...run(Array.from({ length: 20 }, () => "1-0" as const)),
    ]);

    expect(finding).not.toBeNull();
    expect(finding!.evidence.previous.winRate).toBe(0);
    expect(finding!.evidence.latest.winRate).toBe(1);
    expect(finding!.weight).toBe(1);
    // No analysed games in either window: the per-game mistake metrics
    // are honestly null, not zero.
    expect(finding!.evidence.latest.mistakesPerGame).toBeNull();
    expect(finding!.evidence.latest.averageRating).toBe(1500);
  });

  it("stays silent under forty dated games", () => {
    expect(
      performanceTrendFinding(run(Array.from({ length: 39 }, () => "1-0" as const))),
    ).toBeNull();
  });

  it("stays silent when the two windows score the same", () => {
    const alternating = Array.from({ length: 40 }, (_, index) =>
      index % 2 === 0 ? ("1-0" as const) : ("0-1" as const),
    );
    expect(performanceTrendFinding(run(alternating))).toBeNull();
  });
});

describe("rankFindings across heterogeneous kinds", () => {
  it("orders by measured weight, ties on id, input untouched", () => {
    const input = [
      { id: "recurring-mistake:blunder:middlegame", weight: 0.04 },
      { id: "performance-trend", weight: 0.3 },
      { id: "opening-weakness:Sicilian Defense", weight: 0.3 },
    ];

    const ranked = rankFindings(input);
    expect(ranked.map((finding) => finding.id)).toEqual([
      "opening-weakness:Sicilian Defense",
      "performance-trend",
      "recurring-mistake:blunder:middlegame",
    ]);
    // Stable for equal data, and non-mutating.
    expect(rankFindings(input.toReversed()).map((f) => f.id)).toEqual(
      ranked.map((f) => f.id),
    );
    expect(input[0]!.id).toBe("recurring-mistake:blunder:middlegame");
  });
});
