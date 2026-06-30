import { useEffect, useState } from "react";
import { Badge, Button, Drawer, Empty, Spin, Tag, Tooltip, Typography } from "antd";
import { BellOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { followUpsApi, STATUS_LABEL, type Reminders } from "@/api/follow-ups";
import CandidateDetailDrawer from "@/components/CandidateDetailDrawer";
import NewFollowUpModal from "@/components/NewFollowUpModal";

const { Text } = Typography;

const POLL_MS = 60_000;

export default function ReminderBell() {
  const [data, setData] = useState<Reminders | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [pickedCandidate, setPickedCandidate] = useState<number | null>(null);
  const [quickAdd, setQuickAdd] = useState<{ id: number; name: string } | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      setData(await followUpsApi.reminders());
    } catch {
      /* 静默 */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, []);

  const total = data?.total ?? 0;

  const openDetail = (candidateId: number) => {
    setPickedCandidate(candidateId);
    setOpen(false);
  };

  return (
    <>
      <Tooltip title="跟进提醒" placement="bottom">
        <Badge count={total} size="small" offset={[-2, 2]}>
          <Button
            type="text"
            icon={<BellOutlined style={{ fontSize: 18 }} />}
            onClick={() => {
              setOpen(true);
              refresh();
            }}
          />
        </Badge>
      </Tooltip>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        width={920}
        title={
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span style={{ fontWeight: 600 }}>跟进提醒</span>
            {total > 0 && (
              <Text type="secondary" style={{ fontSize: 13, fontWeight: 400 }}>
                共 {total} 项
              </Text>
            )}
          </div>
        }
        extra={
          <Tooltip title="刷新">
            <Button shape="circle" icon={<ReloadOutlined />} onClick={refresh} loading={loading} />
          </Tooltip>
        }
        styles={{ body: { padding: 0, background: "#fafafb" } }}
      >
        {loading && !data ? (
          <div style={{ textAlign: "center", padding: 64 }}>
            <Spin />
          </div>
        ) : total === 0 ? (
          <div style={{ padding: 64 }}>
            <Empty description="暂无待跟进事项" />
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 16,
              padding: 20,
              alignItems: "start",
              minHeight: "100%",
            }}
          >
            <Column title="已逾期" count={data!.overdue.length} color="#a8231d" accent="#fef0ef">
              {data!.overdue.length === 0 ? (
                <ColumnEmpty />
              ) : (
                data!.overdue.map((it) => (
                  <PlanCard
                    key={`o-${it.candidate_id}-${it.next_plan_due}`}
                    candidateName={it.candidate_name}
                    detail={it.next_plan ?? "未填写下一步"}
                    due={it.next_plan_due}
                    rightTag={`逾期 ${it.days_overdue} 天`}
                    rightColor="#a8231d"
                    excerpt={it.last_follow_content_excerpt}
                    onOpen={() => openDetail(it.candidate_id)}
                    onQuickAdd={() => setQuickAdd({ id: it.candidate_id, name: it.candidate_name })}
                  />
                ))
              )}
            </Column>

            <Column
              title="今日到期"
              count={data!.due_today.length}
              color="#874d00"
              accent="#fff7e6"
            >
              {data!.due_today.length === 0 ? (
                <ColumnEmpty />
              ) : (
                data!.due_today.map((it) => (
                  <PlanCard
                    key={`d-${it.candidate_id}-${it.next_plan_due}`}
                    candidateName={it.candidate_name}
                    detail={it.next_plan ?? "未填写下一步"}
                    due={it.next_plan_due}
                    rightTag="今天"
                    rightColor="#874d00"
                    excerpt={it.last_follow_content_excerpt}
                    onOpen={() => openDetail(it.candidate_id)}
                    onQuickAdd={() => setQuickAdd({ id: it.candidate_id, name: it.candidate_name })}
                  />
                ))
              )}
            </Column>

            <Column title="久未跟进" count={data!.stale.length} color="#52527a" accent="#f4f4f8">
              {data!.stale.length === 0 ? (
                <ColumnEmpty />
              ) : (
                data!.stale.map((it) => (
                  <StaleCard
                    key={`s-${it.candidate_id}`}
                    candidateName={it.candidate_name}
                    daysSince={it.days_since}
                    excerpt={it.last_follow_content_excerpt}
                    onQuickAdd={() => setQuickAdd({ id: it.candidate_id, name: it.candidate_name })}
                    lastAt={it.last_follow_at}
                    status={it.last_follow_status}
                    onOpen={() => openDetail(it.candidate_id)}
                  />
                ))
              )}
            </Column>
          </div>
        )}
      </Drawer>

      <CandidateDetailDrawer
        candidateId={pickedCandidate}
        open={pickedCandidate != null}
        onClose={() => setPickedCandidate(null)}
        onSaved={refresh}
      />

      {quickAdd && (
        <NewFollowUpModal
          open
          candidateId={quickAdd.id}
          candidateName={quickAdd.name}
          onClose={() => setQuickAdd(null)}
          onCreated={() => {
            setQuickAdd(null);
            refresh();
          }}
        />
      )}
    </>
  );
}

