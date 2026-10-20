import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

import { Item, ItemContent, ItemMedia, ItemTitle } from "@velachess/ui/components/item";
import { BookOpen } from "@velachess/ui/icons";
import { cn } from "@velachess/ui/lib/utils";

import { sideToMoveOf } from "@velachess/chess";

import { MOVE_CATEGORIES, type GradedPly, type MoveCategory } from "../analysis/index.ts";
import type { ReplayMove } from "./game-record.ts";
import { CATEGORY_LABELS, CATEGORY_TEXT_TONE } from "./move-presentation.ts";

const REPORT_COPY = {
  unknownOpening: msg`Opening not recognised`,
} as const;

type CategoryCounts = Record<MoveCategory, number>;

function emptyCounts(): CategoryCounts {
  return { best: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 };
}

/**
 * Split by side because the interesting number is *yours*. Which side
 * played a ply comes from the position it was played from — a game can
 * start from a FEN with Black to move, and counting plies would then
 * credit every grade to the wrong player.
 */
function summarize(graded: readonly GradedPly[], moves: readonly ReplayMove[]) {
  const breakdown = { white: emptyCounts(), black: emptyCounts() };

  for (const grade of graded) {
    const played = moves[grade.ply - 1];
    if (played) breakdown[sideToMoveOf(played.fenBefore)][grade.category] += 1;
  }

  return breakdown;
}

export interface GameReportProps {
  /** Grades in ply order — shorter than the game while the run streams. */
  graded: readonly GradedPly[];
  /** The replayed game, which is what says who played each ply. */
  moves: readonly ReplayMove[];
  whiteName: string;
  blackName: string;
  openingName: string | null;
  openingEco: string | null;
}

export function GameReport({
  graded,
  moves,
  whiteName,
  blackName,
  openingName,
  openingEco,
}: GameReportProps) {
  const { i18n } = useLingui();
  const breakdown = summarize(graded, moves);

  return (
    <div className="flex flex-col gap-3 p-3">
      <Item variant="outline">
        <ItemMedia variant="icon">
          <BookOpen className="text-muted-foreground" />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>
            <OpeningEco openingEco={openingEco} />
            <OpeningName openingName={openingName} />
          </ItemTitle>
        </ItemContent>
      </Item>

      {/* Mounted from the first render, counting from zero — the zeros are true while it waits, and swapping a placeholder for the table later would move every row on the panel. */}
      <div className="overflow-hidden rounded-lg border">
        <div className="grid grid-cols-[3rem_1fr_3rem] items-center border-b bg-muted/50 px-2 py-1.5 text-[11px] text-muted-foreground">
          <span className="truncate text-left" title={whiteName}>
            {whiteName}
          </span>
          <span aria-hidden="true" />
          <span className="truncate text-right" title={blackName}>
            {blackName}
          </span>
        </div>

        <dl className="divide-y divide-border/50">
          {MOVE_CATEGORIES.map((category) => (
            <div
              key={category}
              className="grid grid-cols-[3rem_1fr_3rem] items-center px-2 py-2"
            >
              <dd className="text-left text-sm font-semibold tabular-nums">
                {i18n.number(breakdown.white[category])}
              </dd>
              <dt
                className={cn(
                  "text-center text-sm font-medium",
                  CATEGORY_TEXT_TONE[category],
                )}
              >
                {i18n._(CATEGORY_LABELS[category])}
              </dt>
              <dd className="text-right text-sm font-semibold tabular-nums">
                {i18n.number(breakdown.black[category])}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

function OpeningEco({ openingEco }: { openingEco: string | null }) {
  if (!openingEco) return null;

  return <span className="font-mono text-xs text-muted-foreground">{openingEco}</span>;
}

function OpeningName({ openingName }: { openingName: string | null }) {
  const { i18n } = useLingui();

  if (!openingName) return i18n._(REPORT_COPY.unknownOpening);
  return openingName;
}
