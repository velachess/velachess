import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

import { EvaluationChart } from "@velachess/ui/charts/evaluation-chart";
import { Skeleton } from "@velachess/ui/components/skeleton";

import type { EvalPoint } from "../analysis-read.ts";

const GRAPH_COPY = {
  title: msg`Evaluation over the game`,
  empty: msg`The curve appears as the analysis lands.`,
} as const;

export interface EvalGraphProps {
  points: EvalPoint[];
  /** The axis, which is not the data: pinning it stops the curve
   * rescaling on every chunk while the analysis streams in. */
  totalPlies: number;
}

/** Winning chances, not centipawns: cp is unbounded and one mate score flattens every other move. `domain` is fixed to avoid the same distortion. */
export function EvalGraph({ points, totalPlies }: EvalGraphProps) {
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

  // Padded to the full game so a half-streamed curve holds its final
  // width instead of stretching and snapping back.
  const series = Array.from(
    { length: Math.max(totalPlies, points.length) },
    (_, index) => points[index]?.winChance ?? points.at(-1)?.winChance ?? 0.5,
  );

  return (
    <div className="h-20 overflow-hidden rounded-lg border bg-muted/30">
      <EvaluationChart data={series} domain={[0, 1]} title={i18n._(GRAPH_COPY.title)} />
    </div>
  );
}
