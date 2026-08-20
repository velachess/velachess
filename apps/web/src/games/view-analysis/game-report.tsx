import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

import { Item, ItemContent, ItemMedia, ItemTitle } from "@velachess/ui/components/item";
import { BookOpen } from "@velachess/ui/icons";
import { cn } from "@velachess/ui/lib/utils";

import { categoriesInOrder, type SideBreakdown } from "../analysis-read.ts";
import type { MoveCategory } from "../analysis-contract.ts";

const REPORT_COPY = {
  unknownOpening: msg`Opening not recognised`,
} as const;

const CATEGORY_LABELS: Record<MoveCategory, MessageDescriptor> = {
  best: msg`Best`,
  good: msg`Good`,
  inaccuracy: msg`Inaccuracy`,
  mistake: msg`Mistake`,
  blunder: msg`Blunder`,
};

/** The theme's severity tokens, mirroring `engine_category` in the database. */
const CATEGORY_TONE: Record<MoveCategory, string> = {
  best: "text-move-ok",
  good: "text-move-ok",
  inaccuracy: "text-move-inaccuracy",
  mistake: "text-move-mistake",
  blunder: "text-move-blunder",
};

export interface GameReportProps {
  breakdown: SideBreakdown;
  whiteName: string;
  blackName: string;
  openingName: string | null;
  openingEco: string | null;
}

export function GameReport({
  breakdown,
  whiteName,
  blackName,
  openingName,
  openingEco,
}: GameReportProps) {
  const { i18n } = useLingui();

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
          {categoriesInOrder().map((category) => (
            <div
              key={category}
              className="grid grid-cols-[3rem_1fr_3rem] items-center px-2 py-2"
            >
              <dd className="text-left text-sm font-semibold tabular-nums">
                {i18n.number(breakdown.white[category])}
              </dd>
              <dt
                className={cn("text-center text-sm font-medium", CATEGORY_TONE[category])}
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
