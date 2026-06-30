import { useEffect, useState } from "react";
import { Button, Skeleton, Tooltip, Typography, message } from "antd";
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  BulbOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import {
  dashboardApi,
  type AIInsight,
  type BreakdownItem,
  type DashboardOverview,
  type DayActivity,
  type FunnelStage,
  type KPISpark,
} from "@/api/dashboard";
import {
  followUpsApi,
  type Reminders,
  type ReminderOverdueItem,
  type ReminderStaleItem, // used in RemindersStrip via "as" casts
} from "@/api/follow-ups";
import { useNavigate } from "react-router-dom";
import CandidateDetailDrawer from "@/components/CandidateDetailDrawer";
import NewFollowUpModal from "@/components/NewFollowUpModal";
import ActivityAreaChart from "@/components/charts/ActivityAreaChart";
import ChartCaption from "@/components/ChartCaption";
import FunnelStageDrawer from "@/components/FunnelStageDrawer";
import RecentActivityDrawer from "@/components/RecentActivityDrawer";
import PendingFollowUpsDrawer from "@/components/PendingFollowUpsDrawer";

const { Text, Title } = Typography;

const PRIMARY = "#1a1a4e";
const ACCENT = "#5b7cff";
const POSITIVE = "#0e5b34";
const NEGATIVE = "#a8231d";
const TEXT_DIM = "#9ea0b0";
const BORDER = "#ececf2";

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [insight, setInsight] = useState<AIInsight | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [reminders, setReminders] = useState<Reminders | null>(null);
  const [pickedCandidate, setPickedCandidate] = useState<number | null>(null);
  const [quickAdd, setQuickAdd] = useState<{ id: number; name: string } | null>(null);
  const [funnelDrill, setFunnelDrill] = useState<{ key: string; label: string } | null>(null);
  const [activityDrill, setActivityDrill] = useState<"follow_ups" | "status_changes" | null>(null);
  const [pendingDrawerOpen, setPendingDrawerOpen] = useState(false);
  const navigate = useNavigate();
  const gotoCandidates = (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    navigate(`/candidates${qs ? `?${qs}` : ""}`);
  };
  const fetchOverview = async () => {
    setLoading(true);
    try {
      setData(await dashboardApi.overview());
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? "加载看板失败");
    } finally {
      setLoading(false);
    }
  };

  const fetchInsight = async (force = false) => {
    setInsightLoading(true);
    try {
      setInsight(await dashboardApi.insight(force));
    } catch (e: any) {
      message.warning(e?.response?.data?.detail ?? "AI 观察暂不可用");
    } finally {
      setInsightLoading(false);
    }
  };

  const fetchReminders = async () => {
    try {
      setReminders(await followUpsApi.reminders());
    } catch {
      /* 静默失败 */
    }
  };

  useEffect(() => {
    fetchOverview();
    fetchInsight(false);
    fetchReminders();
  }, []);

  // Stay in sync with chat-driven mutations (e.g. agent imports a candidate
  // or logs a follow-up) so the KPIs and reminders don't go stale.
  useEffect(() => {
    const refresh = () => {
      fetchOverview();
      fetchReminders();
    };
    window.addEventListener("candidate:created", refresh);
    window.addEventListener("follow_up:created", refresh);
    return () => {
      window.removeEventListener("candidate:created", refresh);
      window.removeEventListener("follow_up:created", refresh);
    };
  }, []);

  return (
    <div
      style={{
        padding: "40px 40px 64px",
        background: "#fff",
        minHeight: "100%",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 1400, // editorial upper bound — beyond this gets too sparse
          margin: "0 auto",
        }}
      >
        {/* Header — title + AI insight on the right, single line on wide screens */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 24,
            marginBottom: 8,
          }}
        >
          <div style={{ flex: "0 0 auto" }}>
            <Title
              level={2}
              style={{
                margin: 0,
                color: PRIMARY,
                letterSpacing: "-0.015em",
                fontSize: 26,
                fontWeight: 600,
              }}
            >
              数据看板
            </Title>
            {data && (
              <Text type="secondary" style={{ fontSize: 12, color: "#9ea0b0" }}>
                {data.scope === "org" ? "全公司" : "我的候选人"} · 更新于{" "}
                {dayjs(data.generated_at).format("HH:mm")}
              </Text>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0, marginTop: 4 }}>
            <InsightBanner
              insight={insight}
              loading={insightLoading}
              onRefresh={() => fetchInsight(true)}
            />
          </div>
          <Button
            type="text"
            icon={<ReloadOutlined />}
            onClick={() => {
              fetchOverview();
              fetchInsight(true);
            }}
            loading={loading}
            style={{ color: "#9ea0b0", flexShrink: 0 }}
          >
            刷新
          </Button>
        </div>

        {/* 待跟进 — promoted: it's the action entry point, lives above KPI */}
        {reminders && reminders.total > 0 && (
          <div id="dashboard-reminders" style={{ marginTop: 32 }}>
            <RemindersStrip
              reminders={reminders}
              onOpen={(id) => setPickedCandidate(id)}
              onQuickAdd={(id, name) => setQuickAdd({ id, name })}
            />
          </div>
        )}

        {/* KPI row */}
        <div
          style={{
            marginTop: 32,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
          }}
        >
          {loading || !data
            ? Array.from({ length: 4 }).map((_, i) => <KPISkeleton key={i} />)
            : data.kpis.map((k) => (
                <KPICard
                  key={k.label}
                  kpi={k}
                  onClick={() => {
                    if (k.label === "候选人总数") gotoCandidates({});
                    else if (k.label === "本周跟进") setActivityDrill("follow_ups");
                    else if (k.label === "待跟进") setPendingDrawerOpen(true);
                    else if (k.label === "本周状态变更") setActivityDrill("status_changes");
                  }}
                />
              ))}
        </div>

        {/* Reference info — three charts side-by-side on wide screens, wraps at <1100px */}
        <div
          style={{
            marginTop: 40,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
            gap: 24,
          }}
        >
          <Section title="候选人入职状态" hint="点击查看该阶段候选人">
            {loading || !data ? (
              <Skeleton active paragraph={{ rows: 4 }} title={false} />
            ) : (
              <>
                <Funnel
                  stages={data.funnel}
                  onStageClick={(s) => setFunnelDrill({ key: s.key, label: s.label })}
                />
                <FunnelCaption stages={data.funnel} />
              </>
            )}
          </Section>
          <Section title="行业分布" hint="Top 5 · 点击下钻">
            {loading || !data ? (
              <Skeleton active paragraph={{ rows: 4 }} title={false} />
            ) : (
              <>
                <BreakdownBars
                  items={data.industry_breakdown}
                  accentColor={PRIMARY}
                  onItemClick={(it) => gotoCandidates({ industry: it.key })}
                />
                <IndustryCaption items={data.industry_breakdown} />
              </>
            )}
          </Section>
          <Section title="本周活动" hint="跟进 + 状态变更">
            {loading || !data ? (
              <Skeleton active paragraph={{ rows: 4 }} title={false} />
            ) : (
              <>
                <ActivityAreaChart
                  data={data.activity_7d.map((d) => ({
                    day: dayjs(d.day).format("MM-DD"),
                    跟进: d.follow_ups,
                    状态变更: d.status_changes,
                  }))}
                  primaryColor={PRIMARY}
                  accentColor={ACCENT}
                  height={200}
                />
                <ActivityCaption data={data.activity_7d} />
              </>
            )}
          </Section>
        </div>
      </div>

      <CandidateDetailDrawer
        candidateId={pickedCandidate}
        open={pickedCandidate != null}
        onClose={() => setPickedCandidate(null)}
        onSaved={() => {
          // Drawer triggers this on follow-up create / status change / edit;
          // any of those can shift the funnel + KPIs, so re-pull both.
          fetchReminders();
          fetchOverview();
        }}
      />
      <FunnelStageDrawer
        stageKey={funnelDrill?.key ?? null}
        stageLabel={funnelDrill?.label ?? ""}
        onClose={() => setFunnelDrill(null)}
        onPickCandidate={(id) => {
          setFunnelDrill(null);
          setPickedCandidate(id);
        }}
      />
      <RecentActivityDrawer
        mode={activityDrill}
        onClose={() => setActivityDrill(null)}
        onPickCandidate={(id) => {
          setActivityDrill(null);
          setPickedCandidate(id);
        }}
        onChanged={() => {
          fetchOverview();
          fetchReminders();
        }}
      />
      <PendingFollowUpsDrawer
        open={pendingDrawerOpen}
        reminders={reminders}
        onClose={() => setPendingDrawerOpen(false)}
        onPickCandidate={(id) => {
          setPendingDrawerOpen(false);
          setPickedCandidate(id);
        }}
      />
      {quickAdd && (
        <NewFollowUpModal
          open
          candidateId={quickAdd.id}
          candidateName={quickAdd.name}
          onClose={() => setQuickAdd(null)}
          onCreated={() => {
            setQuickAdd(null);
            fetchReminders();
            fetchOverview();
          }}
        />
      )}
    </div>
  );
}

