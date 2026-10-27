import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

import { BOARD_STAGE_WIDTH, BoardStage } from "@velachess/ui/chess/board-stage";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@velachess/ui/components/empty";
import { Skeleton } from "@velachess/ui/components/skeleton";
import { OctagonXIcon } from "@velachess/ui/icons";
import { cn } from "@velachess/ui/lib/utils";

const REVIEW_COPY = {
  loading: msg`Loading the game…`,
  loadError: msg`Couldn't load this game.`,
} as const;

const SCORESHEET_SKELETON_CELLS = Array.from(
  { length: 24 },
  (_, index) => `scoresheet-cell-${index}`,
);

/** The game itself could not be read, which is not an analysis failure. */
export function GameError() {
  const { i18n } = useLingui();

  return (
    <div className="p-6">
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyMedia variant="icon" className="text-destructive">
            <OctagonXIcon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{i18n._(REVIEW_COPY.loadError)}</EmptyTitle>
        </EmptyHeader>
      </Empty>
    </div>
  );
}

export function AnalysisSkeleton() {
  const { i18n } = useLingui();

  return (
    <output
      aria-label={i18n._(REVIEW_COPY.loading)}
      className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 @4xl/content:overflow-hidden"
    >
      <BoardStage>
        {/* The board's real width, so nothing shifts when it lands: a
            placeholder narrower than what replaces it makes the page jump
            at the moment a person is deciding whether it works. */}
        <section className="flex min-w-0 flex-col items-center justify-center gap-2">
          <Skeleton className={cn("h-4", BOARD_STAGE_WIDTH)} />
          <Skeleton className={cn("aspect-square rounded-lg", BOARD_STAGE_WIDTH)} />
          <Skeleton className={cn("h-4", BOARD_STAGE_WIDTH)} />
        </section>

        <aside className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card">
          <div className="shrink-0 border-b p-3">
            <Skeleton className="h-20 w-full rounded-lg" />
          </div>
          <div className="shrink-0 border-b p-3">
            <div className="mx-auto flex w-fit gap-2 rounded-lg bg-muted p-[3px]">
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-7 w-20" />
            </div>
            <div className="flex flex-col gap-3 pt-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          </div>
          <div className="min-h-0 flex-1 p-3">
            <div className="grid grid-cols-[2.25rem_1fr_1fr] gap-2">
              {SCORESHEET_SKELETON_CELLS.map((cell) => (
                <Skeleton key={cell} className="h-5 w-full" />
              ))}
            </div>
          </div>
          <div className="shrink-0 border-t p-3">
            <Skeleton className="h-5 w-3/4" />
          </div>
          <div className="flex shrink-0 gap-2 border-t p-3">
            <Skeleton className="h-11 flex-1" />
            <Skeleton className="h-11 flex-1" />
          </div>
        </aside>
      </BoardStage>
    </output>
  );
}
