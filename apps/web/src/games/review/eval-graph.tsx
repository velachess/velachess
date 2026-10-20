import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

import type { BadgeTone } from "@velachess/ui/chess/board-theme";
import { EvaluationChart } from "@velachess/ui/charts/evaluation-chart";
import type { EvaluationPoint } from "@velachess/ui/charts/evaluation-chart";
import { Skeleton } from "@velachess/ui/components/skeleton";

import type { GradedPly, MoveCategory } from "../analysis/index.ts";
import { CATEGORY_BADGE, whiteShareOf } from "./move-presentation.ts";

/**
 * What the graph marks.
 *
 * The chart draws a dot wherever a point carries a tone, and this is
 * where the product decides which moves deserve one. A game is mostly
 * good and best moves; a dot on each turns an 80px strip into a row of
 * dots and buries the three that matter. The curve already shows every
 * move, and the scoresheet names them all.
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
  /** Grades in ply order — shorter than the game while the run streams. */
  graded: readonly GradedPly[];
  /** The axis, which is not the data: pinning it stops the curve
   * rescaling on every chunk while the analysis streams in. */
  totalPlies: number;
  /** The ply currently selected in the replay. */
  selectedPly?: number;
  /** Called with the nearest move when anywhere on the graph is clicked. */
  onSelectPly?: (ply: number) => void;
}

/** Winning chances, not centipawns: cp is unbounded and one mate score flattens every other move. `domain` is fixed to avoid the same distortion. */
export function EvalGraph({
  graded,
  totalPlies,
  selectedPly,
  onSelectPly,
}: EvalGraphProps) {
  const { i18n } = useLingui();

  if (graded.length === 0) {
    // Skeleton, not an empty state: same height as the curve it becomes, so nothing shifts.
    return (
      <Skeleton
        className="h-20 w-full rounded-lg"
        aria-label={i18n._(GRAPH_COPY.empty)}
      />
    );
  }

  // Plies the run has not reached yet hold the last known share, so the
  // curve ends flat instead of dropping to the floor while it streams.
  const pending = whiteShareOf(graded.at(-1)!.evalAfter);

  // Toned only where the move went wrong.
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
