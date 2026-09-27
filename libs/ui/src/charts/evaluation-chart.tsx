import { useCallback, useMemo } from "react";
import { Line, LineChart, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";

import type { BadgeTone } from "../chess/board-theme.ts";
import { BADGE_TONE_COLOR } from "../chess/board-theme.ts";
import { cn } from "../lib/utils.ts";

export interface EvaluationPoint {
  ply: number;
  value: number;
  tone?: BadgeTone | undefined;
  label?: string | undefined;
  san?: string | undefined;
  score?: string | undefined;
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

  const color = getPointColor(payload.tone, defaultColor);
  const radius = payload.tone ? 3 : 2;

  return (
    <circle
      cx={cx}
      cy={cy}
      r={radius}
      fill={color}
      stroke="var(--background)"
      strokeWidth={0}
      className={cn("transition-all duration-150", onSelectPly && "cursor-pointer")}
      onClick={() => onSelectPly?.(payload.ply)}
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

export function EvaluationChart({
  data,
  domain,
  color = "var(--primary)",
  title,
  className,
  selectedPly,
  onSelectPly,
}: EvaluationChartProps) {
  const chartData = useMemo(() => data, [data]);

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

  return (
    <div role="img" aria-label={title} className={cn("h-full w-full", className)}>
      <ResponsiveContainer
        width="100%"
        height="100%"
        initialDimension={{ width: 320, height: 80 }}
      >
        <LineChart data={chartData} margin={{ top: 6, right: 6, bottom: 6, left: 6 }}>
          <XAxis dataKey="ply" hide />
          <YAxis domain={domain ?? ["auto", "auto"]} hide />
          {typeof selectedPly === "number" && (
            <ReferenceLine x={selectedPly} stroke={color} strokeWidth={1} />
          )}
          <Line
            type="linear"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={renderDot}
            activeDot={{ r: 4, fill: color, stroke: "var(--background)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}