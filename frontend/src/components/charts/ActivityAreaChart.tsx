import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltip } from "./ChartTooltip";

export interface ActivityPoint {
  day: string; // pre-formatted x-axis label, e.g. "05-08"
  跟进: number;
  状态变更: number;
}

interface Props {
  data: ActivityPoint[];
  height?: number;
  primaryColor?: string;
  accentColor?: string;
}

export default function ActivityAreaChart({
  data,
  height = 220,
  primaryColor = "#1a1a4e",
  accentColor = "#722ed1",
}: Props) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 12, right: 12, left: -8, bottom: 0 }}>
        <CartesianGrid
          stroke="#f0f0f5"
          strokeDasharray="3 4"
          vertical={false}
        />
        <XAxis
          dataKey="day"
          stroke="#b8b8c4"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          dy={6}
        />
        <YAxis
          stroke="#b8b8c4"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          width={32}
          allowDecimals={false}
        />
        <Tooltip
          content={<ChartTooltip />}
          cursor={{ stroke: "#d8d8e3", strokeWidth: 1, strokeDasharray: "3 3" }}
        />
        <Line
          type="linear"
          dataKey="跟进"
          stroke={primaryColor}
          strokeWidth={2}
          dot={{ r: 3, strokeWidth: 0, fill: primaryColor }}
          activeDot={{ r: 5, strokeWidth: 0 }}
          isAnimationActive
          animationDuration={500}
        />
        <Line
          type="linear"
          dataKey="状态变更"
          stroke={accentColor}
          strokeWidth={2}
          dot={{ r: 3, strokeWidth: 0, fill: accentColor }}
          activeDot={{ r: 5, strokeWidth: 0 }}
          isAnimationActive
          animationDuration={500}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
