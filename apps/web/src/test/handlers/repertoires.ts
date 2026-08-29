import { http, HttpResponse } from "msw";

import {
  INITIAL_FEN,
  makeFen,
  makeUci,
  parseSan,
  positionFromFen,
  positionKeyOf,
} from "@velachess/chess";

/**
 * `/api/repertoires` — the two fixed books, in every state the screens
 * distinguish: configured with chapters, and not configured at all.
 *
 * Trees are BUILT, not hand-typed: position keys feed a real board via
 * `epdToFen`, and a typo'd EPD would render a broken position the test
 * would then assert against. The builder plays the SANs the way the
 * server's tree builder does, so the fixture cannot drift from chess.
 */

/**
 * The chapter view the server sends, built by actually playing the moves
 * — labels, playable FENs and squares included. Hand-typing them would
 * let the fixture drift from chess and from the real formatter.
 */
interface FixtureMove {
  san: string;
  label: string;
  positionKey: string;
  fen: string;
  from: string;
  to: string;
  ply: number;
  isOwnTurn: boolean;
  prepared: { san: string; from: string; to: string; at: FixtureCursor }[];
}
interface FixtureCursor {
  line: number;
  move: number;
}

function playedMove(fen: string, san: string, ply: number, atLineStart: boolean) {
  const position = positionFromFen(fen).unwrap();
  const move = parseSan(position, san);
  if (!move) throw new Error(`fixture SAN is illegal here: ${san}`);
  const uci = makeUci(move);
  position.play(move);
  const after = makeFen(position.toSetup());
  const moveNumber = Math.ceil(ply / 2);
  return {
    san,
    label:
      ply % 2 === 1
        ? `${moveNumber}. ${san}`
        : atLineStart
          ? `${moveNumber}... ${san}`
          : san,
    positionKey: positionKeyOf(after),
    fen: after,
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    ply,
    isOwnTurn: after.includes(" w "),
  };
}

/** Plays a sequence of SANs into one line of the view's shape. */
function lineOf(sans: string[], startFen: string, startPly: number): FixtureMove[] {
  let fen = startFen;
  return sans.map((san, index) => {
    const move = playedMove(fen, san, startPly + index, index === 0);
    fen = move.fen;
    return { ...move, prepared: [] };
  });
}

const EMPTY_OUTCOMES = {
  held: 0,
  playerLeft: 0,
  opponentLeft: 0,
  repertoireEnded: 0,
  unmatched: 0,
};

export const WHITE_REPERTOIRE_ID = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
export const FRENCH_CHAPTER_ID = "cccccccc-1111-4111-8111-cccccccccccc";
const CARO_CHAPTER_ID = "cccccccc-2222-4222-8222-cccccccccccc";

const whiteSummary = {
  id: WHITE_REPERTOIRE_ID,
  userId: "user-1",
  name: "White repertoire",
  color: "white" as const,
  source: "manual" as const,
  createdAt: "2026-08-01T10:00:00Z",
  updatedAt: "2026-08-01T10:00:00Z",
  adherence: {
    judgedGames: 24,
    skippedGames: 2,
    faithfulGames: 18,
    adherenceRate: 0.75,
    averagePrepDepth: 8.4,
    inBook: { total: 18, wins: 11, draws: 3, losses: 4, winRate: 11 / 15 },
    outOfBook: { total: 6, wins: 2, draws: 1, losses: 3, winRate: 2 / 5 },
  },
  chapterCount: 2,
  gaps: 3,
  training: { due: 4, fresh: 7 },
};

/** 1. e4 e6 2. d4 d5 with the 2. Nc3 d5 variation — the shape the real
 * formatter produces: mainline first, variation as its own line. */
const mainline = lineOf(["e4", "e6", "d4", "d5"], INITIAL_FEN, 1);
const variation = lineOf(["Nc3", "d5"], mainline[1]!.fen, 3);

