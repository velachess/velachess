import type { GradedPly } from "../games/analysis-contract.ts";
import type { Game } from "../games/list/queries.ts";

export const ME = "yurimutti";

/** Scholar's mate — real and legal, so the board exercises production's replay path, not a placeholder. */
export const GAME_PGN = "1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0";

export const GAME_SANS = ["e4", "e5", "Qh5", "Nc6", "Bc4", "Nf6", "Qxf7#"] as const;

let sequence = 0;

export function resetGameIds(): void {
  sequence = 0;
}

/** Every field filled — a fixture missing `perspective` once made every game read "unfinished" for weeks while the suite stayed green. */
export function aGame(overrides: Partial<Game> = {}): Game {
  sequence += 1;

  return {
    id: `game-${sequence}`,
    whiteName: ME,
    whiteRating: 1520,
    blackName: "gothamchess",
    blackRating: 1495,
    result: "1-0",
    playedAt: `2026-05-${String(sequence).padStart(2, "0")}T18:20:00.000Z`,
    perspective: "white",
    source: "chess_com",
    externalUrl: `https://www.chess.com/game/live/${sequence}`,
    timeControlInitialSeconds: 600,
    timeControlIncrementSeconds: 0,
    openingName: "Sicilian Defense",
    ...overrides,
  };
}

export function aGradedPly(ply: number, overrides: Partial<GradedPly> = {}): GradedPly {
  return {
    ply,
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    san: GAME_SANS[ply - 1] ?? "e4",
    evalBefore: { cp: 20 },
    evalAfter: { cp: 15 },
    bestMove: "e2e4",
    category: "good",
    winChanceLoss: 0.01,
    ...overrides,
  };
}
