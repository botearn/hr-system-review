import { useEffect, useState } from "react";
import { Button, Drawer, Empty, Popconfirm, Spin, Tag, Typography, message } from "antd";
import {
  DeleteOutlined,
  MailOutlined,
  MessageOutlined,
  PhoneOutlined,
  TeamOutlined,
  WechatOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import {
  dashboardApi,
  type RecentActivityOut,
} from "@/api/dashboard";
import { followUpsApi } from "@/api/follow-ups";

const { Text } = Typography;

const CHANNEL_ICON: Record<string, React.ReactNode> = {
  phone: <PhoneOutlined />,
  wechat: <WechatOutlined />,
  email: <MailOutlined />,
  in_person: <TeamOutlined />,
  other: <MessageOutlined />,
};

const CHANNEL_LABEL: Record<string, string> = {
  phone: "电话",
  wechat: "微信",
  email: "邮件",
  in_person: "面谈",
  other: "其他",
};

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
  /** 'follow_ups' or 'status_changes' or null to close. */
  mode: "follow_ups" | "status_changes" | null;
  days?: number;
  onClose: () => void;
  onPickCandidate: (candidateId: number) => void;
  /** Notified after a record is deleted, so parents can refetch KPIs. */
  onChanged?: () => void;
}

export default function RecentActivityDrawer({
  mode,
  days = 7,
  onClose,
  onPickCandidate,
  onChanged,
}: Props) {
  const [data, setData] = useState<RecentActivityOut | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const reload = () => {
    setLoading(true);
    setError(null);
    dashboardApi
      .recentActivity(days, 100)
      .then(setData)
      .catch((e) => setError(e?.response?.data?.detail ?? e?.message ?? "加载失败"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!mode) {
      setData(null);
      setError(null);
      return;
    }
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, days]);

  const handleDelete = async (kind: "fu" | "sc", id: number) => {
    const key = `${kind}-${id}`;
    setDeletingId(key);
    try {
      if (kind === "fu") {
        await followUpsApi.delete(id);
      } else {
        await followUpsApi.deleteStatusChange(id);
      }
      message.success("已删除");
      // Optimistically drop from local state, then notify parent.
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          follow_ups: kind === "fu" ? prev.follow_ups.filter((r) => r.id !== id) : prev.follow_ups,
          status_changes:
            kind === "sc" ? prev.status_changes.filter((r) => r.id !== id) : prev.status_changes,
        };
      });
      onChanged?.();
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? "删除失败");
    } finally {
      setDeletingId(null);
    }
  };

  const title =
    mode === "follow_ups"
      ? `最近 ${days} 天的跟进记录`
      : mode === "status_changes"
        ? `最近 ${days} 天的状态变更`
        : "";

  const rows =
    mode === "follow_ups"
      ? (data?.follow_ups ?? [])
      : mode === "status_changes"
        ? (data?.status_changes ?? [])
        : [];

  return (
    <Drawer open={mode != null} onClose={onClose} title={title} width={460}>
      {loading ? (
        <div style={{ textAlign: "center", padding: 40 }}>
          <Spin />
        </div>
      ) : error ? (
        <Text type="danger">{error}</Text>
      ) : rows.length === 0 ? (
        <Empty description="该时间段暂无记录" imageStyle={{ height: 40 }} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            按时间倒序，共 {rows.length} 条
          </Text>
          {mode === "follow_ups" &&
            (data?.follow_ups ?? []).map((r) => {
              const key = `fu-${r.id}`;
              return (
                <div
                  key={key}
                  onClick={() => onPickCandidate(r.candidate_id)}
                  style={rowStyle()}
                  onMouseEnter={(e) => onHover(e, true)}
                  onMouseLeave={(e) => onHover(e, false)}
                >
                  <span style={{ color: "#722ed1", marginTop: 2 }}>
                    {CHANNEL_ICON[r.channel] ?? <MessageOutlined />}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a4e" }}>
                      {r.candidate_name}
                      <Text
                        type="secondary"
                        style={{ fontSize: 11, fontWeight: 400, marginLeft: 8 }}
                      >
                        · {CHANNEL_LABEL[r.channel] ?? r.channel}
                      </Text>
                    </div>
                    {r.content_excerpt && (
                      <div
                        style={{ fontSize: 12, color: "#52527a", marginTop: 3, lineHeight: 1.5 }}
                      >
                        {r.content_excerpt}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: "#9ea0b0", marginTop: 4 }}>
                      {dayjs(r.occurred_at).format("MM-DD HH:mm")}
                    </div>
                  </div>
                  <Popconfirm
                    title="删除这条跟进记录？"
                    okText="删除"
                    okButtonProps={{ danger: true }}
                    cancelText="取消"
                    onConfirm={(e) => {
                      e?.stopPropagation();
                      handleDelete("fu", r.id);
                    }}
                    onCancel={(e) => e?.stopPropagation()}
                  >
                    <Button
                      type="text"
                      size="small"
                      icon={<DeleteOutlined />}
                      loading={deletingId === key}
                      onClick={(e) => e.stopPropagation()}
                      aria-label="删除"
                    />
                  </Popconfirm>
                </div>
              );
            })}
          {mode === "status_changes" &&
            (data?.status_changes ?? []).map((r) => {
              const key = `sc-${r.id}`;
              return (
                <div
                  key={key}
                  onClick={() => onPickCandidate(r.candidate_id)}
                  style={rowStyle()}
                  onMouseEnter={(e) => onHover(e, true)}
                  onMouseLeave={(e) => onHover(e, false)}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a4e" }}>
                      {r.candidate_name}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        alignItems: "center",
                        marginTop: 4,
                        flexWrap: "wrap",
                      }}
                    >
                      {r.from_status && (
                        <Tag style={{ margin: 0 }}>
                          {STAGE_LABEL[r.from_status] ?? r.from_status}
                        </Tag>
                      )}
                      <span style={{ color: "#9ea0b0", fontSize: 12 }}>→</span>
                      <Tag color="purple" style={{ margin: 0 }}>
                        {STAGE_LABEL[r.to_status] ?? r.to_status}
                      </Tag>
                    </div>
                    <div style={{ fontSize: 11, color: "#9ea0b0", marginTop: 4 }}>
                      {dayjs(r.changed_at).format("MM-DD HH:mm")}
                    </div>
                  </div>
                  <Popconfirm
                    title="删除这条状态变更？"
                    description="不会自动回滚候选人当前阶段，如需更改请到候选人详情。"
                    okText="删除"
                    okButtonProps={{ danger: true }}
                    cancelText="取消"
                    onConfirm={(e) => {
                      e?.stopPropagation();
                      handleDelete("sc", r.id);
                    }}
                    onCancel={(e) => e?.stopPropagation()}
                  >
                    <Button
                      type="text"
                      size="small"
                      icon={<DeleteOutlined />}
                      loading={deletingId === key}
                      onClick={(e) => e.stopPropagation()}
                      aria-label="删除"
                    />
                  </Popconfirm>
                </div>
              );
            })}
        </div>
      )}
    </Drawer>
  );
}

const rowStyle = (): React.CSSProperties => ({
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  padding: "10px 12px",
  background: "#fff",
  border: "1px solid #ececf2",
  borderRadius: 8,
  cursor: "pointer",
  transition: "border-color 120ms, background 120ms",
});

const onHover = (e: React.MouseEvent<HTMLDivElement>, hovering: boolean) => {
  e.currentTarget.style.borderColor = hovering ? "#d3adf7" : "#ececf2";
  e.currentTarget.style.background = hovering ? "#faf8ff" : "#fff";
};
