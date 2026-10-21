import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

import type { BadgeTone } from "@velachess/ui/chess/board-theme";
import type { ReplayedMove } from "@velachess/chess";

import type { MoveCategory, WhitePovScore } from "../analysis/index.ts";
import { scoreToWinChance } from "../analysis/index.ts";

// How a verdict reads on screen: colour, copy and number. A glyph that
// belongs to one surface lives with that surface.

/**
 * Severity as the theme's text colour. Complete on purpose: every grade
 * is written somewhere, so every grade has a colour — `best` and `good`
 * share one, because the difference between them is not a warning.
 * Being marked on the board is a separate decision; see CATEGORY_BADGE.
 */
export const CATEGORY_TEXT_TONE: Record<MoveCategory, string> = {
  best: "text-move-ok",
  good: "text-move-ok",
  inaccuracy: "text-move-inaccuracy",
  mistake: "text-move-mistake",
  blunder: "text-move-blunder",
};

/**
 * The mark drawn on a square. Partial on purpose, and not the same
 * decision as having a colour: `good` is written in the ok tone like
 * `best`, but earns no mark, because a mark on every square is a mark
 * on none.
 */
export const CATEGORY_BADGE: Partial<Record<MoveCategory, BadgeTone>> = {
  best: "ok",
  inaccuracy: "inaccuracy",
  mistake: "mistake",
  blunder: "blunder",
};

export const CATEGORY_LABELS: Record<MoveCategory, MessageDescriptor> = {
  best: msg`Best`,
  good: msg`Good`,
  inaccuracy: msg`Inaccuracy`,
  mistake: msg`Mistake`,
  blunder: msg`Blunder`,
};

/** "+1.4", "−0.3", "M3" — always from White, so the sign never moves. */
export function formatScore(score: WhitePovScore): string {
  if (score.mate !== undefined) {
    return `${score.mate > 0 ? "" : "−"}M${Math.abs(score.mate)}`;
  }
  const pawns = (score.cp ?? 0) / CP_PER_PAWN;
  const rounded = Math.abs(pawns).toFixed(BAR_SCORE_DECIMALS);
  if (pawns > 0) return `+${rounded}`;
  if (pawns < 0) return `−${rounded}`;
  return EVEN_LABEL;
}

/** Magnitude only, capped — the bar shows direction by which end fills. */
const BAR_SCORE_CEILING = 9.9;
const CP_PER_PAWN = 100;
const BAR_SCORE_DECIMALS = 1;

function formatBarScore(score: WhitePovScore): string {
  if (score.mate !== undefined) return `M${Math.abs(score.mate)}`;
  const pawns = Math.abs((score.cp ?? 0) / CP_PER_PAWN);
  return Math.min(pawns, BAR_SCORE_CEILING).toFixed(BAR_SCORE_DECIMALS);
}

/** `@velachess/analysis` answers in −1…1 (Black to White); a bar and an
 * axis both want 0…1. */
const SHARE_SPAN = 2;

export function whiteShareOf(score: WhitePovScore): number {
  return (scoreToWinChance(score) + 1) / SHARE_SPAN;
}

/** An even position, for before the engine has said anything. */
const EVEN_SHARE = 0.5;
const EVEN_LABEL = "0.0";

/** The bar beside the board: a share to fill and a reading to print. */
export function evaluationOf(score: WhitePovScore | undefined) {
  if (!score) return { whiteShare: EVEN_SHARE, label: EVEN_LABEL };

  return { whiteShare: whiteShareOf(score), label: formatBarScore(score) };
}

/** The grade's mark on the square it belongs to, where it earns one. */
export function badgeAt(
  square: string | undefined,
  category: MoveCategory | undefined,
): Record<string, BadgeTone> | undefined {
  if (!square || !category) return undefined;
  const tone = CATEGORY_BADGE[category];
  if (!tone) return undefined;
  return { [square]: tone };
}

/**
 * What the board says it is showing. A variation's moves have no number
 * of their own — they all answer the same ply — so the line's notation is
 * announced on its own.
 */
export function showingLabel(
  san: string | null,
  move: ReplayedMove | undefined,
  inVariation: boolean,
  start: string,
): string {
  if (!san) return start;
  if (inVariation || !move) return san;

  const suffix = move.side === "white" ? "." : "…";
  return `${move.moveNumber}${suffix} ${san}`;
}
