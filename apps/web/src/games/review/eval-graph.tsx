import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

import type { BadgeTone } from "@velachess/ui/chess/board-theme";
import { EvaluationChart } from "@velachess/ui/charts/evaluation-chart";
import type { EvaluationPoint } from "@velachess/ui/charts/evaluation-chart";
import { Skeleton } from "@velachess/ui/components/skeleton";

import type { GradedPly, MoveCategory } from "../analysis/index.ts";
import { CATEGORY_BADGE, whiteShareOf } from "./move-presentation.ts";

/**
 * The chart draws a dot wherever a point carries a tone. A game is mostly
 * good moves, so a dot on each buries the three that matter; the curve
 * already shows every move and the scoresheet names them all.
 */
const MARKED_CATEGORIES: ReadonlySet<MoveCategory> = new Set([
  "inaccuracy",
  "mistake",
  "blunder",
]);

function graphToneOf(category: MoveCategory): BadgeTone | undefined {
  return MARKED_CATEGORIES.has(category) ? CATEGORY_BADGE[category] : undefined;
}

const GRAPH_COPY = {
  title: msg`Evaluation over the game`,
  empty: msg`The curve appears as the analysis lands.`,
} as const;

export interface EvalGraphProps {
  /** In ply order, and shorter than the game while the run streams. */
  graded: readonly GradedPly[];
  /** The axis, not the data: pinning it stops the curve rescaling on every
   * chunk while the analysis streams. */
  totalPlies: number;
  selectedPly?: number;
  /** Called with the move nearest the click. */
  onSelectPly?: (ply: number) => void;
}

/** Winning chances, not centipawns: cp is unbounded and one mate score
 * flattens every other move, which a fixed `domain` also guards. */
export function EvalGraph({
  graded,
  totalPlies,
  selectedPly,
  onSelectPly,
}: EvalGraphProps) {
  const { i18n } = useLingui();

  if (graded.length === 0) {
    // The same height as the curve it becomes, so nothing shifts.
    return (
      <Skeleton
        className="h-20 w-full rounded-lg"
        aria-label={i18n._(GRAPH_COPY.empty)}
      />
    );
  }

  // Plies the run has not reached hold the last known share, so the curve
  // ends flat rather than dropping to the floor while it streams.
  const pending = whiteShareOf(graded.at(-1)!.evalAfter);

  const evaluationPoints: EvaluationPoint[] = Array.from(
    { length: Math.max(totalPlies, graded.length) },
    (_, index) => {
      const move = graded[index];
      if (!move) return { ply: index + 1, value: pending };

      return {
        ply: move.ply,
        value: whiteShareOf(move.evalAfter),
        tone: graphToneOf(move.category),
      };
    },
  );

  return (
    <div className="h-20 overflow-hidden rounded-lg border bg-muted/30">
      <EvaluationChart
        data={evaluationPoints}
        domain={[0, 1]}
        title={i18n._(GRAPH_COPY.title)}
        selectedPly={selectedPly}
        onSelectPly={onSelectPly}
      />
    </div>
  );
}
