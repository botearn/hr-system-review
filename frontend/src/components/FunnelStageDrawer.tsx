import { useEffect, useState } from "react";
import { Button, Drawer, Empty, Spin, Tag, Typography } from "antd";
import { ArrowRightOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { dashboardApi, type FunnelStageCandidate } from "@/api/dashboard";

const { Text } = Typography;

const STAGE_LABEL: Record<string, string> = {
  initial_contact: "初步沟通",
  resume_pushed: "已推送",
  interview_scheduled: "面试安排",
  interview_1_passed: "一面通过",
  interview_2_passed: "二面通过",
  offer_sent: "Offer 发放",
  onboarded: "已入职",
  rejected_1: "一面淘汰",
  rejected_2: "二面淘汰",
  declined_offer: "拒绝 Offer",
  dropped: "流失",
};

interface Props {
  /** Pass null to close. */
  stageKey: string | null;
  stageLabel: string;
  /** Click a candidate row → open the candidate detail drawer in the parent. */
  onPickCandidate: (candidateId: number) => void;
  onClose: () => void;
}

export default function FunnelStageDrawer({
  stageKey,
  stageLabel,
  onPickCandidate,
  onClose,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<FunnelStageCandidate[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!stageKey) {
      setRows([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    dashboardApi
      .funnelStageCandidates(stageKey, 100)
      .then((res) => setRows(res.candidates))
      .catch((e) => setError(e?.response?.data?.detail ?? e?.message ?? "加载失败"))
      .finally(() => setLoading(false));
  }, [stageKey]);

  return (
    <Drawer
      open={stageKey != null}
      onClose={onClose}
      title={
        <span>
          目前 <span style={{ color: "#722ed1" }}>「{stageLabel}」</span> 的候选人
        </span>
      }
      width={460}
    >
      {loading ? (
        <div style={{ textAlign: "center", padding: 40 }}>
          <Spin />
        </div>
      ) : error ? (
        <Text type="danger">{error}</Text>
      ) : rows.length === 0 ? (
        <Empty description="该阶段暂无候选人" imageStyle={{ height: 40 }} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            按最近进入该阶段的时间倒序，共 {rows.length} 人
          </Text>
          {rows.map((c) => {
            const stillThere = c.current_status === stageKey;
            return (
              <div
                key={c.candidate_id}
                onClick={() => onPickCandidate(c.candidate_id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  background: "#fff",
                  border: "1px solid #ececf2",
                  borderRadius: 8,
                  cursor: "pointer",
                  transition: "border-color 120ms, background 120ms",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "#d3adf7";
                  e.currentTarget.style.background = "#faf8ff";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "#ececf2";
                  e.currentTarget.style.background = "#fff";
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a4e" }}>
                    {c.candidate_name}
                    <Text type="secondary" style={{ fontSize: 11, fontWeight: 400, marginLeft: 8 }}>
                      #{c.candidate_id}
                    </Text>
                  </div>
                  <div style={{ fontSize: 11, color: "#8c8c9a", marginTop: 2 }}>
                    {dayjs(c.reached_at).format("YYYY-MM-DD")}
                    {!stillThere && c.current_status && (
                      <>
                        {" · 现在 "}
                        <Tag
                          color="default"
                          style={{ marginLeft: 2, fontSize: 10, padding: "0 6px", lineHeight: "16px" }}
                        >
                          {STAGE_LABEL[c.current_status] ?? c.current_status}
                        </Tag>
                      </>
                    )}
                  </div>
                </div>
                <Button type="text" icon={<ArrowRightOutlined />} size="small" />
              </div>
            );
          })}
        </div>
      )}
    </Drawer>
  );
}
