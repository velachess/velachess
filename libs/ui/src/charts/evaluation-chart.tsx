import { useCallback } from "react";
// react-doctor-disable-next-line react-doctor/prefer-dynamic-import
import {
  DefaultZIndexes,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  ZIndexLayer,
  useChartHeight,
  useChartWidth,
  useXAxisInverseDataSnapScale,
  useXAxisScale,
} from "recharts";

import type { BadgeTone } from "../chess/board-theme.ts";
import { BADGE_TONE_COLOR } from "../chess/board-theme.ts";
import { cn } from "../lib/utils.ts";

export interface EvaluationPoint {
  ply: number;
  value: number;
  tone?: BadgeTone | undefined;
}

export interface EvaluationChartProps {
  data: EvaluationPoint[];
  domain?: [number, number];
  color?: string;
  title: string;
  className?: string;
  selectedPly?: number | undefined;
  onSelectPly?: ((ply: number) => void) | undefined;
}

/**
 * Only a notable move gets a dot.
 *
 * A dot per ply turns an 80px strip into noise — the curve already
 * shows every move, and the scoresheet names them. Lichess and
 * chess.com mark the mistakes and leave the rest to the line, so the
 * eye lands on what went wrong. Any ply stays selectable: the click
 * target below is the whole plot, not these dots.
 */
function MoveDot({
  cx,
  cy,
  payload,
  onSelectPly,
}: {
  cx?: number | undefined;
  cy?: number | undefined;
  payload: EvaluationPoint;
  onSelectPly?: ((ply: number) => void) | undefined;
}) {
  if (cx === undefined || cy === undefined || !payload.tone) return null;

  return (
    <circle
      cx={cx}
      cy={cy}
      r={5}
      fill={BADGE_TONE_COLOR[payload.tone]}
      // The curve runs under the dots; a ring in the page's own
      // background is what keeps a dot legible where they cross.
      stroke="var(--background)"
      strokeWidth={1.5}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelectPly?.(payload.ply);
        }
      }}
    />
  );
}

/**
 * The selected ply, marked edge to edge.
 *
 * `ReferenceLine` stops at the plot area, so the chart's margin stays
 * blank above and below it — in an 80px strip that reads as a line that
 * failed to reach. This draws in the chart's own coordinates instead,
 * spanning the full height the way Lichess and chess.com mark the move.
 */
function SelectedPlyMarker({ ply }: { ply: number | undefined }) {
  const height = useChartHeight();
  const scale = useXAxisScale();
  if (ply === undefined || !height || !scale) return null;

  const x = scale(ply);
  if (typeof x !== "number") return null;

  return (
    // Over the curve, under the click target: a marker on top of the
    // data that never swallows a click meant for the plot.
    <ZIndexLayer zIndex={DefaultZIndexes.activeDot}>
      <line
        x1={x}
        x2={x}
        y1={0}
        y2={height}
        stroke="var(--info)"
        strokeWidth={2}
        data-slot="evaluation-chart-selected-ply"
      />
    </ZIndexLayer>
  );
}

/** The whole plot is the click target, not just the 2px dots: the x scale snaps a click to the nearest ply. */
function PlotClickTarget({
  onSelectPly,
}: {
  onSelectPly?: ((ply: number) => void) | undefined;
}) {
  const width = useChartWidth();
  const height = useChartHeight();
  const snapToNearestPly = useXAxisInverseDataSnapScale();
  if (!onSelectPly || !width || !height || !snapToNearestPly) return null;

  return (
    <ZIndexLayer zIndex={DefaultZIndexes.activeDot + 1}>
      <rect
        x={0}
        y={0}
        width={width}
        height={height}
        fill="transparent"
        data-slot="evaluation-chart-click-target"
        className="cursor-pointer"
        // ZIndexLayer's group is focusable; letting the click focus it rings the whole chart.
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => {
          const bounds = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
          if (!bounds) return;
          const ply = snapToNearestPly(event.clientX - bounds.left);
          if (typeof ply === "number") onSelectPly(ply);
        }}
      />
    </ZIndexLayer>
  );
}

export function EvaluationChart({
  data,
  domain,
  color = "var(--primary)",
  title,
  className,
  selectedPly,
  onSelectPly,
}: EvaluationChartProps) {
  const renderDot = useCallback(
    (props: Record<string, unknown>) => {
      const { cx, cy, payload } = props as {
        cx?: number;
        cy?: number;
        payload: EvaluationPoint;
      };
      return <MoveDot cx={cx} cy={cy} payload={payload} onSelectPly={onSelectPly} />;
    },
    [onSelectPly],
  );

  // A selection the data does not hold is no selection: the consumer's
  // "nothing selected" value never has to be a particular number.
  const markedPly = data.find((point) => point.ply === selectedPly)?.ply;

  return (
    <div role="img" aria-label={title} className={cn("h-full w-full", className)}>
      <ResponsiveContainer
        width="100%"
        height="100%"
        initialDimension={{ width: 320, height: 80 }}
      >
        <LineChart
          data={data}
          margin={{ top: 6, right: 6, bottom: 6, left: 6 }}
          accessibilityLayer={false}
        >
          <XAxis dataKey="ply" hide />
          <YAxis domain={domain ?? ["auto", "auto"]} hide />
          <Line
            type="linear"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={renderDot}
            // No hover affordance: the marker shows the selection, and a
            // dot that appears under the pointer only competes with it.
            activeDot={false}
            isAnimationActive={false}
          />
          {/* The marker, not a hover card: where the board sits is
              persistent information the graph should keep showing. */}
          <SelectedPlyMarker ply={markedPly} />
          <PlotClickTarget onSelectPly={onSelectPly} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
