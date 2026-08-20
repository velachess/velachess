/**
 * The material every insight source reads. Structural types, not persistence-layer imports — sources stay testable from a literal.
 */

export type PlayerColor = "white" | "black";
export type GameResult = "1-0" | "0-1" | "1/2-1/2" | "*";
export type MoveCategory = "best" | "good" | "inaccuracy" | "mistake" | "blunder";

export interface SamplePly {
  /** 1-indexed; odd plies are White's moves. */
  ply: number;
  /** Position before the move. */
  fen: string;
  category: MoveCategory;
  winChanceLoss: number;
  /** White's point of view, as stored. */
  evalBefore: { cp?: number; mate?: number };
}

export interface GameSample {
  id: string;
  playedAt: Date | null;
  /** Which side the account holder played. Null (a PGN import with no
   * owner side) excludes the game from every own-side calculation —
   * a mistake that cannot be attributed cannot be a finding about you. */
  perspective: PlayerColor | null;
  result: GameResult;
  whiteRating: number | null;
  blackRating: number | null;
  openingName: string | null;
  openingEco: string | null;
  /** Null when the game was never analysed. */
  plies: SamplePly[] | null;
}

/** Result recorded and a side to attribute it to. */
export function isDecided(game: GameSample): boolean {
  return game.perspective !== null && game.result !== "*";
}

/** Win for the account holder. Draws count against, which is how
 * `adherenceMetrics` already defines `winRate` — one quantity, one
 * definition, even where a points-based rate would read kinder. */
export function isWin(game: GameSample): boolean {
  if (game.perspective === "white") return game.result === "1-0";
  if (game.perspective === "black") return game.result === "0-1";
  return false;
}

/** Wins over decided games; null below one decided game. */
export function winRate(games: readonly GameSample[]): number | null {
  const decided = games.filter(isDecided);
  if (decided.length === 0) return null;
  return decided.filter(isWin).length / decided.length;
}

/** The account holder's own moves — the only ones a finding may blame. */
export function ownPlies(game: GameSample): SamplePly[] {
  if (game.perspective === null || game.plies === null) return [];
  const remainder = game.perspective === "white" ? 1 : 0;
  return game.plies.filter((ply) => ply.ply % 2 === remainder);
}

/** The stored eval is White's view; a finding cares about the mover's. */
export function moverEval(
  score: { cp?: number; mate?: number },
  mover: PlayerColor,
): { cp?: number; mate?: number } {
  if (mover === "white") return score;
  const flipped: { cp?: number; mate?: number } = {};
  if (score.cp !== undefined) flipped.cp = -score.cp;
  if (score.mate !== undefined) flipped.mate = -score.mate;
  return flipped;
}

export function ownRating(game: GameSample): number | null {
  if (game.perspective === "white") return game.whiteRating;
  if (game.perspective === "black") return game.blackRating;
  return null;
}
