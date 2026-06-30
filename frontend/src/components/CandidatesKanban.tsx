import { useEffect, useMemo, useState } from "react";
import { Spin, message } from "antd";
import type { Candidate } from "@/api/candidates";
import { followUpsApi, type FollowUpStatus } from "@/api/follow-ups";
import KanbanBoard, { type KanbanColumn, type KanbanItem } from "@/components/KanbanBoard";
import CandidateKanbanCard from "@/components/CandidateKanbanCard";
import StatusChangeModal from "@/components/StatusChangeModal";

interface Props {
  candidates: Candidate[];
  onOpenDetail: (id: number) => void;
  onChanged?: () => void;
}

// 6 列对齐 StatusChangeModal 的分组
const KANBAN_COLUMNS: KanbanColumn[] = [
  { key: "contact", label: "接触", color: "#52527a", accent: "#f4f4f8" },
  { key: "push", label: "推送", color: "#0958d9", accent: "#eef2ff" },
  { key: "interview", label: "面试中", color: "#531dab", accent: "#f9f0ff" },
  { key: "decision", label: "进行中决策", color: "#d48806", accent: "#fffbe6" },
  { key: "won", label: "已成", color: "#389e0d", accent: "#f6ffed" },
  { key: "lost", label: "未成", color: "#a8231d", accent: "#fff1f0" },
];

// 跟进状态 → kanban 列
const STATUS_TO_COLUMN: Record<FollowUpStatus, string> = {
  initial_contact: "contact",
  resume_pushed: "push",
  interview_scheduled: "interview",
  interview_1_passed: "interview",
  interview_2_passed: "interview",
  offer_sent: "decision",
  onboarded: "won",
  rejected_1: "lost",
  rejected_2: "lost",
  declined_offer: "lost",
  dropped: "lost",
};

// 列被拖入时设置的"代表状态"。注意：拖到 won 列等同于切到 onboarded，
// 必须填写去向 (公司+岗位)，所以这里走 modal，不走直接 API。
const COLUMN_TO_STATUS: Record<string, FollowUpStatus> = {
  contact: "initial_contact",
  push: "resume_pushed",
  interview: "interview_scheduled",
  decision: "offer_sent",
  lost: "dropped",
};

interface CandidateKItem extends KanbanItem {
  id: number;
  columnKey: string;
  candidate: Candidate;
}

export default function CandidatesKanban({ candidates, onOpenDetail, onChanged }: Props) {
  const [statusByCand, setStatusByCand] = useState<Record<number, FollowUpStatus | null>>({});
  const [loading, setLoading] = useState(true);
  // 拖入"已成"列时打开此 modal,让用户填写去向
  const [onboardingFor, setOnboardingFor] = useState<{ id: number; name: string; from: FollowUpStatus | null } | null>(null);

  // 对所有候选人拉一次 last status (并发);也可以让后端列表 API 直接带,但当前 API 用 last_follow_status 字段
  useEffect(() => {
    if (!candidates.length) {
      setStatusByCand({});
      setLoading(false);
      return;
    }
    const map: Record<number, FollowUpStatus | null> = {};
    for (const c of candidates) {
      map[c.id] = (c.last_follow_status as FollowUpStatus | undefined) ?? null;
    }
    setStatusByCand(map);
    setLoading(false);
  }, [candidates]);

  const items = useMemo<CandidateKItem[]>(() => {
    return candidates.map((c) => {
      const st = statusByCand[c.id] ?? null;
      const col = st ? STATUS_TO_COLUMN[st] : "contact";
      return { id: c.id, columnKey: col, candidate: c };
    });
  }, [candidates, statusByCand]);

  const handleMove = async (item: CandidateKItem, _from: string, to: string) => {
    // 拖到"已成"=onboarded 时,必须填写去向 → 走 modal,不直接调 API
    if (to === "won") {
      setOnboardingFor({
        id: item.id,
        name: item.candidate.name,
        from: statusByCand[item.id] ?? null,
      });
      return;
    }

    const newStatus = COLUMN_TO_STATUS[to];
    if (!newStatus) return;

    // 乐观更新
    setStatusByCand((m) => ({ ...m, [item.id]: newStatus }));

    try {
      await followUpsApi.changeStatus({
        candidate_id: item.id,
        to_status: newStatus,
        reason: null,
      });
      // 撤销 token (简化:暂时只 toast 不可撤销;后续可加)
      message.success(
        `${item.candidate.name} 已改为「${KANBAN_COLUMNS.find((c) => c.key === to)?.label}」`,
      );
      onChanged?.();
    } catch (e: any) {
      // 失败回滚
      setStatusByCand((m) => ({ ...m, [item.id]: item.candidate.last_follow_status as any }));
      message.error(e?.response?.data?.detail ?? "状态更新失败");
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: 64 }}>
        <Spin />
      </div>
    );
  }

  return (
    <>
      <KanbanBoard
        columns={KANBAN_COLUMNS}
        items={items}
        onMove={handleMove}
        emptyHint="拖候选人到这里"
        renderCard={(it) => (
          <CandidateKanbanCard candidate={it.candidate} onClick={() => onOpenDetail(it.id)} />
        )}
      />
      <StatusChangeModal
        open={onboardingFor != null}
        onClose={() => setOnboardingFor(null)}
        candidateId={onboardingFor?.id ?? 0}
        currentStatus={onboardingFor?.from ?? null}
        presetStatus="onboarded"
        onChanged={() => {
          if (onboardingFor) {
            setStatusByCand((m) => ({ ...m, [onboardingFor.id]: "onboarded" }));
          }
          onChanged?.();
        }}
      />
    </>
  );
}
