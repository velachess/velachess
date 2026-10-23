/**
 * Takes a share already in 0-1 and knows nothing about chess: converting an
 * engine score to that share is `@velachess/analysis`'s.
 */

import { useState } from "react";

import { cn } from "../lib/utils.ts";
import type { BoardSide } from "./board.tsx";

const PERCENT_MAX = 100;
const SHARE_MIN = 0;
const SHARE_MAX = 1;
const SHARE_EVEN = 0.5;

export interface EvalBarProps {
  /** 0–1, or null when nothing answers for the position on the board. */
  whiteShare: number | null;
  /** Already formatted: `+1.4`, `−0.3`, `M3`. */
  label: string;
  /** Accessible name, translated by the caller. */
  description: string;
  /** The bar follows the board. */
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
  const reading =
    whiteShare === null ? null : Math.min(SHARE_MAX, Math.max(SHARE_MIN, whiteShare));

  // The fill a bar with no reading keeps: sliding to even and back would
  // animate a number nobody produced.
  const [lastReading, setLastReading] = useState(reading ?? SHARE_EVEN);
  if (reading !== null && reading !== lastReading) setLastReading(reading);

  const share = reading ?? lastReading;
  const whitePercent = share * PERCENT_MAX;
  const whiteAtBottom = orientation === "white";
  const whiteLeads = share >= SHARE_EVEN;
  // At the leading side's end, which is where there is room and where the
  // fill that side owns makes one text colour always work.
  const labelAtBottom = whiteLeads === whiteAtBottom;

  return (
    <div
      role="meter"
      aria-valuemin={SHARE_MIN}
      aria-valuemax={SHARE_MAX}
      // The held fill is the previous position's, so it is not reported.
      aria-valuenow={reading ?? undefined}
      aria-valuetext={label}
      aria-label={description}
      // `overflow-hidden` belongs to the fills: on the outer box it clipped
      // the reading to the bar's 16px and `0.0` came out as `0.`.
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
          data-slot="eval-bar-fill"
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
