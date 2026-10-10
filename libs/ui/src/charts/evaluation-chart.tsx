import { useCallback } from "react";
// react-doctor-disable-next-line react-doctor/prefer-dynamic-import
import {
  DefaultZIndexes,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
  ZIndexLayer,
  useChartHeight,
  useChartWidth,
  useXAxisInverseDataSnapScale,
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

function getPointColor(
  tone?: BadgeTone,
  defaultColor: string = "var(--primary)",
): string {
  return tone ? BADGE_TONE_COLOR[tone] : defaultColor;
}

function CustomDot({
  cx,
  cy,
  payload,
  defaultColor,
  onSelectPly,
}: {
  cx?: number | undefined;
  cy?: number | undefined;
  payload: EvaluationPoint;
  defaultColor: string;
  onSelectPly?: ((ply: number) => void) | undefined;
}) {
  if (cx === undefined || cy === undefined) return null;

  return (
    <circle
      cx={cx}
      cy={cy}
      r={payload.tone ? 3 : 2}
      fill={getPointColor(payload.tone, defaultColor)}
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
      return (
        <CustomDot
          cx={cx}
          cy={cy}
          payload={payload}
          defaultColor={color}
          onSelectPly={onSelectPly}
        />
      );
    },
    [color, onSelectPly],
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
          {/* The marker, not a hover card: where the chart sits is persistent
              information, and the default zIndex keeps it under the click target. */}
          {markedPly !== undefined && (
            <ReferenceLine x={markedPly} stroke="var(--chart-3)" strokeWidth={2} />
          )}
          <Line
            type="linear"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={renderDot}
            isAnimationActive={false}
          />
          <PlotClickTarget onSelectPly={onSelectPly} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
