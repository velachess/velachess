import type { GradedPly } from "../../analysis-contract.ts";

export const LANDING_PLAYER = "vela_player";
export const LANDING_OPPONENT = "night_shift";
export const LANDING_GAME_ID = "landing-game-analysis";
export const LANDING_GAME_PGN = "1. f3 e5 2. g4 Qh4# 0-1";

export const landingGame = {
  id: LANDING_GAME_ID,
  whiteName: LANDING_PLAYER,
  whiteRating: 1542,
  blackName: LANDING_OPPONENT,
  blackRating: 1588,
  result: "0-1",
  playedAt: "2026-08-18T19:30:00.000Z",
  perspective: "white",
  source: "chess_com",
  externalUrl: "https://www.chess.com/game/live/100000000001",
  timeControlInitialSeconds: 600,
  timeControlIncrementSeconds: 0,
  openingName: "Barnes Opening",
  openingEco: "A00",
  termination: "by checkmate",
  rawPgn: LANDING_GAME_PGN,
} as const;

export const landingAnalysis: GradedPly[] = [
  {
    ply: 1,
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    san: "f3",
    evalBefore: { cp: 18 },
    evalAfter: { cp: -42 },
    bestMove: "e2e4",
    category: "inaccuracy",
    winChanceLoss: 0.12,
  },
  {
    ply: 2,
    fen: "rnbqkbnr/pppppppp/8/8/8/5P2/PPPPP1PP/RNBQKBNR b KQkq - 0 1",
    san: "e5",
    evalBefore: { cp: 42 },
    evalAfter: { cp: 45 },
    bestMove: "e7e5",
    category: "best",
    winChanceLoss: 0,
  },
  {
    ply: 3,
    fen: "rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2",
    san: "g4",
    evalBefore: { cp: -45 },
    evalAfter: { mate: -1 },
    bestMove: "e2e4",
    category: "blunder",
    winChanceLoss: 0.49,
  },
  {
    ply: 4,
    fen: "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2",
    san: "Qh4#",
    evalBefore: { mate: 1 },
    evalAfter: { mate: -1 },
    bestMove: "d8h4",
    category: "best",
    winChanceLoss: 0,
  },
];

export const landingCompletedAnalysis = {
  status: "completed",
  analysis: {
    engineVersion: "stockfish-17",
    depth: 18,
    positions: landingAnalysis,
  },
  drills: { total: 1 },
} as const;
