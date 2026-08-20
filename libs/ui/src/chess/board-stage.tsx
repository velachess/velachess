/**
 * [UI/chess] The board screen's layout grammar, in one place.
 *
 * Three screens ask three different questions of the same position —
 * Game Review asks what happened, Repertoire Study asks what is
 * prepared, Repertoire Practice asks whether you can recall it — and all
 * three answer it the same way: one dominant board with a context panel
 * beside it. That sameness is the point. A person who learned to read
 * one of these screens has learned all three, so the board's size, the
 * panel's width budget and the way they stack on a narrow window are a
 * shared decision, not three coincidences.
 *
 * Responsive contract:
 *   >= 1024px  board | panel, sharing one screenful
 *   <  1024px  board, then panel below it, each at its natural height
 */
import type * as React from "react";

import { Skeleton } from "../components/skeleton.tsx";
import { cn } from "../lib/utils.ts";

/**
 * The board's width, and anything meant to align with it.
 *
 * Capped at 32rem because an uncapped square on a 768px screen is a
 * 768px board that pushes the panel below the fold. From `lg` the two
 * columns share one screenful, so it also has to fit vertically: `svh`
 * because mobile chrome shrinks the viewport, minus 9rem of furniture
 * (padding, strips or controls, gaps). Container units cannot do this —
 * Tailwind's `@container` is `inline-size`, which has no `cqh`.
 */
export const BOARD_STAGE_WIDTH =
  "w-full min-w-0 max-w-[32rem] lg:max-w-[min(100svh-9rem,100%)]";

/**
 * Grid, not flex: the panel gets a width *range*, so it grows with the
 * window while the board takes what is left. `minmax(0,1fr)` is what
 * lets the board column shrink — a track's default minimum is its
 * content, which would push the panel off screen.
 *
 * `auto-rows-min` stops the board painting over the panel when stacked:
 * the default `auto` track shares the container's height between the
 * rows instead of giving each what it asked for. Side by side from `lg`,
 * one row meant to fill the screen — `fr`.
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

/** The board and whatever sits directly above or below it, centred in
 * the column and vertically centred once the two share a screenful. */
export function BoardColumn({
  label,
  children,
  className,
}: {
  /** Accessible name for the region — already translated. */
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

/** Everything that is not the board: its own scroll boundary, so a long
 * variation tree or scoresheet never grows the screen. */
export function BoardPanel({
  label,
  children,
  className,
}: {
  /** Accessible name for the region — already translated. */
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <aside
      aria-label={label}
      className={cn(
        "bg-card flex min-h-0 flex-col overflow-hidden rounded-lg border",
        className,
      )}
    >
      {children}
    </aside>
  );
}

/**
 * What the board is showing, said out loud.
 *
 * The squares are drawn as a grid of divs with no accessible name, so a
 * person using a screen reader hears the region's name on arriving and
 * nothing whatsoever on stepping through — the one control that changes
 * the whole screen would be silent. `polite` because the move is a
 * consequence of their own action, not an interruption.
 *
 * It is also the only way a test can ask what the board shows without
 * reaching into the chessboard library, and that is not a coincidence:
 * the board had no answer to give anyone.
 */
export function BoardStatus({ children }: { children: React.ReactNode }) {
  return (
    <p aria-live="polite" className="sr-only">
      {children}
    </p>
  );
}

/**
 * The stage while it loads, at the size it will be.
 *
 * A placeholder that is smaller than what replaces it is worse than none:
 * the board arrives, everything below it jumps, and the screen looks
 * broken at the exact moment a person is deciding whether it works. So
 * this uses the real width — `BOARD_STAGE_WIDTH`, the same class the
 * board itself gets — inside the real grid, and reserves the row the
 * controls take.
 */
export function BoardStageSkeleton({
  label,
  panel,
}: {
  /** Announced while the screen is empty — already translated. */
  label: string;
  /** The panel's shape, when a screen's is worth previewing. */
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
