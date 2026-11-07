/**
 * The board's size, the panel's width budget and how they stack are one
 * decision, taken on `AppFrame`'s content width rather than the viewport's,
 * so a wider sidebar stacks the stage instead of squeezing the board:
 *
 *   >= 56rem  board | panel, sharing one screenful
 *   <  56rem  board, then panel below it, at natural height
 */
import type * as React from "react";

import { cn } from "../lib/utils.ts";

/**
 * Stacked, the board is capped so it still fits a screenful, in `svh`
 * because mobile chrome shrinks the viewport. Side by side, the column
 * `BoardStage` sizes is the width.
 */
export const BOARD_STAGE_WIDTH =
  "w-full min-w-0 max-w-[min(100%,100svh-7rem)] @4xl/content:max-w-none";

/**
 * Side by side, the stage is a size container so the board column can be
 * as wide as the height allows: two player strips (2 × 1.75rem) above and
 * below, an evaluation bar (1.75rem) beside. That track is filled before
 * the panel's `1fr`, so the panel only grows past its minimum with width
 * the board cannot use, and only up to 34rem — beyond that the stage
 * centers. `auto-rows-min` stops the stacked board painting over the panel.
 */
export function BoardStage({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col @4xl/content:@container-size",
        className,
      )}
    >
      <div className="mx-auto grid min-h-0 w-full flex-1 auto-rows-min gap-4 @4xl/content:auto-rows-fr @4xl/content:max-w-[calc(100cqh-1.75rem+1rem+34rem)] @4xl/content:grid-cols-[minmax(0,calc(100cqh-1.75rem))_minmax(24rem,1fr)]">
        {children}
      </div>
    </div>
  );
}

export function BoardColumn({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={label}
      className={cn(
        "flex min-h-0 min-w-0 flex-col items-center gap-2 @4xl/content:justify-center",
        className,
      )}
    >
      {children}
    </section>
  );
}

/** `overflow-clip` rather than `overflow-hidden`, which registers as a
 * scroll container and catches a sticky descendant before it reaches the
 * real scrolling ancestor. */
export function BoardPanel({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <aside
      aria-label={label}
      className={cn(
        "bg-card flex min-h-0 flex-col overflow-clip rounded-lg border",
        className,
      )}
    >
      {children}
    </aside>
  );
}

/**
 * The squares are divs with no accessible name, so stepping would otherwise
 * be silent. `polite`, because the move follows the person's own action.
 */
export function BoardStatus({ children }: { children: React.ReactNode }) {
  return (
    <p aria-live="polite" className="sr-only">
      {children}
    </p>
  );
}
