import { useEffect, useState } from "react";
import { Empty, Spin, Tag, Typography } from "antd";
import dayjs from "dayjs";
import { followUpsApi, type StatusChange } from "@/api/follow-ups";

const { Text } = Typography;

const OUTCOME_STATUSES = new Set(["onboarded", "dropped", "declined_offer"]);

const STATUS_LOOK: Record<
  string,
  { label: string; tagColor: string; rail: string; bg: string; icon: string }
> = {
  onboarded: {
    label: "已入职",
    tagColor: "green",
    rail: "#52c41a",
    bg: "#f6ffed",
    icon: "🎯",
  },
  dropped: {
    label: "流失",
    tagColor: "default",
    rail: "#bfbfbf",
    bg: "#fafafa",
    icon: "⊘",
  },
  declined_offer: {
    label: "拒绝 Offer",
    tagColor: "red",
    rail: "#ff7875",
    bg: "#fff1f0",
    icon: "⊘",
  },
};

interface Props {
  candidateId: number;
  /** Bumped by parent to force a refetch after a status change is logged. */
  reloadKey?: number;
}

export default function CandidateOutcomeTimeline({ candidateId, reloadKey }: Props) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<StatusChange[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    followUpsApi
      .statusHistory(candidateId)
      .then((all) => {
        if (cancelled) return;
        // Only the three terminal statuses count as "去向" rows.
        setRows(all.filter((r) => OUTCOME_STATUSES.has(r.to_status)));
      })
      .catch((e) => !cancelled && setError(e?.response?.data?.detail ?? e?.message ?? "加载失败"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [candidateId, reloadKey]);

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: 40 }}>
        <Spin />
      </div>
    );
  }
  if (error) {
    return <Text type="danger">{error}</Text>;
  }
  if (rows.length === 0) {
    return (
      <Empty
        description={
          <div style={{ fontSize: 13, color: "#8c8c9a", lineHeight: 1.6 }}>
            这位候选人还没有去向记录
            <div style={{ fontSize: 12, color: "#b8b8c4", marginTop: 4 }}>
              当 ta 进入「已入职 / 流失 / 拒绝 Offer」状态并填写公司+岗位时，会自动出现在这里。
            </div>
          </div>
        }
        imageStyle={{ height: 60 }}
        style={{ padding: "32px 0" }}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {rows.map((sc) => {
        const look = STATUS_LOOK[sc.to_status];
        const hasOutcome = !!(sc.outcome_company || sc.outcome_role);
        return (
          <div
            key={sc.id}
            style={{
              position: "relative",
              padding: "14px 16px 14px 18px",
              background: look.bg,
              border: `1px solid ${look.rail}33`,
              borderRadius: 10,
              borderLeft: `3px solid ${look.rail}`,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                marginBottom: hasOutcome || sc.reason ? 8 : 0,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 16 }}>{look.icon}</span>
                <Tag color={look.tagColor} style={{ marginRight: 0 }}>
                  {look.label}
                </Tag>
              </div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {dayjs(sc.changed_at).format("YYYY-MM-DD HH:mm")}
              </Text>
            </div>

            {hasOutcome ? (
              <div style={{ fontSize: 13.5, color: "#1a1a4e", lineHeight: 1.5 }}>
                <span style={{ fontWeight: 600 }}>{sc.outcome_company || "(公司未填)"}</span>
                {sc.outcome_role && (
                  <span style={{ color: "#52527a" }}> · {sc.outcome_role}</span>
                )}
              </div>
            ) : sc.to_status !== "onboarded" ? (
              <Text type="secondary" style={{ fontSize: 12.5 }}>
                去向未填
              </Text>
            ) : null}

            {sc.reason && (
              <div style={{ marginTop: 6, fontSize: 12, color: "#52527a", lineHeight: 1.5 }}>
                <Text type="secondary" style={{ fontSize: 11, marginRight: 4 }}>
                  备注
                </Text>
                {sc.reason}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
