import { useCallback, useMemo } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { cn } from "../lib/utils.ts";

export type MoveCategory = "best" | "good" | "inaccuracy" | "mistake" | "blunder";

export interface EvaluationPoint {
  ply: number;
  value: number;
  category?: MoveCategory;
  san?: string;
  score?: string;
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

const CATEGORY_COLORS: Record<MoveCategory, string> = {
  best: "var(--move-ok)",
  good: "var(--move-ok)",
  inaccuracy: "var(--move-inaccuracy)",
  mistake: "var(--move-mistake)",
  blunder: "var(--move-blunder)",
};

function getPointColor(
  category?: MoveCategory,
  defaultColor: string = "var(--primary)",
): string {
  return category ? CATEGORY_COLORS[category] : defaultColor;
}

function CustomDot({
  cx,
  cy,
  payload,
  selectedPly,
  defaultColor,
  onSelectPly,
}: {
  cx?: number | undefined;
  cy?: number | undefined;
  payload: EvaluationPoint;
  selectedPly?: number | undefined;
  defaultColor: string;
  onSelectPly?: ((ply: number) => void) | undefined;
}) {
  if (cx === undefined || cy === undefined) return null;

  const isSelected = selectedPly === payload.ply;
  const color = getPointColor(payload.category, defaultColor);
  const radius = isSelected ? 4 : payload.category ? 3 : 2;
  const strokeWidth = isSelected ? 2 : 0;

  return (
    <circle
      cx={cx}
      cy={cy}
      r={radius}
      fill={color}
      stroke="var(--background)"
      strokeWidth={strokeWidth}
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

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: EvaluationPoint }>;
}) {
  if (!active || !payload?.length) return null;

  const point = payload[0]?.payload;
  if (!point) return null;

  const color = getPointColor(point.category);

  return (
    <div className="rounded border bg-background p-2 text-sm shadow-md">
      <div className="font-medium" style={{ color }}>
        {point.san ?? `Ply ${point.ply}`}
      </div>
      {point.category && (
        <div className="capitalize text-muted-foreground">{point.category}</div>
      )}
      {point.score && (
        <div className="font-mono text-xs text-muted-foreground">{point.score}</div>
      )}
    </div>
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
          selectedPly={selectedPly}
          defaultColor={color}
          onSelectPly={onSelectPly}
        />
      );
    },
    [selectedPly, color, onSelectPly],
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
          <Tooltip content={<CustomTooltip />} />
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
