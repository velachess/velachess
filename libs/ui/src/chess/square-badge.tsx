/**
 * [UI] Move-grade/book mark on a square. Rendered via squareRenderer, so
 * it styles in Tailwind (not CSSProperties) — the grid places it.
 */

import type { ComponentType, ReactNode } from "react";

import { BookOpen, Check } from "../icons/index.ts";
import { cn } from "../lib/utils.ts";
import { BADGE_TONE_COLOR, type BadgeTone } from "./board-theme.ts";

/** The mark's ink: light on the tones dark enough to carry it. */
const TONE_INK = {
  ok: "text-white",
  inaccuracy: "text-black/80",
  mistake: "text-black/80",
  blunder: "text-white",
  book: "text-black/80",
} as const satisfies Record<BadgeTone, string>;

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

export interface SquareBadgeProps {
  tone: BadgeTone;
}

export function SquareBadge({ tone }: SquareBadgeProps) {
  const Mark = BADGE_MARK[tone];

  return (
    <span
      aria-hidden
      // Nudged past the corner so it reads as attached to the square
      // rather than sitting inside it, which is where every board in the
      // benchmark puts it. The shadow, not a ring, lifts it off a piece
      // underneath — a ring in one fixed colour reads as a border.
      className={cn(
        "pointer-events-none absolute -top-1 -right-1 z-10 grid size-[42%]",
        "place-items-center rounded-full shadow-md",
        TONE_INK[tone],
      )}
      style={{ backgroundColor: BADGE_TONE_COLOR[tone] }}
    >
      <Mark className="size-5/6 stroke-3" />
    </span>
  );
}
