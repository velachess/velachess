import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@velachess/ui/components/item";
import { PieceIcon, pieceKindOf } from "@velachess/ui/chess/piece-icon";
import { Button } from "@velachess/ui/components/button";
import { cn } from "@velachess/ui/lib/utils";

import { bestMoveSan, formatScore, moveNumberOf, sideOfPly } from "../analysis-read.ts";
import type { GradedPly, MoveCategory, ReplayMove } from "../analysis-contract.ts";

const INSIGHT_COPY = {
  start: msg`The starting position.`,
  startHint: msg`Step forward to walk through the game.`,
  waiting: msg`Not graded yet`,
  waitingHint: msg`The engine reaches this move shortly.`,
  evaluation: msg`Evaluation`,
  showBest: msg`Show the engine's move on the board`,
  bestWas: msg`Best was`,
  region: msg`Move insight`,
} as const;

const VERDICTS: Record<MoveCategory, MessageDescriptor> = {
  best: msg`is the best move`,
  good: msg`is a solid move`,
  inaccuracy: msg`is an inaccuracy`,
  mistake: msg`is a mistake`,
  blunder: msg`is a blunder`,
};

const EXPLANATIONS: Record<MoveCategory, MessageDescriptor> = {
  best: msg`Nothing in the position was worth more.`,
  good: msg`It keeps the position healthy without giving anything away.`,
  inaccuracy: msg`It gives away a little of what the position was worth.`,
  mistake: msg`It hands over a real part of the advantage.`,
  blunder: msg`It changes who is winning.`,
};

const TONES: Record<MoveCategory, string> = {
  best: "text-move-ok",
  good: "text-move-ok",
  inaccuracy: "text-move-inaccuracy",
  mistake: "text-move-mistake",
  blunder: "text-move-blunder",
};

const BADGE_TONES: Record<MoveCategory, string> = {
  best: "bg-move-ok",
  good: "bg-move-ok",
  inaccuracy: "bg-move-inaccuracy",
  mistake: "bg-move-mistake",
  blunder: "bg-move-blunder",
};

const BADGE_GLYPHS: Record<MoveCategory, string> = {
  best: "!",
  good: "✓",
  inaccuracy: "?!",
  mistake: "?",
  blunder: "??",
};

export interface MoveInsightProps {
  move: ReplayMove | undefined;
  /** The engine's read of it, absent until the analysis reaches this ply. */
  graded: GradedPly | undefined;
  /**
   * Show the engine's move on the board. Absent leaves the suggestion as
   * text — a screen that cannot act on it should not offer a button.
   */
  onShowBest?: ((san: string) => void) | undefined;
}

export function MoveInsight({ move, graded, onShowBest }: MoveInsightProps) {
  const { i18n } = useLingui();

  if (!move) {
    return (
      <InsightShell>
        <ItemContent>
          <ItemTitle>{i18n._(INSIGHT_COPY.start)}</ItemTitle>
          <ItemDescription>{i18n._(INSIGHT_COPY.startHint)}</ItemDescription>
        </ItemContent>
      </InsightShell>
    );
  }

  const side = sideOfPly(move.ply);
  const moveSuffix = side === "white" ? "." : "…";
  const heading = (
    <span className="flex items-center gap-1.5 text-base font-semibold">
      <PieceIcon kind={pieceKindOf(move.san)} side={side} />
      <span>
        {moveNumberOf(move.ply)}
        {moveSuffix} {move.san}
      </span>
    </span>
  );

  if (!graded) {
    return (
      <InsightShell>
        <ItemContent>
          <ItemTitle>
            {heading}
            <span className="text-sm font-normal text-muted-foreground">
              {i18n._(INSIGHT_COPY.waiting)}
            </span>
          </ItemTitle>
          <ItemDescription>{i18n._(INSIGHT_COPY.waitingHint)}</ItemDescription>
        </ItemContent>
      </InsightShell>
    );
  }

  const best = bestMoveSan(graded);

  return (
    <InsightShell>
      <ItemContent>
        <ItemTitle>
          {heading}
          <span className={cn(TONES[graded.category])}>
            {i18n._(VERDICTS[graded.category])}
          </span>
        </ItemTitle>

        <ItemDescription>{i18n._(EXPLANATIONS[graded.category])}</ItemDescription>

        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">{i18n._(INSIGHT_COPY.evaluation)}</dt>
            <dd className="font-mono font-medium tabular-nums">
              {formatScore(graded.evalAfter)}
            </dd>
          </div>
          <BestMove played={move.san} best={best} onShowBest={onShowBest} />
        </dl>
      </ItemContent>

      <ItemActions>
        <GradeBadge category={graded.category} />
      </ItemActions>
    </InsightShell>
  );
}

function BestMove({
  played,
  best,
  onShowBest,
}: {
  played: string;
  best: string | null;
  onShowBest: ((san: string) => void) | undefined;
}) {
  const { i18n } = useLingui();

  if (!best || best === played) return null;

  return (
    <div className="flex items-center gap-1.5">
      <dt className="text-muted-foreground">{i18n._(INSIGHT_COPY.bestWas)}</dt>
      <dd className="font-medium">
        <BestMoveValue best={best} onShowBest={onShowBest} />
      </dd>
    </div>
  );
}

function BestMoveValue({
  best,
  onShowBest,
}: {
  best: string;
  onShowBest: ((san: string) => void) | undefined;
}) {
  const { i18n } = useLingui();

  if (!onShowBest) return best;

  return (
    <Button
      variant="link"
      size="sm"
      className="text-primary h-auto p-0 font-semibold underline underline-offset-2"
      aria-label={i18n._(INSIGHT_COPY.showBest)}
      onClick={() => onShowBest(best)}
    >
      {best}
    </Button>
  );
}

/**
 * Redundant on purpose: colour at a glance, symbol without colour
 * vision, sentence for a screen reader — so the badge hides from one.
 */
function GradeBadge({ category }: { category: MoveCategory }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-background",
        BADGE_TONES[category],
      )}
    >
      {BADGE_GLYPHS[category]}
    </span>
  );
}

function InsightShell({ children }: { children: React.ReactNode }) {
  const { i18n } = useLingui();

  return (
    <section aria-label={i18n._(INSIGHT_COPY.region)} className="p-3">
      <Item variant="outline" className="min-h-[5.5rem] items-start">
        {children}
      </Item>
    </section>
  );
}
