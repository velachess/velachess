import { scoreToWinChance, type GradedPly, type MoveCategory } from "@velachess/analysis";
import { makeSan, parseUci, positionFromFen } from "@velachess/chess";

// Reading what the engine produced. Plain functions: none of it touches
// React state or lifecycle, so a hook would add a name and no behaviour.

/** "1. e4" for White, plain "e5" for Black — the move number is shared. */
export function moveNumberOf(ply: number): number {
  return Math.ceil(ply / 2);
}

function isWhitePly(ply: number): boolean {
  return ply % 2 === 1;
}

export function sideOfPly(ply: number): "white" | "black" {
  return isWhitePly(ply) ? "white" : "black";
}

type CategoryCounts = Record<MoveCategory, number>;

export interface SideBreakdown {
  white: CategoryCounts;
  black: CategoryCounts;
  /** Moves graded so far — the numerator of any progress reading. */
  graded: number;
}

function emptyCounts(): CategoryCounts {
  return { best: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 };
}

/** Split by side because the interesting number is *yours*. */
export function summarize(moves: readonly GradedPly[]): SideBreakdown {
  const breakdown: SideBreakdown = {
    white: emptyCounts(),
    black: emptyCounts(),
    graded: moves.length,
  };
  for (const move of moves) {
    breakdown[sideOfPly(move.ply)][move.category] += 1;
  }
  return breakdown;
}

/** Whole percent, floored at 0 and capped at 100. Null when unknowable. */
export function progressPercent(graded: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((graded / total) * 100)));
}

/**
 * UCI is what engines speak and nobody reads. Converting needs the
 * position, which `fen` on the same record already carries.
 */
export function bestMoveSan(move: GradedPly): string | null {
  try {
    const position = positionFromFen(move.fen).unwrap();
    const parsed = parseUci(move.bestMove);
    // `parseUci` only reads squares and `makeSan` will name a move
    // nobody could play, so a drifted record would render a confident,
    // impossible suggestion.
    if (!parsed || !position.isLegal(parsed)) return null;
    return makeSan(position, parsed);
  } catch {
    // The played move still renders; only the suggestion goes quiet.
    return null;
  }
}

/** The verdict on one ply, if any. Looks the ply up rather than indexing: the array is a streaming prefix, not aligned to ply. */
export function gradeAtPly(
  graded: readonly GradedPly[],
  ply: number,
): GradedPly | undefined {
  return graded.find((move) => move.ply === ply);
}

export interface EvalPoint {
  ply: number;
  /** White's winning chances, 0–1. The graph's only vertical input. */
  winChance: number;
  category: MoveCategory;
}

/** Delegates cp→win-chance to `@velachess/analysis`: an earlier local copy disagreed on mate handling. */
export function evalCurve(moves: readonly GradedPly[]): EvalPoint[] {
  return moves.map((move) => ({
    ply: move.ply,
    winChance: whiteShareOf(move.evalAfter),
    category: move.category,
  }));
}

/** The package answers in −1…1 (Black to White); a bar and an axis both
 * want 0…1. One rescale, named, instead of the sign appearing inline. */
const SHARE_SPAN = 2;

export function whiteShareOf(score: GradedPly["evalAfter"]): number {
  return (scoreToWinChance(score) + 1) / SHARE_SPAN;
}
