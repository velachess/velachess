/**
 * [UI] Eval bar takes a share already in 0-1 and knows nothing about
 * chess — converting engine score to that share lives in
 * `@velachess/analysis`.
 */

import { cn } from "../lib/utils.ts";
import type { BoardSide } from "./board.tsx";

const PERCENT_MAX = 100;
const SHARE_MIN = 0;
const SHARE_MAX = 1;
/** Above this White is ahead, below it Black is. */
const SHARE_EVEN = 0.5;

export interface EvalBarProps {
  /** White's share of the position, 0–1. */
  whiteShare: number;
  /** The reading, already formatted: `+1.4`, `−0.3`, `M3`. */
  label: string;
  /** Accessible name. Copy, so the caller translates it. */
  description: string;
  /** Which side sits at the bottom — the bar follows the board. */
  orientation?: BoardSide;
  className?: string;
}

export function EvalBar({
  whiteShare,
  label,
  description,
  orientation = "white",
  className,
}: EvalBarProps) {
  const share = Math.min(SHARE_MAX, Math.max(SHARE_MIN, whiteShare));
  const whitePercent = share * PERCENT_MAX;
  const whiteAtBottom = orientation === "white";
  const whiteLeads = share >= SHARE_EVEN;
  // The reading sits at the leading side's end, which is both where
  // there is room for it and how it stays legible: that end is the fill
  // that side owns, so one text colour always works.
  const labelAtBottom = whiteLeads === whiteAtBottom;

  return (
    <div
      role="meter"
      aria-valuemin={SHARE_MIN}
      aria-valuemax={SHARE_MAX}
      aria-valuenow={share}
      aria-valuetext={label}
      aria-label={description}
      // No `overflow-hidden` here. It belongs to the fills, which need
      // their corners rounded — putting it on the outer box clipped the
      // reading to the bar's 16px and `0.0` came out as `0.`.
      className={cn("relative flex w-5 shrink-0 flex-col", className)}
    >
      <div
        aria-hidden
        className={cn(
          "absolute inset-0 flex overflow-hidden rounded-sm border",
          whiteAtBottom ? "flex-col-reverse" : "flex-col",
        )}
      >
        {/* Transition so a streaming analysis slides rather than jumps —
            the same reason the graph pins its axis. */}
        <div
          className="bg-(--eval-white) transition-[height] duration-300 ease-out"
          style={{ height: `${whitePercent}%` }}
        />
        <div className="flex-1 bg-(--eval-black)" />
      </div>

      {/* Allowed to be wider than the bar: a reading like `−12.4` spills
          a few pixels into the gap that already separates bar from
          board, which is cheaper than a bar sized for the rarest case. */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-x-0 text-center font-mono text-[0.625rem] leading-none font-medium whitespace-nowrap",
          labelAtBottom ? "bottom-0.5" : "top-0.5",
          whiteLeads ? "text-(--eval-black)" : "text-(--eval-white)",
        )}
      >
        {label}
      </span>
    </div>
  );
}
