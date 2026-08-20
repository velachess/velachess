/**
 * [UI] Move-grade/book mark on a square. Rendered via squareRenderer, so
 * it styles in Tailwind (not CSSProperties) — the grid places it.
 */

import type { ReactNode } from "react";

import { cn } from "../lib/utils.ts";
import { BADGE_TONE_COLOR, type BadgeTone } from "./board-theme.ts";

/** Tones whose fill is dark enough to need light text on top. */
const LIGHT_ON_TONE: ReadonlySet<BadgeTone> = new Set<BadgeTone>(["ok", "blunder"]);

export interface SquareBadgeProps {
  tone: BadgeTone;
  /** The glyph or icon. Copy belongs to the caller — this package cannot
   * translate, and a NAG like `??` is notation rather than words. */
  children: ReactNode;
}

export function SquareBadge({ tone, children }: SquareBadgeProps) {
  return (
    <span
      aria-hidden
      // Nudged past the corner so it reads as attached to the square
      // rather than sitting inside it, which is where every board in the
      // benchmark puts it. `ring` in the board's own colour keeps it
      // legible against a piece underneath.
      className={cn(
        "pointer-events-none absolute -top-1 -right-1 z-10 grid size-[42%]",
        "place-items-center rounded-full text-[0.6rem] leading-none font-medium",
        "ring-2 ring-(--board-light)",
        LIGHT_ON_TONE.has(tone) ? "text-white" : "text-black/80",
      )}
      style={{ backgroundColor: BADGE_TONE_COLOR[tone] }}
    >
      {children}
    </span>
  );
}
