/**
 * Rendered through `squareRenderer`, so it styles in Tailwind rather than
 * CSSProperties.
 */

import type { ComponentType, ReactNode } from "react";

import { BookOpen, Check } from "../icons/index.ts";
import { cn } from "../lib/utils.ts";
import { BADGE_TONE_COLOR, type BadgeEdges, type BadgeTone } from "./board-theme.ts";

interface MarkProps {
  className: string;
}

/** Hand-drawn: Lucide has no `?`, `?!` or `??`. */
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

export interface SquareBadgeProps {
  tone: BadgeTone;
  edges: BadgeEdges;
}

export function SquareBadge({ tone, edges }: SquareBadgeProps) {
  const Mark = BADGE_MARK[tone];

  return (
    <span
      aria-hidden
      data-slot="square-badge"
      // Just under a third of the square, so the mark annotates the
      // position rather than outweighing the piece. Centred on the
      // top-right corner, where four squares meet, and pushed inward on the
      // board's own edge. A shadow rather than a ring, which in one fixed
      // colour reads as a border.
      className={cn(
        "pointer-events-none absolute z-10 grid size-[32%]",
        // One ink for every tone: changing text colour with the grade reads
        // as two components.
        "place-items-center rounded-full text-white shadow-sm",
        !edges.right && "right-0 translate-x-1/2",
        edges.right && "right-1/24",
        !edges.top && "top-0 -translate-y-1/2",
        edges.top && "top-1/24",
      )}
      style={{ backgroundColor: BADGE_TONE_COLOR[tone] }}
    >
      <Mark className="size-5/6 stroke-3" />
    </span>
  );
}
