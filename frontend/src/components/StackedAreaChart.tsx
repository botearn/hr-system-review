import { useEffect, useRef, useState } from "react";

export interface AreaSeries {
  key: string;
  label: string;
  color: string;
  /** Same length as `xLabels`. */
  values: number[];
}

interface Props {
  xLabels: string[];
  series: AreaSeries[];
  height?: number;
  /** Optional: custom tooltip body for an x-index. Falls back to per-series count. */
  renderTooltip?: (xIndex: number) => React.ReactNode;
  /** Optional click on an x-bucket. */
  onColumnClick?: (xIndex: number) => void;
}

const PADDING_L = 32; // y-axis label space
const PADDING_R = 12;
const PADDING_T = 8;
const PADDING_B = 22; // x-axis label space

export default function StackedAreaChart({
  xLabels,
  series,
  height = 160,
  renderTooltip,
  onColumnClick,
}: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(480);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.round(entry.contentRect.width);
        if (w > 0) setWidth(w);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = xLabels.length;
  const W = Math.max(width, 240);
  const H = height;
  const innerW = W - PADDING_L - PADDING_R;
  const innerH = H - PADDING_T - PADDING_B;

  if (n === 0 || series.length === 0) {
    return (
      <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: "#b8b8c4", fontSize: 12 }}>
        暂无数据
      </div>
    );
  }

  // Stack from bottom up: top of slice i = sum(values[0..i])
  const totals = Array.from({ length: n }, (_, i) =>
    series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0),
  );
  const yMax = Math.max(...totals, 1);
  const xStep = n > 1 ? innerW / (n - 1) : innerW;

  const xCoord = (i: number) => PADDING_L + (n > 1 ? i * xStep : innerW / 2);
  const yCoord = (v: number) => PADDING_T + innerH - (v / yMax) * innerH;

  // Build stacked polygons series-by-series, bottom-up.
  const cumulative = new Array(n).fill(0);
  const polys: { color: string; key: string; d: string }[] = [];
  for (const s of series) {
    const lower = cumulative.slice();
    const upper = cumulative.map((c, i) => c + (s.values[i] ?? 0));
    cumulative.splice(0, n, ...upper);
    const upPath = upper.map((v, i) => `${xCoord(i)},${yCoord(v)}`).join(" ");
    const downPath = lower
      .map((v, i) => `${xCoord(i)},${yCoord(v)}`)
      .reverse()
      .join(" ");
    polys.push({
      color: s.color,
      key: s.key,
      d: `${upPath} ${downPath}`,
    });
  }

  // y-axis ticks: 0, mid, max
  const ticks = [0, Math.round(yMax / 2), yMax];

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        style={{ display: "block" }}
        onMouseLeave={() => setHover(null)}
      >
        {/* y grid */}
        {ticks.map((t) => {
          const y = yCoord(t);
          return (
            <g key={`tick-${t}`}>
              <line
                x1={PADDING_L}
                x2={W - PADDING_R}
                y1={y}
                y2={y}
                stroke="#f0f0f5"
                strokeWidth={1}
              />
              <text
                x={PADDING_L - 6}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                fill="#b8b8c4"
                fontSize={10}
              >
                {t}
              </text>
            </g>
          );
        })}

        {/* stacked areas */}
        {polys.map((p) => (
          <polygon
            key={p.key}
            points={p.d}
            fill={p.color}
            fillOpacity={0.85}
            stroke={p.color}
            strokeWidth={1}
          />
        ))}

        {/* hover guide + columns */}
        {xLabels.map((_, i) => {
          const cx = xCoord(i);
          const colW = xStep > 0 ? xStep : innerW;
          return (
            <g key={`col-${i}`}>
              <rect
                x={cx - colW / 2}
                y={PADDING_T}
                width={colW}
                height={innerH}
                fill="transparent"
                style={{ cursor: onColumnClick ? "pointer" : "default" }}
                onMouseEnter={() => setHover(i)}
                onClick={() => onColumnClick?.(i)}
              />
              {hover === i && (
                <line
                  x1={cx}
                  x2={cx}
                  y1={PADDING_T}
                  y2={PADDING_T + innerH}
                  stroke="#1a1a4e"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  opacity={0.5}
                  pointerEvents="none"
                />
              )}
            </g>
          );
        })}

        {/* x labels — drop every other one if they'd overlap (min ~38px each) */}
        {xLabels.map((lbl, i) => {
          const skipEvery = xStep < 38 ? 2 : 1;
          if (i % skipEvery !== 0 && i !== n - 1) return null;
          return (
            <text
              key={`xl-${i}`}
              x={xCoord(i)}
              y={H - 6}
              textAnchor="middle"
              fill="#8c8c9a"
              fontSize={10}
            >
              {lbl}
            </text>
          );
        })}
      </svg>

      {/* legend */}
      <div
        style={{
          display: "flex",
          gap: 14,
          marginTop: 6,
          fontSize: 11,
          color: "#52527a",
          flexWrap: "wrap",
        }}
      >
        {series.map((s) => (
          <span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: 2,
                background: s.color,
                display: "inline-block",
              }}
            />
            {s.label}
          </span>
        ))}
      </div>

      {/* tooltip */}
      {hover != null && (
        <div
          style={{
            position: "absolute",
            left: `${(xCoord(hover) / W) * 100}%`,
            top: 4,
            transform: "translate(-50%, 0)",
            background: "#1a1a4e",
            color: "#fff",
            padding: "6px 10px",
            borderRadius: 6,
            fontSize: 11,
            lineHeight: 1.5,
            pointerEvents: "none",
            whiteSpace: "nowrap",
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
          }}
        >
          {renderTooltip ? (
            renderTooltip(hover)
          ) : (
            <>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>{xLabels[hover]}</div>
              {series.map((s) => (
                <div key={s.key}>
                  {s.label}: {s.values[hover] ?? 0}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
