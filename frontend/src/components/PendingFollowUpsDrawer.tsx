import { Drawer, Empty, Tooltip, Typography } from "antd";
import { ClockCircleOutlined } from "@ant-design/icons";
import type {
  Reminders,
  ReminderOverdueItem,
  ReminderStaleItem,
} from "@/api/follow-ups";

const { Text } = Typography;

interface Props {
  open: boolean;
  reminders: Reminders | null;
  onClose: () => void;
  onPickCandidate: (candidateId: number) => void;
}

const SECTION_META = {
  overdue: { color: "#a8231d", title: "已逾期", hint: "next_plan_due 已过期" },
  due_today: { color: "#874d00", title: "今天到期", hint: "next_plan_due == 今天" },
  stale: { color: "#52527a", title: "长期未联系", hint: "≥ 3 天没有沟通且流程未结束" },
} as const;

function Row({
  candidateName,
  candidateId,
  meta,
  excerpt,
  color,
  onClick,
}: {
  candidateName: string;
  candidateId: number;
  meta: string;
  excerpt: string | null;
  color: string;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "10px 12px",
        background: "#fff",
        border: `1px solid ${color}30`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 8,
        cursor: "pointer",
        transition: "box-shadow 120ms",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a4e" }}>
          {candidateName}
          <Text type="secondary" style={{ fontSize: 11, fontWeight: 400, marginLeft: 8 }}>
            #{candidateId}
          </Text>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 12,
            color,
            marginTop: 3,
          }}
        >
          <ClockCircleOutlined style={{ fontSize: 11 }} />
          {meta}
        </div>
        {excerpt && (
          <div
            style={{
              fontSize: 12,
              color: "#52527a",
              marginTop: 4,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {excerpt}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({
  meta,
  children,
  count,
}: {
  meta: { color: string; title: string; hint: string };
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: meta.color,
          marginBottom: 6,
          letterSpacing: "0.04em",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {meta.title} · {count}
        <Tooltip title={meta.hint}>
          <Text type="secondary" style={{ fontSize: 11, cursor: "help" }}>
            (?)
          </Text>
        </Tooltip>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{children}</div>
    </div>
  );
}

export default function PendingFollowUpsDrawer({
  open,
  reminders,
  onClose,
  onPickCandidate,
}: Props) {
  const total = reminders?.total ?? 0;
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={
        <span>
          待跟进 <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>· 共 {total} 项</Text>
        </span>
      }
      width={460}
    >
      {!reminders || total === 0 ? (
        <Empty description="暂无需要跟进的候选人 🎉" imageStyle={{ height: 40 }} />
      ) : (
        <>
          <Section meta={SECTION_META.overdue} count={reminders.overdue.length}>
            {reminders.overdue.map((it: ReminderOverdueItem) => (
              <Row
                key={`overdue-${it.candidate_id}`}
                candidateName={it.candidate_name}
                candidateId={it.candidate_id}
                meta={`逾期 ${it.days_overdue} 天${it.next_plan ? " · " + it.next_plan : ""}`}
                excerpt={it.last_follow_content_excerpt ?? null}
                color={SECTION_META.overdue.color}
                onClick={() => onPickCandidate(it.candidate_id)}
              />
            ))}
          </Section>
          <Section meta={SECTION_META.due_today} count={reminders.due_today.length}>
            {reminders.due_today.map((it: ReminderOverdueItem) => (
              <Row
                key={`today-${it.candidate_id}`}
                candidateName={it.candidate_name}
                candidateId={it.candidate_id}
                meta={`今天到期${it.next_plan ? " · " + it.next_plan : ""}`}
                excerpt={it.last_follow_content_excerpt ?? null}
                color={SECTION_META.due_today.color}
                onClick={() => onPickCandidate(it.candidate_id)}
              />
            ))}
          </Section>
          <Section meta={SECTION_META.stale} count={reminders.stale.length}>
            {reminders.stale.map((it: ReminderStaleItem) => (
              <Row
                key={`stale-${it.candidate_id}`}
                candidateName={it.candidate_name}
                candidateId={it.candidate_id}
                meta={`${it.days_since} 天未联系`}
                excerpt={it.last_follow_content_excerpt ?? null}
                color={SECTION_META.stale.color}
                onClick={() => onPickCandidate(it.candidate_id)}
              />
            ))}
          </Section>
        </>
      )}
    </Drawer>
  );
}