// ─── Reminders strip ─────────────────────────────────────────────────────────

function RemindersStrip({
  reminders,
  onOpen,
  onQuickAdd,
}: {
  reminders: Reminders;
  onOpen: (candidateId: number) => void;
  onQuickAdd: (id: number, name: string) => void;
}) {
  const items: Array<{
    item: ReminderOverdueItem | ReminderStaleItem;
    kind: "overdue" | "today" | "stale";
  }> = [
    ...reminders.overdue.map((i) => ({ item: i, kind: "overdue" as const })),
    ...reminders.due_today.map((i) => ({ item: i, kind: "today" as const })),
    ...reminders.stale.map((i) => ({ item: i, kind: "stale" as const })),
  ];

  // Left-rail accent only — body stays neutral, never reads as alert.
  const colorMap = { overdue: "#d04545", today: "#d4a04d", stale: "#a8a8b8" };
  const labelMap = {
    overdue: (i: any) => `逾期 ${i.days_overdue} 天`,
    today: () => "今天到期",
    stale: (i: any) => `${i.days_since} 天未联系`,
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 6,
          marginBottom: 12,
          fontSize: 13,
          color: "#9ea0b0",
          fontWeight: 500,
          letterSpacing: "0.02em",
        }}
      >
        <span>待跟进</span>
        <span style={{ color: "#cdcdd6" }}>·</span>
        <span style={{ color: "#b8b8c4", fontVariantNumeric: "tabular-nums" }}>
          {reminders.total}
        </span>
      </div>
      {/* Linear/Cron-style borderless list — rows divided by hairlines, status by a 6px dot */}
      <div style={{ borderTop: "1px solid #f0f0f5" }}>
        {items.map(({ item, kind }) => {
          const color = colorMap[kind];
          const label = labelMap[kind](item);
          const isOverdueOrToday = kind !== "stale";
          const od = item as ReminderOverdueItem;
          const st = item as ReminderStaleItem;
          return (
            <div
              key={`${kind}-${item.candidate_id}`}
              onClick={() => onOpen(item.candidate_id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "12px 4px",
                borderBottom: "1px solid #f0f0f5",
                cursor: "pointer",
                fontVariantNumeric: "tabular-nums",
                transition: "background 120ms ease, padding-left 160ms ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#fafaff";
                e.currentTarget.style.paddingLeft = "8px";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.paddingLeft = "4px";
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: color,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: "#1a1a4e",
                  letterSpacing: "-0.005em",
                  minWidth: 80,
                  flexShrink: 0,
                }}
              >
                {item.candidate_name}
              </span>
              <span style={{ fontSize: 13, color: "#8c8c9a", flex: 1, minWidth: 0 }}>
                <span style={{ color }}>{label}</span>
                {isOverdueOrToday && od.next_plan && (
                  <span style={{ marginLeft: 8 }}>· {od.next_plan}</span>
                )}
                {!isOverdueOrToday && st.last_follow_content_excerpt && (
                  <span style={{ marginLeft: 8 }}>· {st.last_follow_content_excerpt}</span>
                )}
              </span>
              <Tooltip title="快速跟进">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onQuickAdd(item.candidate_id, item.candidate_name);
                  }}
                  style={{
                    background: "transparent",
                    border: "none",
                    padding: "4px 6px",
                    cursor: "pointer",
                    color: "#722ed1",
                    fontSize: 13,
                    fontWeight: 500,
                    flexShrink: 0,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    transition: "color 120ms ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#9254de")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "#722ed1")}
                >
                  跟进
                  <span style={{ fontSize: 12 }}>→</span>
                </button>
              </Tooltip>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 子组件
// ---------------------------------------------------------------------------

function InsightBanner({
  insight,
  loading,
  onRefresh,
}: {
  insight: AIInsight | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  // Demoted from a tinted full-width banner to a quiet prose line under the
  // page title — research feedback: tinted banners are the #1 signal of
  // "ops dashboard" rather than "decent product".
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "flex-start",
        fontSize: 13,
        color: "#8c8c9a",
        lineHeight: 1.6,
        fontStyle: "italic",
      }}
    >
      <BulbOutlined style={{ color: "#b8b8c4", fontSize: 13, marginTop: 4, flexShrink: 0 }} />
      {loading && !insight ? (
        <div style={{ flex: 1, minWidth: 0 }}>
          <Skeleton active paragraph={false} title={{ width: "70%" }} />
        </div>
      ) : (
        <>
          <span style={{ flexShrink: 1, minWidth: 0 }}>
            {insight?.text ?? "—"}
            {insight?.cached && (
              <span style={{ marginLeft: 6, fontSize: 11, color: "#b8b8c4", fontStyle: "normal" }}>
                · 缓存
              </span>
            )}
          </span>
          <Tooltip title="重新生成（会调用 AI）">
            <Button
              type="text"
              shape="circle"
              icon={<ReloadOutlined />}
              size="small"
              loading={loading}
              onClick={onRefresh}
              style={{ color: "#b8b8c4", flexShrink: 0, marginTop: -2 }}
            />
          </Tooltip>
          <div style={{ flex: 1 }} />
        </>
      )}
    </div>
  );
}

