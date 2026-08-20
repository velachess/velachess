import { Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";

import { cn } from "../lib/utils.ts";

export interface EvaluationChartProps {
  data: number[];
  domain?: [number, number];
  color?: string;
  title: string;
  className?: string;
}

export function EvaluationChart({
  data,
  domain,
  color = "var(--primary)",
  title,
  className,
}: EvaluationChartProps) {
  const chartData = data.map((value, index) => ({ ply: index + 1, value }));

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
          <Line
            type="linear"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={{ r: 2, fill: color, stroke: color }}
            activeDot={{ r: 3, fill: color, stroke: color }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
