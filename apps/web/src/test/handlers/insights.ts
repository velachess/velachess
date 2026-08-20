import { http, HttpResponse } from "msw";

/**
 * `GET /api/insights` — an envelope of dataset coverage plus two
 * findings, ranked, in the state where a person has both books judged.
 *
 * Both directions are here on purpose. A fixture carrying only the
 * flattering one would let a card that can never say "your book is
 * costing you" pass, and that is the failure this screen exists to
 * avoid. The order is the server's — white's gap (0.29) outranks
 * black's (0.18) — so a test can assert the screen did not re-sort.
 */
/** The dataset behind the request — once, on the envelope, per the
 * contract; never repeated on findings. */
const insightsCoverage = {
  gamesConsidered: 64,
  deeplyAnalysedGames: 21,
  coverage: 21 / 64,
};

export const insightFindings = [
  {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    kind: "book-advantage" as const,
    section: "openings" as const,
    scope: "all-games" as const,
    subject: {
      repertoireId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      name: "White repertoire",
      color: "white" as const,
    },
    evidence: {
      inBookGames: 34,
      inBookWinRate: 0.7,
      outOfBookGames: 18,
      outOfBookWinRate: 0.41,
      judgedGames: 52,
      adherenceRate: 0.65,
      averagePrepDepth: 9.4,
    },
    weight: 0.29,
  },
  {
    id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    kind: "book-disadvantage" as const,
    section: "openings" as const,
    scope: "all-games" as const,
    subject: {
      repertoireId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      name: "Caro-Kann",
      color: "black" as const,
    },
    evidence: {
      inBookGames: 12,
      inBookWinRate: 0.33,
      outOfBookGames: 9,
      outOfBookWinRate: 0.51,
      judgedGames: 21,
      adherenceRate: 0.57,
      averagePrepDepth: 6.2,
    },
    weight: 0.18,
  },
];

/**
 * One finding per non-adherence kind, ranked the way the server would
 * rank them. Shapes copied from the slice's exported evidence types —
 * a fixture that drifted from the real contract would let the screen
 * pass against an API that does not exist.
 */
const trendFinding = {
  id: "performance-trend",
  kind: "performance-trend" as const,
  section: "performance" as const,
  scope: "all-games" as const,
  evidence: {
    windowSize: 20,
    latest: {
      games: 20,
      decided: 18,
      winRate: 0.67,
      averageRating: 1541,
      analysedGames: 9,
      mistakesPerGame: 1.2,
      blundersPerGame: 0.4,
    },
    previous: {
      games: 20,
      decided: 19,
      winRate: 0.42,
      averageRating: 1512,
      analysedGames: 8,
      mistakesPerGame: 2.1,
      blundersPerGame: 0.9,
    },
  },
  weight: 0.25,
};

const restFindings = [
  {
    id: "opening-weakness:Sicilian Defense",
    kind: "opening-weakness" as const,
    section: "openings" as const,
    scope: "all-games" as const,
    evidence: {
      openingName: "Sicilian Defense",
      openingEco: "B20",
      games: 8,
      winRate: 0.25,
      baselineWinRate: 0.55,
      baselineGames: 64,
    },
    weight: 0.17,
  },
  {
    id: "winning-position-blunders",
    kind: "winning-position-blunders" as const,
    section: "training" as const,
    scope: "analysed-games" as const,
    evidence: {
      throws: 8,
      winningPositions: 46,
      rate: 0.174,
      gamesAffected: 7,
      gamesAnalysed: 21,
      worst: { gameId: "game-1", ply: 33, winChanceLoss: 0.61 },
    },
    weight: 0.174,
  },
  {
    id: "phase-performance:middlegame",
    kind: "phase-performance" as const,
    section: "phases" as const,
    scope: "analysed-games" as const,
    evidence: {
      phase: "middlegame" as const,
      errorRate: 0.14,
      overallErrorRate: 0.09,
      ownMovesInPhase: 420,
      totalOwnMoves: 910,
      gamesAnalysed: 21,
      byPhase: [
        { phase: "opening" as const, errors: 12, ownMoves: 260, rate: 0.046 },
        { phase: "middlegame" as const, errors: 59, ownMoves: 420, rate: 0.14 },
        { phase: "endgame" as const, errors: 11, ownMoves: 230, rate: 0.048 },
      ],
    },
    weight: 0.05,
  },
  {
    id: "recurring-mistake:blunder:middlegame",
    kind: "recurring-mistake" as const,
    section: "training" as const,
    scope: "analysed-games" as const,
    evidence: {
      phase: "middlegame" as const,
      category: "blunder" as const,
      mistakes: 19,
      ownMovesInPhase: 420,
      rate: 0.045,
      overallRate: 0.021,
      gamesAnalysed: 21,
      topOpening: { name: "London System", mistakes: 6 },
    },
    weight: 0.024,
  },
];

/** Server order is descending weight — the fixture keeps it that way so
 * a test can assert the screen did not re-sort. */
export const heterogeneousFindings = [
  insightFindings[0]!, // 0.29  adherence, white
  trendFinding, //        0.25  performance-trend
  insightFindings[1]!, // 0.18  adherence, black
  ...restFindings.toSorted((a, b) => b.weight - a.weight),
];

/** The shape the server actually sends: coverage once, findings ranked. */
export function insightsReport(findings: unknown[]) {
  return { coverage: insightsCoverage, findings };
}

export const insightsHandlers = [
  http.get("/api/insights", () => HttpResponse.json(insightsReport(insightFindings))),
];
