import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

import type { BadgeTone } from "@velachess/ui/chess/board-theme";
import type { ReplayedMove } from "@velachess/chess";

import type { MoveCategory, WhitePovScore } from "../analysis/index.ts";
import { scoreToWinChance } from "../analysis/index.ts";

/**
 * Complete, because every grade is written somewhere. `best` and `good`
 * share a colour, the difference between them not being a warning.
 */
export const CATEGORY_TEXT_TONE: Record<MoveCategory, string> = {
  best: "text-move-ok",
  good: "text-move-ok",
  inaccuracy: "text-move-inaccuracy",
  mistake: "text-move-mistake",
  blunder: "text-move-blunder",
};

/**
 * Partial, and not the same decision as having a colour: `good` earns no
 * mark, because a mark on every square is a mark on none.
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

/** Always from White, so the sign never moves. */
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

/** Magnitude only: the bar shows direction by which end fills. */
const BAR_SCORE_CEILING = 9.9;
const CP_PER_PAWN = 100;
const BAR_SCORE_DECIMALS = 1;

function formatBarScore(score: WhitePovScore): string {
  if (score.mate !== undefined) return `M${Math.abs(score.mate)}`;
  const pawns = Math.abs((score.cp ?? 0) / CP_PER_PAWN);
  return Math.min(pawns, BAR_SCORE_CEILING).toFixed(BAR_SCORE_DECIMALS);
}

/** `@velachess/analysis` answers in −1…1; a bar and an axis want 0…1. */
const SHARE_SPAN = 2;

export function whiteShareOf(score: WhitePovScore): number {
  return (scoreToWinChance(score) + 1) / SHARE_SPAN;
}

const EVEN_SHARE = 0.5;
const EVEN_LABEL = "0.0";

export function evaluationOf(score: WhitePovScore | undefined) {
  if (!score) return { whiteShare: EVEN_SHARE, label: EVEN_LABEL };

  return { whiteShare: whiteShareOf(score), label: formatBarScore(score) };
}

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