function Column({
  title,
  count,
  color,
  accent,
  children,
}: {
  title: string;
  count: number;
  color: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 12,
        border: "1px solid #ececf2",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          background: accent,
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid #ececf2",
        }}
      >
        <span style={{ color, fontSize: 13, fontWeight: 600, letterSpacing: "0.04em" }}>
          {title}
        </span>
        <span
          style={{
            background: color,
            color: "#fff",
            fontSize: 11,
            padding: "1px 8px",
            borderRadius: 999,
            fontWeight: 600,
            minWidth: 22,
            textAlign: "center",
          }}
        >
          {count}
        </span>
      </div>
      <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        {children}
      </div>
    </div>
  );
}

function ColumnEmpty() {
  return (
    <div
      style={{
        padding: "24px 8px",
        textAlign: "center",
        color: "#b8b8c4",
        fontSize: 12,
      }}
    >
      无
    </div>
  );
}

function CardShell({
  candidateName,
  rightTag,
  rightColor,
  excerpt,
  meta,
  onOpen,
  onQuickAdd,
}: {
  candidateName: string;
  rightTag: string;
  rightColor: string;
  excerpt: string | null;
  /** 卡片底部的小行 (例如 "截止 04-29" 或 "上次 04-24") */
  meta: React.ReactNode;
  onOpen: () => void;
  onQuickAdd: () => void;
}) {
  return (
    <div
      onClick={(e) => {
        const t = e.target as HTMLElement;
        if (t.closest("button")) return;
        onOpen();
      }}
      style={{
        padding: "10px 12px",
        borderRadius: 8,
        border: "1px solid #f0f0f5",
        cursor: "pointer",
        transition: "border-color 120ms, transform 120ms",
        background: "#fff",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "#d8d8e3";
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "#f0f0f5";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      {/* 第一行: 姓名 + 渠道图标 + 状态 tag */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 6,
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontWeight: 600,
            color: "#1a1a4e",
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            gap: 6,
            minWidth: 0,
          }}
        >
          {candidateName}
        </span>
        <Tag
          style={{
            margin: 0,
            background: `${rightColor}14`,
            color: rightColor,
            border: "none",
            fontSize: 11,
            fontWeight: 500,
            flexShrink: 0,
          }}
        >
          {rightTag}
        </Tag>
      </div>

      {/* 内容片段 */}
      {excerpt && (
        <div
          style={{
            fontSize: 12,
            color: "#52527a",
            lineHeight: 1.5,
            background: "#fafafb",
            border: "1px solid #f0f0f5",
            borderRadius: 6,
            padding: "6px 8px",
            marginBottom: 6,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {excerpt}
        </div>
      )}

      {/* 底部: meta + 快速跟进按钮 */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>{meta}</div>
        <Button
          size="small"
          type="text"
          icon={<PlusOutlined />}
          style={{
            color: "#1a1a4e",
            fontWeight: 500,
            fontSize: 12,
            padding: "0 8px",
          }}
          onClick={(e) => {
            e.stopPropagation();
            onQuickAdd();
          }}
        >
          跟进
        </Button>
      </div>
    </div>
  );
}

function PlanCard({
  candidateName,
  detail,
  due,
  rightTag,
  rightColor,
  excerpt,
  onOpen,
  onQuickAdd,
}: {
  candidateName: string;
  detail: string;
  due: string;
  rightTag: string;
  rightColor: string;
  excerpt: string | null;
  onOpen: () => void;
  onQuickAdd: () => void;
}) {
  return (
    <CardShell
      candidateName={candidateName}
      rightTag={rightTag}
      rightColor={rightColor}
      excerpt={excerpt}
      onOpen={onOpen}
      onQuickAdd={onQuickAdd}
      meta={
        <>
          <div
            style={{
              fontSize: 12,
              color: "#1a1a4e",
              fontWeight: 500,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            ▸ {detail}
          </div>
          <Text type="secondary" style={{ fontSize: 11 }}>
            截止 {dayjs(due).format("MM-DD")}
          </Text>
        </>
      }
    />
  );
}

function StaleCard({
  candidateName,
  daysSince,
  lastAt,
  status,
  excerpt,
  onOpen,
  onQuickAdd,
}: {
  candidateName: string;
  daysSince: number;
  lastAt: string;
  status: string | null;
  excerpt: string | null;
  onOpen: () => void;
  onQuickAdd: () => void;
}) {
  return (
    <CardShell
      candidateName={candidateName}
      rightTag={`${daysSince} 天`}
      rightColor="#52527a"
      excerpt={excerpt}
      onOpen={onOpen}
      onQuickAdd={onQuickAdd}
      meta={
        <>
          <div style={{ fontSize: 12, color: "#52527a" }}>
            {status ? STATUS_LABEL[status as keyof typeof STATUS_LABEL] : "未跟进"}
          </div>
          <Text type="secondary" style={{ fontSize: 11 }}>
            上次 {dayjs(lastAt).format("MM-DD")}
          </Text>
        </>
      }
    />
  );
}
