/**
 * The board's size, the panel's width budget and how they stack are one
 * decision:
 *
 *   >= 1024px  board | panel, sharing one screenful
 *   <  1024px  board, then panel below it, at natural height
 */
import type * as React from "react";

import { Skeleton } from "../components/skeleton.tsx";
import { cn } from "../lib/utils.ts";

/**
 * Capped because an uncapped square on a 768px screen pushes the panel
 * below the fold. From `lg` it must fit vertically too, in `svh` because
 * mobile chrome shrinks the viewport, minus the furniture. Container units
 * cannot do this: Tailwind's `@container` has no `cqh`.
 */
export const BOARD_STAGE_WIDTH =
  "w-full min-w-0 max-w-[32rem] lg:max-w-[min(100svh-9rem,100%)]";

/**
 * Grid, not flex, because the panel gets a width range. `minmax(0,1fr)`
 * lets the board column shrink, a track's default minimum being its
 * content, and `auto-rows-min` stops the stacked board painting over the
 * panel.
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
        "grid min-h-0 flex-1 auto-rows-min gap-4 lg:auto-rows-fr lg:grid-cols-[minmax(0,1fr)_minmax(24rem,34rem)]",
        className,
      )}
    >
      {children}
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
        "flex min-h-0 min-w-0 flex-col items-center gap-2 lg:justify-center",
        className,
      )}
    >
      {children}
    </section>
  );
}

/** Its own scroll boundary, so a long scoresheet never grows the screen.
 *
 * `overflow-clip` rather than `overflow-hidden`, which registers as a
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

/**
 * At the size it will be: a placeholder smaller than what replaces it makes
 * everything below jump when the board arrives.
 */
export function BoardStageSkeleton({
  label,
  panel,
}: {
  /** Announced while the screen is empty; already translated. */
  label: string;
  /** The panel's shape, when it is worth previewing. */
  panel?: React.ReactNode;
}) {
  return (
    <output
      aria-label={label}
      className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-4 lg:overflow-hidden"
    >
      {/* Where the breadcrumb will be. */}
      <Skeleton className="h-5 w-56 shrink-0" />

      <BoardStage>
        <div className="flex min-h-0 min-w-0 flex-col items-center gap-2 lg:justify-center">
          <Skeleton className={cn("aspect-square rounded-lg", BOARD_STAGE_WIDTH)} />
          <Skeleton className={cn("h-11 md:h-9", BOARD_STAGE_WIDTH)} />
        </div>

        <aside className="bg-card flex min-h-0 flex-col gap-3 overflow-hidden rounded-lg border p-3">
          {panel ?? <DefaultPanelSkeleton />}
        </aside>
      </BoardStage>
    </output>
  );
}

function DefaultPanelSkeleton() {
  return (
    <>
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-9 w-36" />
      <Skeleton className="h-px w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-4 w-2/3" />
    </>
  );
}
