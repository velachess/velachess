import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

import type { BadgeTone } from "@velachess/ui/chess/board-theme";

import type { GradedPly, MoveCategory } from "../analysis/index.ts";

// How a verdict reads on screen: glyph, colour, copy and number.

/** NAG notation, not copy — the glyphs every scoresheet already prints. */
const CATEGORY_GLYPHS: Partial<Record<MoveCategory, string>> = {
  inaccuracy: "?!",
  mistake: "?",
  blunder: "??",
};

export function glyphOf(category: MoveCategory | undefined): string | null {
  return category ? (CATEGORY_GLYPHS[category] ?? null) : null;
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

/** Score for the bar beside the board: magnitude only, capped — direction is already shown by which end fills. */
const BAR_SCORE_CEILING = 9.9;
const CP_PER_PAWN = 100;
const BAR_SCORE_DECIMALS = 1;

export function formatBarScore(score: GradedPly["evalAfter"]): string {
  if (score.mate !== undefined) return `M${Math.abs(score.mate)}`;
  const pawns = Math.abs((score.cp ?? 0) / CP_PER_PAWN);
  return Math.min(pawns, BAR_SCORE_CEILING).toFixed(BAR_SCORE_DECIMALS);
}

/** Five grades, four colours: `good` earns no badge — a mark on every square is a mark on none. */
const CATEGORY_BADGE: Partial<Record<MoveCategory, BadgeTone>> = {
  best: "ok",
  inaccuracy: "inaccuracy",
  mistake: "mistake",
  blunder: "blunder",
};

export function badgeForCategory(category: MoveCategory): BadgeTone | null {
  return CATEGORY_BADGE[category] ?? null;
}

export const CATEGORY_LABELS: Record<MoveCategory, MessageDescriptor> = {
  best: msg`Best`,
  good: msg`Good`,
  inaccuracy: msg`Inaccuracy`,
  mistake: msg`Mistake`,
  blunder: msg`Blunder`,
};
