/**
 * 气泡锅 — 用 d3-force 做物理仿真。
 * 每个气泡是一个「食材」,大小由 value 决定,颜色区分自定义 vs 系统。
 * 支持:
 *   - 拖拽松手 → 回弹到锅中继续漂浮
 *   - 拖出锅外 → 触发 onDragOut(item)(上层做二次确认删除)
 *   - 点击气泡 → onBubbleClick(item)
 *   - 右键气泡 → onRightClick(item)
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  forceCenter,
  forceCollide,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationNodeDatum,
} from "d3-force";

export interface BubbleItem {
  id: number;
  name: string;
  value: number; // 候选人计数
  isCustom: boolean;
}

interface Props {
  items: BubbleItem[];
  width?: number;
  height?: number;
  onBubbleClick?: (item: BubbleItem) => void;
  onRightClick?: (item: BubbleItem, clientX: number, clientY: number) => void;
  onDragOut?: (item: BubbleItem) => void;
}

interface Node extends SimulationNodeDatum {
  id: number;
  name: string;
  value: number;
  isCustom: boolean;
  r: number;
}

export default function BubblePool({
  items,
  width = 760,
  height = 480,
  onBubbleClick,
  onRightClick,
  onDragOut,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const simRef = useRef<Simulation<Node, undefined> | null>(null);
  const nodesRef = useRef<Node[]>([]);
  // 通过一个 tick 计数器触发重渲染,但不重建数组
  const [tick, setTick] = useState(0);
  const [dragId, setDragId] = useState<number | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const didDragRef = useRef(false);
  const DRAG_THRESHOLD_PX = 5;

  const cx = width / 2;
  const cy = height / 2;
  const rx = width / 2 - 20;
  const ry = height / 2 - 20;

  // items 内容 key, 作为 effect 依赖,避免每次 parent render 都重建仿真
  const itemsKey = useMemo(
    () =>
      items
        .map((i) => `${i.id}:${i.value}:${i.isCustom ? 1 : 0}`)
        .sort()
        .join("|"),
    [items],
  );

  // 每次 itemsKey 变化:按当前 items 重建节点数组(保留已有位置),重启仿真
  useEffect(() => {
    if (items.length === 0) {
      // 停掉老仿真,清空节点
      if (simRef.current) simRef.current.stop();
      simRef.current = null;
      nodesRef.current = [];
      setTick((t) => t + 1);
      return;
    }

    const minV = items.reduce((m, i) => Math.min(m, i.value), Infinity) || 0;
    const maxV = items.reduce((m, i) => Math.max(m, i.value), 0) || 1;
    const radiusOf = (v: number) => (maxV === minV ? 26 : 18 + ((v - minV) / (maxV - minV)) * 26);

    // 用已有节点保留位置,新的随机放置
    const byId = new Map(nodesRef.current.map((n) => [n.id, n]));
    nodesRef.current = items.map((it) => {
      const existing = byId.get(it.id);
      return {
        id: it.id,
        name: it.name,
        value: it.value,
        isCustom: it.isCustom,
        r: radiusOf(it.value),
        x: existing?.x ?? cx + (Math.random() - 0.5) * rx * 0.8,
        y: existing?.y ?? cy + (Math.random() - 0.5) * ry * 0.8,
        vx: existing?.vx ?? 0,
        vy: existing?.vy ?? 0,
      };
    });

    // 停掉老仿真(如果有)
    if (simRef.current) simRef.current.stop();

    const sim = forceSimulation<Node>(nodesRef.current)
      .force("charge", forceManyBody<Node>().strength(-18))
      .force("center", forceCenter(cx, cy).strength(0.03))
      .force("x", forceX<Node>(cx).strength(0.04))
      .force("y", forceY<Node>(cy).strength(0.04))
      .force(
        "collide",
        forceCollide<Node>()
          .radius((d) => d.r + 2)
          .iterations(2),
      )
      .alphaDecay(0.02)
      .on("tick", () => {
        // 椭圆边界约束 — 操作 nodesRef.current,始终是当前的数组
        for (const n of nodesRef.current) {
          const dx = ((n.x ?? 0) - cx) / rx;
          const dy = ((n.y ?? 0) - cy) / ry;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > 0.95) {
            const scale = 0.95 / d;
            n.x = cx + dx * rx * scale;
            n.y = cy + dy * ry * scale;
            if (n.vx) n.vx *= -0.3;
            if (n.vy) n.vy *= -0.3;
          }
        }
        setTick((t) => t + 1);
      });
    simRef.current = sim;

    return () => {
      sim.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey]);

  // 拖拽
  const handleMouseDown = (e: React.MouseEvent, node: Node) => {
    e.preventDefault();
    setDragId(node.id);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    didDragRef.current = false;
    node.fx = node.x;
    node.fy = node.y;
    if (simRef.current) simRef.current.alphaTarget(0.3).restart();
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragId == null || !svgRef.current) return;
    // 判断是否真的拖了(超过阈值才算)
    if (dragStartRef.current) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD_PX) {
        didDragRef.current = true;
      }
    }
    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const node = nodesRef.current.find((n) => n.id === dragId);
    if (node) {
      node.fx = x;
      node.fy = y;
      // 保证仿真活着,这样被拖气泡会影响周围气泡
      if (simRef.current) simRef.current.alphaTarget(0.3);
    }
  };

  const handleMouseUp = (e: React.MouseEvent, fromNode?: Node) => {
    if (dragId == null || !svgRef.current) {
      setDragId(null);
      dragStartRef.current = null;
      return;
    }
    const node = nodesRef.current.find((n) => n.id === dragId);
    if (!node) {
      setDragId(null);
      dragStartRef.current = null;
      return;
    }
    // 松手时相对锅的位置
    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const dx = (x - cx) / rx;
    const dy = (y - cy) / ry;
    const d = Math.sqrt(dx * dx + dy * dy);
    const wasOutside = d > 1.0;

    const draggedReal = didDragRef.current;

    node.fx = null;
    node.fy = null;
    if (simRef.current) simRef.current.alphaTarget(0);
    setDragId(null);
    dragStartRef.current = null;

    if (draggedReal && wasOutside && onDragOut) {
      onDragOut({
        id: node.id,
        name: node.name,
        value: node.value,
        isCustom: node.isCustom,
      });
      return;
    }
    // 没真正拖动 = 纯点击,触发 onBubbleClick
    if (!draggedReal && fromNode && onBubbleClick) {
      onBubbleClick({
        id: fromNode.id,
        name: fromNode.name,
        value: fromNode.value,
        isCustom: fromNode.isCustom,
      });
    }
  };

  const handleContextMenu = (e: React.MouseEvent, node: Node) => {
    e.preventDefault();
    onRightClick?.(
      { id: node.id, name: node.name, value: node.value, isCustom: node.isCustom },
      e.clientX,
      e.clientY,
    );
  };

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{ userSelect: "none" }}
    >
      <defs>
        {/* 锅身 - 更饱和的淡紫,居中略亮 */}
        <radialGradient id="potBg" cx="50%" cy="45%" r="75%">
          <stop offset="0%" stopColor="#e6d7ff" />
          <stop offset="100%" stopColor="#b39ddb" />
        </radialGradient>
        <linearGradient id="bubbleSystem" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#69b1ff" />
          <stop offset="100%" stopColor="#0958d9" />
        </linearGradient>
        <linearGradient id="bubbleCustom" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffc069" />
          <stop offset="100%" stopColor="#d46b08" />
        </linearGradient>
      </defs>

      {/* 锅身 - 无边框 */}
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="url(#potBg)" />

      {/* 气泡 - tick 触发重绘 */}
      {void tick}
      {nodesRef.current.map((n) => {
        const fill = n.isCustom ? "url(#bubbleCustom)" : "url(#bubbleSystem)";
        const fontSize = Math.max(10, Math.min(14, n.r * 0.55));
        const displayName = n.name.length > 10 ? n.name.slice(0, 9) + "…" : n.name;
        return (
          <g
            key={n.id}
            transform={`translate(${n.x ?? cx}, ${n.y ?? cy})`}
            style={{ cursor: dragId === n.id ? "grabbing" : "grab" }}
            onMouseDown={(e) => handleMouseDown(e, n)}
            onMouseUp={(e) => handleMouseUp(e, n)}
            onContextMenu={(e) => handleContextMenu(e, n)}
          >
            {/* 小投影(紧贴气泡) */}
            <ellipse cy={n.r * 0.85} rx={n.r * 0.55} ry={n.r * 0.12} fill="rgba(0,0,0,0.18)" />
            <circle r={n.r} fill={fill} />
            {/* 单一高光: 左上小圆点,不遮主色 */}
            <circle r={n.r * 0.2} cx={-n.r * 0.3} cy={-n.r * 0.35} fill="rgba(255,255,255,0.55)" />
            <text
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={fontSize}
              fill="#fff"
              fontWeight={600}
              style={{ pointerEvents: "none" }}
            >
              {displayName}
            </text>
            <text
              textAnchor="middle"
              y={n.r - 3}
              fontSize={9}
              fill="rgba(255,255,255,0.85)"
              style={{ pointerEvents: "none" }}
            >
              {n.value}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
