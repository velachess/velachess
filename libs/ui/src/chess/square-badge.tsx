/**
 * [UI] Move-grade/book mark on a square. Rendered via squareRenderer, so
 * it styles in Tailwind (not CSSProperties) — the grid places it.
 */

import type { ComponentType, ReactNode } from "react";

import { BookOpen, Check } from "../icons/index.ts";
import { cn } from "../lib/utils.ts";
import { BADGE_TONE_COLOR, type BadgeCorner, type BadgeTone } from "./board-theme.ts";

interface MarkProps {
  className: string;
}

/** A hand-drawn mark: Lucide has no `?`, `?!` or `??`. */
function NagMark({ className, children }: MarkProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}

function Inaccuracy({ className }: MarkProps) {
  return (
    <NagMark className={className}>
      <path d="M4.06 9.48a2.94 2.94 0 1 1 4.41 2.52c-.98.63-1.47 1.12-1.47 2.24M7 17.6h.01" />
      <path d="M17 6.4v7.2M17 17.6h.01" />
    </NagMark>
  );
}

function Mistake({ className }: MarkProps) {
  return (
    <NagMark className={className}>
      <path d="M7.8 8.4a4.2 4.2 0 1 1 6.3 3.6c-1.4.9-2.1 1.6-2.1 3.2M12 20h.01" />
    </NagMark>
  );
}

function Blunder({ className }: MarkProps) {
  return (
    <NagMark className={className}>
      <path d="M3.66 9.48a2.94 2.94 0 1 1 4.41 2.52c-.98.63-1.47 1.12-1.47 2.24M6.6 17.6h.01" />
      <path d="M14.46 9.48a2.94 2.94 0 1 1 4.41 2.52c-.98.63-1.47 1.12-1.47 2.24M17.4 17.6h.01" />
    </NagMark>
  );
}

const BADGE_MARK = {
  ok: Check,
  inaccuracy: Inaccuracy,
  mistake: Mistake,
  blunder: Blunder,
  book: BookOpen,
} as const satisfies Record<BadgeTone, ComponentType<MarkProps>>;

/**
 * Each corner, written out.
 *
 * Tailwind reads source as text, so these cannot be assembled from the
 * corner name — the class has to appear here in full to be generated.
 */
const CORNER_POSITION: Record<BadgeCorner, string> = {
  "top-right": "top-0 right-0 translate-x-1/2 -translate-y-1/2",
  "top-left": "top-0 left-0 -translate-x-1/2 -translate-y-1/2",
  "bottom-right": "right-0 bottom-0 translate-x-1/2 translate-y-1/2",
  "bottom-left": "bottom-0 left-0 -translate-x-1/2 translate-y-1/2",
};

export interface SquareBadgeProps {
  tone: BadgeTone;
  /** Which corner to sit on — `badgeCornerOf` picks it. */
  corner: BadgeCorner;
}

export function SquareBadge({ tone, corner }: SquareBadgeProps) {
  const Mark = BADGE_MARK[tone];

  return (
    <span
      aria-hidden
      data-slot="square-badge"
      data-corner={corner}
      // Centred on a corner of the square, so it sits at the meeting
      // point of four squares and reads as attached to the move. Which
      // corner is the caller's call: it depends on the board's edges and
      // on where the arrows run. The shadow, not a ring, lifts it off a
      // piece underneath — a ring in one fixed colour reads as a border.
      //
      // Just under a third of the square: enough to read the mark, small
      // enough that it annotates the position instead of outweighing the
      // piece it points at.
      className={cn(
        "pointer-events-none absolute z-10 grid size-[32%]",
        // One ink for every tone: a badge that changes text colour with
        // its grade reads as two different components.
        "place-items-center rounded-full text-white shadow-sm",
        CORNER_POSITION[corner],
      )}
      style={{ backgroundColor: BADGE_TONE_COLOR[tone] }}
    >
      <Mark className="size-5/6 stroke-3" />
    </span>
  );
}
