/**
 * 纯 SVG 六边形雷达图,无第三方依赖。
 * values 映射到 0-100,按给定顺序(6 个维度)顺时针分布。
 */
interface Props {
  labels: string[];
  values: number[];
  size?: number;
  showLabels?: boolean;
  fillColor?: string;
  strokeColor?: string;
  gridLevels?: number;
}

export default function RadarChart({
  labels,
  values,
  size = 200,
  showLabels = true,
  fillColor = "rgba(22, 119, 255, 0.35)",
  strokeColor = "#1677ff",
  gridLevels = 4,
}: Props) {
  const n = labels.length;
  const cx = size / 2;
  const cy = size / 2;
  const padding = showLabels ? 42 : 8;
  const radius = size / 2 - padding;

  // 顶点从 12 点方向开始,顺时针
  const angleOf = (i: number) => -Math.PI / 2 + (i / n) * 2 * Math.PI;

  const outer = labels.map((_, i) => {
    const a = angleOf(i);
    return { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) };
  });

  // 数据多边形
  const poly = values
    .map((v, i) => {
      const r = (Math.max(0, Math.min(100, v)) / 100) * radius;
      const a = angleOf(i);
      return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
    })
    .join(" ");

  const gridPolys: string[] = [];
  for (let lvl = 1; lvl <= gridLevels; lvl++) {
    const r = (lvl / gridLevels) * radius;
    gridPolys.push(
      labels
        .map((_, i) => {
          const a = angleOf(i);
          return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
        })
        .join(" "),
    );
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* 网格 */}
      {gridPolys.map((pts, i) => (
        <polygon
          key={i}
          points={pts}
          fill="none"
          stroke="#d9d9d9"
          strokeWidth={0.8}
          strokeDasharray={i === gridPolys.length - 1 ? undefined : "2,2"}
        />
      ))}
      {/* 从中心到顶点的辐条 */}
      {outer.map((p, i) => (
        <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#e8e8e8" strokeWidth={0.8} />
      ))}
      {/* 数据多边形 */}
      <polygon points={poly} fill={fillColor} stroke={strokeColor} strokeWidth={1.5} />
      {/* 各顶点小圆点 */}
      {values.map((v, i) => {
        const r = (Math.max(0, Math.min(100, v)) / 100) * radius;
        const a = angleOf(i);
        return (
          <circle
            key={i}
            cx={cx + r * Math.cos(a)}
            cy={cy + r * Math.sin(a)}
            r={2.5}
            fill={strokeColor}
          />
        );
      })}
      {/* 文字标签 */}
      {showLabels &&
        labels.map((label, i) => {
          const a = angleOf(i);
          const lr = radius + 16;
          const tx = cx + lr * Math.cos(a);
          const ty = cy + lr * Math.sin(a);
          // 按位置对齐
          let anchor: "start" | "middle" | "end" = "middle";
          if (Math.cos(a) > 0.3) anchor = "start";
          else if (Math.cos(a) < -0.3) anchor = "end";
          return (
            <text
              key={i}
              x={tx}
              y={ty}
              textAnchor={anchor}
              dominantBaseline="middle"
              fontSize={12}
              fill="#595959"
            >
              {label}
              <tspan x={tx} dy={14} fontSize={11} fill="#8c8c8c">
                {Math.round(values[i])}
              </tspan>
            </text>
          );
        })}
    </svg>
  );
}
