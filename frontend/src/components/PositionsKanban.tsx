import { useMemo, useState } from "react";
import { Input, Modal, message } from "antd";
import { positionsApi, type Position } from "@/api/positions";
import type { Company } from "@/api/companies";
import KanbanBoard, { type KanbanColumn, type KanbanItem } from "@/components/KanbanBoard";
import PositionKanbanCard from "@/components/PositionKanbanCard";

interface Props {
  positions: Position[];
  companies: Company[];
  onOpenDetail: (id: number) => void;
  onChanged?: () => void;
}

const KANBAN_COLUMNS: KanbanColumn[] = [
  { key: "open", label: "招聘中", color: "#0e5b34", accent: "#f6ffed" },
  { key: "paused", label: "暂停", color: "#874d00", accent: "#fff7e6" },
  { key: "filled", label: "已招满", color: "#0958d9", accent: "#eef2ff" },
  { key: "closed", label: "已关闭", color: "#a8231d", accent: "#fef0ef" },
];

interface PositionKItem extends KanbanItem {
  id: number;
  columnKey: string;
  position: Position;
}

export default function PositionsKanban({ positions, companies, onOpenDetail, onChanged }: Props) {
  const [closeModal, setCloseModal] = useState<{
    position: Position;
    reason: string;
  } | null>(null);
  const [closing, setClosing] = useState(false);

  const items = useMemo<PositionKItem[]>(
    () =>
      positions.map((p) => ({
        id: p.id,
        columnKey: p.status,
        position: p,
      })),
    [positions],
  );

  const companyName = (id: number) => companies.find((c) => c.id === id)?.name;

  const applyStatusChange = async (position: Position, to: string, reason?: string) => {
    try {
      if (to === "closed") {
        await positionsApi.close(position.id, reason);
      } else if (position.status === "closed" && to === "open") {
        await positionsApi.reopen(position.id);
      } else {
        await positionsApi.update(position.id, { status: to } as any);
      }
      message.success(
        `${position.title} 已改为「${KANBAN_COLUMNS.find((c) => c.key === to)?.label}」`,
      );
      onChanged?.();
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? "状态更新失败");
      onChanged?.(); // 让父组件 refetch 回到真实状态
    }
  };

  const handleMove = async (item: PositionKItem, _from: string, to: string) => {
    if (to === "closed") {
      // 关闭需要原因
      setCloseModal({ position: item.position, reason: "" });
      return;
    }
    await applyStatusChange(item.position, to);
  };

  return (
    <>
      <KanbanBoard
        columns={KANBAN_COLUMNS}
        items={items}
        onMove={handleMove}
        emptyHint="拖岗位到这里"
        renderCard={(it) => (
          <PositionKanbanCard
            position={it.position}
            companyName={companyName(it.position.company_id)}
            onClick={() => onOpenDetail(it.id)}
          />
        )}
      />

      <Modal
        title="关闭岗位"
        open={!!closeModal}
        onCancel={() => setCloseModal(null)}
        onOk={async () => {
          if (!closeModal) return;
          setClosing(true);
          try {
            await applyStatusChange(closeModal.position, "closed", closeModal.reason || undefined);
            setCloseModal(null);
          } finally {
            setClosing(false);
          }
        }}
        confirmLoading={closing}
        okText="关闭"
        okButtonProps={{ danger: true }}
        width={420}
        destroyOnClose
      >
        <div style={{ marginBottom: 8, color: "#52527a" }}>请填写关闭原因(可选)</div>
        <Input.TextArea
          rows={3}
          placeholder="例:候选人已入职 / 客户撤单"
          value={closeModal?.reason ?? ""}
          onChange={(e) => setCloseModal((m) => (m ? { ...m, reason: e.target.value } : m))}
        />
      </Modal>
    </>
  );
}