/** Each move answers with what follows it, cursors included. */
function withPrepared(): { lines: FixtureLine[]; start: FixtureStart } {
  const link = (move: FixtureMove, at: FixtureCursor) => ({
    san: move.san,
    from: move.from,
    to: move.to,
    at,
  });

  mainline[0]!.prepared = [link(mainline[1]!, { line: 0, move: 1 })];
  mainline[1]!.prepared = [
    link(mainline[2]!, { line: 0, move: 2 }),
    link(variation[0]!, { line: 1, move: 0 }),
  ];
  mainline[2]!.prepared = [link(mainline[3]!, { line: 0, move: 3 })];
  variation[0]!.prepared = [link(variation[1]!, { line: 1, move: 1 })];

  return {
    start: {
      positionKey: positionKeyOf(INITIAL_FEN),
      fen: INITIAL_FEN,
      isOwnTurn: true,
      prepared: [link(mainline[0]!, { line: 0, move: 0 })],
    },
    lines: [
      { depth: 0, branchesFrom: null, prefix: [], moves: mainline },
      {
        depth: 1,
        branchesFrom: { line: 0, move: 2 },
        prefix: [
          { label: mainline[0]!.label, at: { line: 0, move: 0 } },
          { label: mainline[1]!.label, at: { line: 0, move: 1 } },
        ],
        moves: variation,
      },
    ],
  };
}

interface FixtureLine {
  depth: number;
  branchesFrom: FixtureCursor | null;
  prefix: { label: string; at: FixtureCursor }[];
  moves: FixtureMove[];
}
interface FixtureStart {
  positionKey: string;
  fen: string;
  isOwnTurn: boolean;
  prepared: { san: string; from: string; to: string; at: FixtureCursor }[];
}

const frenchView = withPrepared();

const frenchChapterRow = {
  id: FRENCH_CHAPTER_ID,
  name: "French Defense",
  sortOrder: 0,
  outcomes: { ...EMPTY_OUTCOMES, held: 9, playerLeft: 3, opponentLeft: 2 },
  adherenceRate: 0.75,
  recallFailures: 3,
  gaps: 2,
  training: { due: 4, fresh: 2 },
};

const caroChapterRow = {
  id: CARO_CHAPTER_ID,
  name: "Caro-Kann",
  sortOrder: 1,
  outcomes: { ...EMPTY_OUTCOMES, held: 9, opponentLeft: 1 },
  adherenceRate: 1,
  recallFailures: 0,
  gaps: 1,
  training: { due: 0, fresh: 5 },
};

const whiteDetail = {
  ...whiteSummary,
  chapters: [frenchChapterRow, caroChapterRow],
  stats: {
    matchedGames: 24,
    unmatchedGames: 5,
    outcomes: { ...EMPTY_OUTCOMES, held: 18, playerLeft: 3, opponentLeft: 3 },
    adherence: whiteSummary.adherence,
    uncoveredOpenings: [{ opening: "Scandinavian Defense", games: 3 }],
  },
};

const frenchChapterDetail = {
  id: FRENCH_CHAPTER_ID,
  repertoireId: WHITE_REPERTOIRE_ID,
  repertoireName: "White repertoire",
  color: "white" as const,
  name: "French Defense",
  sortOrder: 0,
  pgn: "1. e4 e6 2. d4 (2. Nc3 d5) 2... d5 *",
  start: frenchView.start,
  lines: frenchView.lines,
  illegalMoves: [],
};

/** What the handlers serve; tests reshape it through the helpers below. */
let repertoires: (typeof whiteSummary)[] = [];

export function resetRepertoires(): void {
  repertoires = [];
}

/** The White book exists, with the French fixture inside it. */
export function whiteRepertoireIsConfigured(): void {
  repertoires = [whiteSummary];
}

export const repertoiresHandlers = [
  http.get("/api/repertoires", () => HttpResponse.json(repertoires)),

  http.get("/api/repertoires/:id", ({ params }) => {
    if (params["id"] !== WHITE_REPERTOIRE_ID || repertoires.length === 0) {
      return HttpResponse.json({ error: "repertoire not found" }, { status: 404 });
    }
    return HttpResponse.json(whiteDetail);
  }),

  http.get("/api/repertoires/:repertoireId/chapters/:chapterId", ({ params }) => {
    if (
      params["repertoireId"] !== WHITE_REPERTOIRE_ID ||
      params["chapterId"] !== FRENCH_CHAPTER_ID ||
      repertoires.length === 0
    ) {
      return HttpResponse.json({ error: "chapter not found" }, { status: 404 });
    }
    return HttpResponse.json(frenchChapterDetail);
  }),
];
