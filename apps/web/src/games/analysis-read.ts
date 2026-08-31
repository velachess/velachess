import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { scoreToWinChance } from "@velachess/analysis";
import type { MoveSquares } from "@velachess/chess";
import { makeSan, parseUci, positionFromFen, squaresOfSan } from "@velachess/chess";
import type { BadgeTone } from "@velachess/ui/chess/board-theme";

import { MOVE_CATEGORIES } from "./analysis-contract.ts";
import type { GradedPly, MoveCategory, ReplayMove } from "./analysis-contract.ts";

// Domain computation for the slice. Plain functions: none of it touches
// React state or lifecycle, so a hook would add a name and no behaviour.

/** A ply is one half-move. Ply 0 is the position before anyone moved. */
export function fenAtPly(moves: ReplayMove[], startFen: string, ply: number): string {
  if (ply <= 0) return startFen;
  return moves[Math.min(ply, moves.length) - 1]?.fenAfter ?? startFen;
}

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

/** NAG notation, not copy — the glyphs every scoresheet already prints. */
const CATEGORY_GLYPHS: Partial<Record<MoveCategory, string>> = {
  inaccuracy: "?!",
  mistake: "?",
  blunder: "??",
};

export function glyphOf(category: MoveCategory | undefined): string | null {
  return category ? (CATEGORY_GLYPHS[category] ?? null) : null;
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
export function summarize(moves: GradedPly[]): SideBreakdown {
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

/** The categories in severity order, best first — the report's row order. */
export function categoriesInOrder(): readonly MoveCategory[] {
  return MOVE_CATEGORIES;
}

/** Whole percent, floored at 0 and capped at 100. Null when unknowable. */
export function progressPercent(graded: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((graded / total) * 100)));
}

/** "+1.4", "−0.3", "M3" — always from White, so the sign never moves. */
export function formatScore(score: GradedPly["evalAfter"]): string {
  if (score.mate !== undefined) {
    return `${score.mate > 0 ? "" : "−"}M${Math.abs(score.mate)}`;
  }
  const pawns = (score.cp ?? 0) / 100;
  const rounded = Math.abs(pawns).toFixed(1);
  if (pawns > 0) return `+${rounded}`;
  if (pawns < 0) return `−${rounded}`;
  return "0.0";
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

/** Score for the bar beside the board: magnitude only, capped — direction is already shown by which end fills. */
const BAR_SCORE_CEILING = 9.9;
const CP_PER_PAWN = 100;
const BAR_SCORE_DECIMALS = 1;

export function formatBarScore(score: GradedPly["evalAfter"]): string {
  if (score.mate !== undefined) return `M${Math.abs(score.mate)}`;
  const pawns = Math.abs((score.cp ?? 0) / CP_PER_PAWN);
  return Math.min(pawns, BAR_SCORE_CEILING).toFixed(BAR_SCORE_DECIMALS);
}

/** The verdict on one ply, if any. Looks the ply up rather than indexing: the array is a streaming prefix, not aligned to ply. */
export function gradeAtPly(graded: GradedPly[], ply: number): GradedPly | undefined {
  return graded.find((move) => move.ply === ply);
}

/** Wraps `squaresOfSan` to take a FEN instead of a parsed position, reusing its validation rather than naive slicing. */
export function squaresOfSanAt(fen: string, san: string): MoveSquares | null {
  try {
    return squaresOfSan(positionFromFen(fen).unwrap(), san);
  } catch {
    return null;
  }
}

/** Five grades, four colours: `good` earns no badge — a mark on every square is a mark on none. */
const CATEGORY_BADGE: Partial<Record<MoveCategory, BadgeTone>> = {
  best: "ok",
  inaccuracy: "inaccuracy",
  mistake: "mistake",
  blunder: "blunder",
};

const BEST_MOVE_GLYPH = "✓";

export function badgeForCategory(
  category: MoveCategory,
): { tone: BadgeTone; label: string } | null {
  const tone = CATEGORY_BADGE[category];
  if (!tone) return null;
  return { tone, label: glyphOf(category) ?? BEST_MOVE_GLYPH };
}

/** Translated category names for UI display. */
export const CATEGORY_LABELS: Record<MoveCategory, MessageDescriptor> = {
  best: msg`Best`,
  good: msg`Good`,
  inaccuracy: msg`Inaccuracy`,
  mistake: msg`Mistake`,
  blunder: msg`Blunder`,
};

export interface EvalPoint {
  ply: number;
  /** White's winning chances, 0–1. The graph's only vertical input. */
  winChance: number;
  category: MoveCategory;
  /** The played move in SAN notation. */
  san: string;
  /** The evaluation after the move, from White's perspective. */
  evalAfter: GradedPly["evalAfter"];
}

/** Delegates cp→win-chance to `@velachess/analysis`: an earlier local copy disagreed on mate handling. */
export function evalCurve(moves: GradedPly[]): EvalPoint[] {
  return moves.map((move) => ({
    ply: move.ply,
    winChance: whiteShareOf(move.evalAfter),
    category: move.category,
    san: move.san,
    evalAfter: move.evalAfter,
  }));
}

/** The package answers in −1…1 (Black to White); a bar and an axis both
 * want 0…1. One rescale, named, instead of the sign appearing inline. */
const SHARE_SPAN = 2;

export function whiteShareOf(score: GradedPly["evalAfter"]): number {
  return (scoreToWinChance(score) + 1) / SHARE_SPAN;
}

/** Board perspective: stored `perspective` if resolved, else tracked usernames (mirrors server's `resolveGamePerspective`); white by default. */
export function seatOf(
  game: { perspective: "white" | "black" | null; whiteName: string; blackName: string },
  mine: readonly string[],
): "white" | "black" {
  if (game.perspective) return game.perspective;

  const names = mine.map((name) => name.toLowerCase());
  if (names.includes(game.blackName.toLowerCase())) return "black";
  return "white";
}

export interface SeatIdentity {
  /** Provider profile picture, resolved server-side from the profile
   * cache. Absent when unknown — initials stand in. */
  avatarUrl?: string;
  /** Lichess asset id, decorated beside the name. Never an avatar. */
  flair?: string;
}

/**
 * The provider identity of one seat, as the game detail payload carried
 * it in — the server resolves both players from a shared per-handle
 * cache, so an opponent needs no tracked account to have a face. Nulls
 * become absent: initials stand in for an unknown picture.
 */
export function seatIdentityOf(
  identity:
    | {
        avatarUrl: string | null;
        flair: string | null;
      }
    | undefined,
): SeatIdentity {
  if (!identity) return {};

  return {
    ...(identity.avatarUrl !== null ? { avatarUrl: identity.avatarUrl } : {}),
    ...(identity.flair !== null ? { flair: identity.flair } : {}),
  };
}

/** Engine's move as an arrow, not a played position — keeps the board showing the choice the player faced. */
export function suggestedArrow(
  fen: string | undefined,
  san: string | null,
): MoveSquares | null {
  return fen && san ? squaresOfSanAt(fen, san) : null;
}

/** The previewed move, if it still belongs to the ply on screen — tying it to the ply makes navigating auto-dismiss it. */
export function previewFor(
  preview: { ply: number; san: string } | null,
  ply: number,
): string | null {
  return preview && preview.ply === ply ? preview.san : null;
}