function KPICard({ kpi, onClick }: { kpi: KPISpark; onClick?: () => void }) {
  const delta = kpi.delta_pct;
  const positive = delta != null && delta > 0;
  const negative = delta != null && delta < 0;

  return (
    <Tooltip title={kpi.source} placement="bottom">
      <div
        onClick={onClick}
        style={{
          background: "#fff",
          border: "1px solid rgba(20, 20, 50, 0.06)",
          borderRadius: 14,
          padding: "20px 22px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          minHeight: 132,
          cursor: onClick ? "pointer" : "default",
          transition: "border-color 160ms, transform 160ms",
        }}
        onMouseEnter={(e) => {
          if (!onClick) return;
          e.currentTarget.style.borderColor = "rgba(20, 20, 50, 0.14)";
          e.currentTarget.style.transform = "translateY(-1px)";
        }}
        onMouseLeave={(e) => {
          if (!onClick) return;
          e.currentTarget.style.borderColor = "rgba(20, 20, 50, 0.06)";
          e.currentTarget.style.boxShadow = "none";
          e.currentTarget.style.transform = "translateY(0)";
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: TEXT_DIM,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          {kpi.label}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: 32,
              fontWeight: 600,
              color: PRIMARY,
              letterSpacing: "-0.025em",
              lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {kpi.value.toLocaleString()}
          </span>
          {delta != null && (
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: positive ? POSITIVE : negative ? NEGATIVE : TEXT_DIM,
                display: "inline-flex",
                alignItems: "center",
                gap: 2,
              }}
            >
              {positive ? <ArrowUpOutlined /> : negative ? <ArrowDownOutlined /> : null}
              {Math.abs(delta).toFixed(1)}%
            </span>
          )}
        </div>
        {kpi.sparkline.length > 0 && (
          <Sparkline
            values={kpi.sparkline}
            color={positive ? POSITIVE : negative ? NEGATIVE : ACCENT}
          />
        )}
      </div>
    </Tooltip>
  );
}

