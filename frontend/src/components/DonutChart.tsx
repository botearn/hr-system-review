import { useState } from "react";

export interface DonutSlice {
  key: string;
  label: string;
  count: number;
  color: string;
}

interface Props {
  slices: DonutSlice[];
  /** Diameter of the donut, px. */
  size?: number;
  /** Fraction of `size` taken up by the donut hole (0..1). */
  innerRatio?: number;
  /** Center label rendered inside the hole. Falls back to total. */
  centerLabel?: string;
  centerSubtitle?: string;
  /** Click a slice to drill down. */
  onSliceClick?: (slice: DonutSlice) => void;
}

const TAU = Math.PI * 2;

function polar(cx: number, cy: number, r: number, theta: number): [number, number] {
  // theta=0 at 12 o'clock, going clockwise (matches user expectation)
  return [cx + r * Math.sin(theta), cy - r * Math.cos(theta)];
}

function arcPath(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  startTheta: number,
  endTheta: number,
): string {
  const [x1, y1] = polar(cx, cy, rOuter, startTheta);
  const [x2, y2] = polar(cx, cy, rOuter, endTheta);
  const [x3, y3] = polar(cx, cy, rInner, endTheta);
  const [x4, y4] = polar(cx, cy, rInner, startTheta);
  const largeArc = endTheta - startTheta > Math.PI ? 1 : 0;
  return [
    `M ${x1} ${y1}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${x4} ${y4}`,
    "Z",
  ].join(" ");
}

export default function DonutChart({
  slices,
  size = 160,
  innerRatio = 0.62,
  centerLabel,
  centerSubtitle,
  onSliceClick,
}: Props) {
  const total = slices.reduce((a, s) => a + s.count, 0);
  const [hover, setHover] = useState<string | null>(null);
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size / 2 - 1; // 1px breathing room
  const rInner = rOuter * innerRatio;

  if (total === 0) {
    return (
      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size }}>
        <circle cx={cx} cy={cy} r={rOuter} fill="#f5f5f8" />
        <circle cx={cx} cy={cy} r={rInner} fill="#fff" />
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fill="#b8b8c4" fontSize={12}>
          暂无数据
        </text>
      </svg>
    );
  }

  // Pre-compute slice angles
  let theta = 0;
  const arcs = slices.map((s) => {
    const span = (s.count / total) * TAU;
    const start = theta;
    const end = theta + span;
    theta = end;
    return { ...s, start, end, span };
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        style={{ width: size, height: size, flexShrink: 0 }}
        role="img"
      >
        {arcs.map((a) => {
          // Single-slice 100% case: a full circle can't be a single arc, draw two halves.
          const isFull = Math.abs(a.span - TAU) < 1e-6;
          const path = isFull
            ? `${arcPath(cx, cy, rOuter, rInner, 0, Math.PI)} ${arcPath(cx, cy, rOuter, rInner, Math.PI, TAU - 1e-6)}`
            : arcPath(cx, cy, rOuter, rInner, a.start, a.end);
          const dim = hover != null && hover !== a.key;
          return (
            <path
              key={a.key}
              d={path}
              fill={a.color}
              opacity={dim ? 0.35 : 1}
              style={{
                cursor: onSliceClick ? "pointer" : "default",
                transition: "opacity 160ms",
              }}
              onMouseEnter={() => setHover(a.key)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSliceClick?.(a)}
            >
              <title>
                {a.label}: {a.count} ({((a.count / total) * 100).toFixed(1)}%)
              </title>
            </path>
          );
        })}
        <text
          x={cx}
          y={cy - 6}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#1a1a4e"
          fontSize={22}
          fontWeight={700}
        >
          {centerLabel ?? total.toLocaleString()}
        </text>
        <text
          x={cx}
          y={cy + 14}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#8c8c9a"
          fontSize={11}
        >
          {centerSubtitle ?? "总计"}
        </text>
      </svg>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
        {arcs.map((a) => {
          const pct = ((a.count / total) * 100).toFixed(1);
          const dim = hover != null && hover !== a.key;
          return (
            <div
              key={a.key}
              onMouseEnter={() => setHover(a.key)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSliceClick?.(a)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
                opacity: dim ? 0.5 : 1,
                cursor: onSliceClick ? "pointer" : "default",
                transition: "opacity 160ms",
              }}
            >
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: 2,
                  background: a.color,
                  flexShrink: 0,
                }}
              />
              <span style={{ color: "#52527a", flex: 1, minWidth: 0 }}>{a.label}</span>
              <span style={{ color: "#1a1a4e", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                {a.count}
              </span>
              <span style={{ color: "#8c8c9a", fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
                {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
