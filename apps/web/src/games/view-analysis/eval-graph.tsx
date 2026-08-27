import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

import { EvaluationChart } from "@velachess/ui/charts/evaluation-chart";
import type { EvaluationPoint } from "@velachess/ui/charts/evaluation-chart";
import { Skeleton } from "@velachess/ui/components/skeleton";

import type { EvalPoint } from "../analysis-read.ts";
import { formatScore, moveNumberOf, sideOfPly } from "../analysis-read.ts";

const GRAPH_COPY = {
  title: msg`Evaluation over the game`,
  empty: msg`The curve appears as the analysis lands.`,
} as const;

export interface EvalGraphProps {
  points: EvalPoint[];
  /** The axis, which is not the data: pinning it stops the curve
   * rescaling on every chunk while the analysis streams in. */
  totalPlies: number;
  /** The ply currently selected in the replay. */
  selectedPly?: number;
  /** Called when a dot on the graph is clicked. */
  onSelectPly?: (ply: number) => void;
}

/** Winning chances, not centipawns: cp is unbounded and one mate score flattens every other move. `domain` is fixed to avoid the same distortion. */
export function EvalGraph({
  points,
  totalPlies,
  selectedPly,
  onSelectPly,
}: EvalGraphProps) {
  const { i18n } = useLingui();

  if (points.length === 0) {
    // Skeleton, not an empty state: same height as the curve it becomes, so nothing shifts.
    return (
      <Skeleton
        className="h-20 w-full rounded-lg"
        aria-label={i18n._(GRAPH_COPY.empty)}
      />
    );
  }

  // Build evaluation points with category colors and move info.
  const evaluationPoints: EvaluationPoint[] = Array.from(
    { length: Math.max(totalPlies, points.length) },
    (_, index) => {
      const point = points[index];
      if (!point) {
        return {
          ply: index + 1,
          value: points.at(-1)?.winChance ?? 0.5,
        };
      }

      const side = sideOfPly(point.ply);
      const moveSuffix = side === "white" ? "." : "…";
      const san = `${moveNumberOf(point.ply)}${moveSuffix} ${point.san ?? ""}`.trim();

      return {
        ply: point.ply,
        value: point.winChance,
        category: point.category,
        san,
        score: formatScore(point.evalAfter),
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