function KPISkeleton() {
  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${BORDER}`,
        borderRadius: 12,
        padding: "16px 18px",
        minHeight: 120,
      }}
    >
      <Skeleton active paragraph={{ rows: 2 }} title={false} />
    </div>
  );
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length === 0) return null;
  const max = Math.max(...values, 1);
  const w = 100;
  const h = 24;
  const step = w / Math.max(values.length - 1, 1);
  const points = values
    .map((v, i) => `${(i * step).toFixed(2)},${(h - (v / max) * h).toFixed(2)}`)
    .join(" ");
  const areaPoints = `0,${h} ${points} ${w},${h}`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: 28 }}>
      <polygon points={areaPoints} fill={color} fillOpacity={0.12} />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 18,
          gap: 8,
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 500, color: "#52527a", letterSpacing: "0.01em" }}>
          {title}
        </span>
        {hint && (
          <Text type="secondary" style={{ fontSize: 12, color: "#b8b8c4" }}>
            {hint}
          </Text>
        )}
      </div>
      <div
        style={{
          background: "#fff",
          border: "1px solid rgba(20, 20, 50, 0.06)",
          borderRadius: 14,
          padding: "20px 22px",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Funnel({
  stages,
  onStageClick,
}: {
  stages: FunnelStage[];
  onStageClick?: (stage: FunnelStage) => void;
}) {
  const max = Math.max(...stages.map((s) => s.count), 1);
  // One distinct hue per stage — a flat indigo→purple lerp collapsed visually
  // when bars were short. Keys match backend dashboard.py _FUNNEL_STAGES.
  const STAGE_PALETTE: Record<string, string> = {
    not_pushed: "#5b7cff",      // 正在沟通 — 蓝
    interviewing: "#722ed1",    // 正在面试 — 紫
    awaiting_offer: "#d4a04d",  // 正在等 Offer — 琥珀
    onboarded: "#13a872",       // 已入职 — 绿
    lost: "#a8a8b8",            // 已流失 — 中性灰
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {stages.map((s, i) => {
        const widthPct = (s.count / max) * 100;
        const dropAlert = s.conversion_pct != null && s.conversion_pct < 30 && i > 0;
        const clickable = !!onStageClick && s.count > 0;
        const stageColor = STAGE_PALETTE[s.key] ?? "#722ed1";
        return (
          <div
            key={s.key}
            onClick={clickable ? () => onStageClick!(s) : undefined}
            style={{
              cursor: clickable ? "pointer" : "default",
              transition: "transform 160ms ease",
            }}
            onMouseEnter={(e) => {
              if (clickable) e.currentTarget.style.transform = "translateX(2px)";
            }}
            onMouseLeave={(e) => {
              if (clickable) e.currentTarget.style.transform = "translateX(0)";
            }}
            title={clickable ? `点击查看 ${s.count} 位「${s.label}」候选人` : undefined}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                fontSize: 13,
                marginBottom: 6,
              }}
            >
              <span style={{ color: "#1a1a4e", fontWeight: 500, letterSpacing: "-0.005em" }}>
                {s.label}
              </span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "baseline",
                  gap: 8,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                <span style={{ fontSize: 15, fontWeight: 600, color: "#1a1a4e" }}>{s.count}</span>
                {s.conversion_pct != null && i > 0 && (
                  <span
                    style={{
                      fontSize: 11,
                      padding: "1px 7px",
                      borderRadius: 999,
                      background: dropAlert ? "#fff1f0" : "#f5f5f8",
                      color: dropAlert ? "#a8231d" : "#8c8c9a",
                      fontWeight: 500,
                    }}
                  >
                    {s.conversion_pct.toFixed(0)}%
                  </span>
                )}
              </span>
            </div>
            <div
              style={{
                height: 12,
                background: "#f4f4f8",
                borderRadius: 999,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${Math.max(widthPct, s.count > 0 ? 4 : 0)}%`,
                  background: stageColor,
                  borderRadius: 999,
                  transition: "width 600ms cubic-bezier(0.22, 1, 0.36, 1)",
                  boxShadow: `inset 0 -1px 0 rgba(0,0,0,0.06)`,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Captions ────────────────────────────────────────────────────────────────

function FunnelCaption({ stages }: { stages: FunnelStage[] }) {
  const total = stages.reduce((sum, s) => sum + s.count, 0);
  if (total === 0) return null;
  // Headline = the most populated *active* bucket (skip 已入职 / 流失,
  // those are end-states not "people you should be working on").
  const ACTIVE_KEYS = new Set(["not_pushed", "interviewing", "awaiting_offer"]);
  const activeStages = stages.filter((s) => ACTIVE_KEYS.has(s.key));
  const activeTotal = activeStages.reduce((a, s) => a + s.count, 0);
  const top = activeStages.reduce<FunnelStage | null>(
    (best, s) => (best == null || s.count > best.count ? s : best),
    null,
  );
  const onboarded = stages.find((s) => s.key === "onboarded")?.count ?? 0;
  const lost = stages.find((s) => s.key === "lost")?.count ?? 0;
  return (
    <ChartCaption>
      共 {total} 人。进行中 {activeTotal} 人
      {top && top.count > 0 ? ` (最多在「${top.label}」${top.count} 人)` : ""}
      ；已入职 {onboarded}，流失 {lost}
    </ChartCaption>
  );
}

function IndustryCaption({ items }: { items: BreakdownItem[] }) {
  if (items.length === 0) return null;
  const total = items.reduce((a, x) => a + x.count, 0);
  const top = items[0];
  const pct = total > 0 ? ((top.count / total) * 100).toFixed(0) : "0";
  return (
    <ChartCaption>
      Top 1：<b>{top.label}</b> {top.count} 人，占前 {items.length} 行业的 {pct}%
    </ChartCaption>
  );
}

function ActivityCaption({ data }: { data: DayActivity[] }) {
  if (data.length === 0) return null;
  const totalFu = data.reduce((a, d) => a + d.follow_ups, 0);
  const totalSc = data.reduce((a, d) => a + d.status_changes, 0);
  // Pick the day with the most activity
  let peakIdx = 0;
  let peakTotal = 0;
  data.forEach((d, i) => {
    const t = d.follow_ups + d.status_changes;
    if (t > peakTotal) {
      peakTotal = t;
      peakIdx = i;
    }
  });
  const peakDay = dayjs(data[peakIdx].day).format("MM-DD ddd");
  return (
    <ChartCaption>
      本周共 {totalFu} 次跟进、{totalSc} 次状态变更
      {peakTotal > 0 ? `，${peakDay} 最活跃（${peakTotal} 次）` : ""}
    </ChartCaption>
  );
}

// ─── Donut helpers ───────────────────────────────────────────────────────────

function BreakdownBars({
  items,
  onItemClick,
}: {
  items: BreakdownItem[];
  /** Kept for API compat; visuals now use a fixed blue color ramp. */
  accentColor?: string;
  onItemClick?: (item: BreakdownItem) => void;
}) {
  if (items.length === 0)
    return (
      <Text type="secondary" style={{ fontSize: 12 }}>
        暂无数据
      </Text>
    );
  const max = Math.max(...items.map((i) => i.count), 1);
  // Single-hue blue ramp — echoes 正在沟通 in the funnel without competing
  // with its 5-color rainbow. Ramp goes deepest at rank 1 and fades down.
  const RANK_COLORS = ["#3b5bcc", "#5b7cff", "#8aa3ff", "#a8bdff", "#c5d2ff"];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {items.map((it, idx) => {
        const pct = (it.count / max) * 100;
        const clickable = !!onItemClick;
        const barColor = RANK_COLORS[Math.min(idx, RANK_COLORS.length - 1)];
        return (
          <div
            key={it.key}
            onClick={clickable ? () => onItemClick!(it) : undefined}
            style={{
              cursor: clickable ? "pointer" : "default",
              transition: "transform 160ms ease",
            }}
            onMouseEnter={(e) => {
              if (clickable) e.currentTarget.style.transform = "translateX(2px)";
            }}
            onMouseLeave={(e) => {
              if (clickable) e.currentTarget.style.transform = "translateX(0)";
            }}
            title={clickable ? `点击查看「${it.label}」候选人` : undefined}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                fontSize: 13,
                marginBottom: 6,
              }}
            >
              <span style={{ color: "#1a1a4e", fontWeight: 500, letterSpacing: "-0.005em" }}>
                {it.label}
              </span>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: "#1a1a4e",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {it.count}
              </span>
            </div>
            <div
              style={{
                height: 12,
                background: "#f4f4f8",
                borderRadius: 999,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${Math.max(pct, 2)}%`,
                  background: barColor,
                  borderRadius: 999,
                  transition: "width 600ms cubic-bezier(0.22, 1, 0.36, 1)",
                  boxShadow: "inset 0 -1px 0 rgba(0,0,0,0.06)",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// (ActivityChart was replaced by StackedAreaChart at the call site.)
