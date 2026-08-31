/**
 * [UI] The mark inside a `SquareBadge`: a checkmark for the best move, or a
 * NAG punctuation mark (`?!`, `?`, `??`) for a grade. Both render as SVG
 * with a fixed stroke, the same fix `PieceIcon` applies to pieces — a
 * Unicode glyph's weight is decided by whatever font the reader's platform
 * substitutes, which is what made the old badge read as thin on some
 * screens and heavier on others.
 */

import { CheckIcon } from "lucide-react";

import { cn } from "../lib/utils.ts";

export type BadgeGlyphKind = "best" | "nag";

export interface BadgeGlyphProps {
  kind: BadgeGlyphKind;
  /** NAG text (`?!`, `?`, `??`). Required when `kind` is `"nag"`, ignored
   * otherwise — notation, not copy, so this package does not translate it. */
  nag?: string;
  className?: string;
}

/** A checkmark's stroke sits low-left of its bounding box; nudge it down
 * and right so it optically centres inside the circle instead of just
 * centring by the box model. */
const CHECK_NUDGE = "translate-x-[4%] translate-y-[6%]";

/** `??` is two glyphs wide, so it needs a smaller size than `?` to keep
 * every NAG mark reading at roughly the same visual weight. */
const NAG_FONT_SIZE: Record<number, number> = { 1: 15, 2: 11 };
const NAG_FONT_SIZE_FALLBACK = 10;

export function BadgeGlyph({ kind, nag, className }: BadgeGlyphProps) {
  if (kind === "best") {
    return (
      <CheckIcon
        aria-hidden
        className={cn("size-[62%] stroke-[3.5]", CHECK_NUDGE, className)}
      />
    );
  }

  const text = nag ?? "";
  const fontSize = NAG_FONT_SIZE[text.length] ?? NAG_FONT_SIZE_FALLBACK;

  return (
    <svg aria-hidden viewBox="0 0 24 24" className={cn("size-[80%]", className)}>
      <text
        x="50%"
        y="53%"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={fontSize}
        fontWeight={700}
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth={0.5}
        paintOrder="stroke"
      >
        {text}
      </text>
    </svg>
  );
}
  );
}</text>
