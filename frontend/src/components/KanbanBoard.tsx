import { useMemo, useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Empty } from "antd";

export interface KanbanColumn {
  key: string;
  label: string;
  /** 列头左侧色块 */
  color: string;
  /** 列头淡色背景 */
  accent: string;
}

export interface KanbanItem {
  id: string | number;
  /** 当前所在列 key */
  columnKey: string;
}

interface Props<T extends KanbanItem> {
  columns: KanbanColumn[];
  items: T[];
  renderCard: (item: T) => ReactNode;
  /** 用户把卡从一列拖到另一列时回调 */
  onMove: (item: T, fromColumnKey: string, toColumnKey: string) => void;
  /** 列空态显示文字 */
  emptyHint?: string;
}

const PRIMARY = "#1a1a4e";
const BORDER = "#ececf2";

export default function KanbanBoard<T extends KanbanItem>({
  columns,
  items,
  renderCard,
  onMove,
  emptyHint = "拖卡到这里",
}: Props<T>) {
  const [activeId, setActiveId] = useState<string | number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 }, // 点击不算拖,移动 6px 才触发
    }),
  );

  const itemsByColumn = useMemo(() => {
    const m = new Map<string, T[]>();
    for (const c of columns) m.set(c.key, []);
    for (const it of items) {
      const arr = m.get(it.columnKey);
      if (arr) arr.push(it);
    }
    return m;
  }, [columns, items]);

  const itemMap = useMemo(() => {
    const m = new Map<string | number, T>();
    for (const it of items) m.set(it.id, it);
    return m;
  }, [items]);

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(e.active.id);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const item = itemMap.get(active.id as any);
    if (!item) return;
    const toColumn = String(over.id);
    if (item.columnKey === toColumn) return;
    onMove(item, item.columnKey, toColumn);
  };

  const activeItem = activeId != null ? itemMap.get(activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${columns.length}, minmax(240px, 1fr))`,
          gap: 12,
          alignItems: "start",
          overflowX: "auto",
          paddingBottom: 8,
        }}
      >
        {columns.map((col) => (
          <Column
            key={col.key}
            column={col}
            items={itemsByColumn.get(col.key) ?? []}
            renderCard={renderCard}
            emptyHint={emptyHint}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeItem ? (
          <div style={{ opacity: 0.85, transform: "rotate(1deg)" }}>{renderCard(activeItem)}</div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column<T extends KanbanItem>({
  column,
  items,
  renderCard,
  emptyHint,
}: {
  column: KanbanColumn;
  items: T[];
  renderCard: (item: T) => ReactNode;
  emptyHint: string;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: column.key });

  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${BORDER}`,
        borderRadius: 12,
        display: "flex",
        flexDirection: "column",
        minHeight: 200,
      }}
    >
      <div
        style={{
          background: column.accent,
          padding: "10px 14px",
          borderBottom: `1px solid ${BORDER}`,
          borderRadius: "12px 12px 0 0",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              background: column.color,
              display: "inline-block",
            }}
          />
          <span
            style={{
              color: column.color,
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: "0.04em",
            }}
          >
            {column.label}
          </span>
        </div>
        <span
          style={{
            background: column.color,
            color: "#fff",
            fontSize: 11,
            padding: "1px 8px",
            borderRadius: 999,
            fontWeight: 600,
            minWidth: 22,
            textAlign: "center",
          }}
        >
          {items.length}
        </span>
      </div>

      <div
        ref={setNodeRef}
        style={{
          padding: 10,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          minHeight: 100,
          flex: 1,
          background: isOver ? "#fafafb" : "transparent",
          transition: "background 120ms",
          borderRadius: "0 0 12px 12px",
        }}
      >
        {items.length === 0 ? (
          <div style={{ padding: "20px 8px", color: "#bfbfbf", fontSize: 12, textAlign: "center" }}>
            <Empty
              imageStyle={{ height: 32 }}
              description={<span style={{ color: "#bfbfbf", fontSize: 12 }}>{emptyHint}</span>}
            />
          </div>
        ) : (
          items.map((it) => (
            <DraggableCard key={it.id} item={it}>
              {renderCard(it)}
            </DraggableCard>
          ))
        )}
      </div>
    </div>
  );
}

function DraggableCard<T extends KanbanItem>({ item, children }: { item: T; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
  });

  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.4 : 1,
    cursor: "grab",
    touchAction: "none",
  };

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      {children}
    </div>
  );
}

// 用于其他组件复用样式常量
export { PRIMARY as KANBAN_PRIMARY, BORDER as KANBAN_BORDER };
