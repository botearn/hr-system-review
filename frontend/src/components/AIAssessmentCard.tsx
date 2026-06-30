import { useState } from "react";
import {
  Button,
  Card,
  Collapse,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import {
  CheckCircleFilled,
  CloseCircleFilled,
  ExclamationCircleFilled,
  LoadingOutlined,
  RobotOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { candidatesApi, type CandidateDetail } from "@/api/candidates";

const { Text, Paragraph } = Typography;

const DIM_ORDER = ["capability", "skill", "salary", "industry", "education", "city"] as const;
const DIM_LABEL: Record<string, string> = {
  capability: "能力",
  skill: "技能",
  salary: "薪资",
  industry: "行业",
  education: "学历",
  city: "城市",
};

type Verdict = "meets" | "partial" | "gap";

const VERDICT: Record<Verdict, { label: string; color: string; icon: React.ReactNode }> = {
  meets: { label: "匹配", color: "#52c41a", icon: <CheckCircleFilled /> },
  partial: { label: "部分", color: "#faad14", icon: <ExclamationCircleFilled /> },
  gap: { label: "不足", color: "#ff4d4f", icon: <CloseCircleFilled /> },
};

const verdictOf = (score: number): Verdict =>
  score >= 80 ? "meets" : score >= 60 ? "partial" : "gap";

interface MatchContext {
  position_title: string;
  score: number;
  sub_scores: Record<string, number>;
  matched_points: Array<{ dim: string; detail: string }>;
  gap_points: Array<{ dim: string; detail: string }>;
  rank_reason: string;
  analysis: string;
  interview_advice: string[];
}

interface Props {
  /** When present: render match-mode (per-dim verdicts against a job). */
  matchContext?: MatchContext | null;
  /** Always available: candidate's AI-derived capability portrait. */
  candidate: CandidateDetail | null;
  /** Called after a manual capability re-derivation, so the parent can refetch. */
  onCapabilitiesDerived?: () => void | Promise<void>;
}

export default function AIAssessmentCard({
  matchContext,
  candidate,
  onCapabilitiesDerived,
}: Props) {
  return (
    <Card
      size="small"
      title={
        <Space>
          <RobotOutlined style={{ color: "#722ed1" }} />
          <span style={{ fontWeight: 600 }}>
            {matchContext ? `AI 评估 · 针对「${matchContext.position_title}」` : "AI 能力画像"}
          </span>
        </Space>
      }
      style={{ borderColor: "#d3adf7", background: "linear-gradient(135deg, #faf5ff 0%, #fff 100%)" }}
      styles={{ body: { padding: 14 } }}
    >
      {matchContext ? (
        <MatchModeBody ctx={matchContext} />
      ) : (
        <DefaultModeBody candidate={candidate} onCapabilitiesDerived={onCapabilitiesDerived} />
      )}
    </Card>
  );
}

type AnalysisState = { loading: boolean; text: string | null; error: string | null };

function MatchModeBody({ ctx }: { ctx: MatchContext }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      {ctx.rank_reason && (
        <div
          style={{
            padding: "6px 10px",
            background: "#fff",
            border: "1px solid #d3adf7",
            borderRadius: 6,
            fontSize: 12,
            color: "#531dab",
            lineHeight: 1.5,
          }}
        >
          {ctx.rank_reason}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {DIM_ORDER.map((dim) => {
          const score = Number(ctx.sub_scores[dim] ?? 0);
          const v = verdictOf(score);
          const meta = VERDICT[v];
          const mp = ctx.matched_points.find((p) => p.dim === dim)?.detail;
          const gp = ctx.gap_points.find((p) => p.dim === dim)?.detail;
          const isOpen = expanded === dim;
          const hasEvidence = !!(mp || gp);
          return (
            <div
              key={dim}
              style={{
                background: "#fff",
                border: "1px solid #f0e6ff",
                borderRadius: 6,
                overflow: "hidden",
              }}
            >
              <div
                onClick={() => hasEvidence && setExpanded(isOpen ? null : dim)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 12px",
                  cursor: hasEvidence ? "pointer" : "default",
                }}
              >
                <span style={{ color: meta.color, fontSize: 14, display: "inline-flex" }}>
                  {meta.icon}
                </span>
                <Text style={{ flex: 1, fontWeight: 500, fontSize: 13 }}>{DIM_LABEL[dim]}</Text>
                <Tag style={{ background: meta.color + "15", color: meta.color, border: "none", margin: 0 }}>
                  {meta.label}
                </Tag>
                <Text type="secondary" style={{ fontSize: 11, minWidth: 36, textAlign: "right" }}>
                  {score.toFixed(0)} 分
                </Text>
              </div>
              {isOpen && hasEvidence && (
                <div
                  style={{
                    padding: "8px 12px 10px",
                    borderTop: "1px solid #f0e6ff",
                    background: "#fafafe",
                    fontSize: 12,
                  }}
                >
                  {mp && (
                    <div style={{ color: "#389e0d", marginBottom: gp ? 4 : 0 }}>✓ {mp}</div>
                  )}
                  {gp && <div style={{ color: "#cf1322" }}>✗ {gp}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {ctx.interview_advice && ctx.interview_advice.length > 0 && (
        <Collapse
          ghost
          size="small"
          items={[
            {
              key: "advice",
              label: <Text style={{ fontSize: 12, color: "#722ed1" }}>面试关注点 ({ctx.interview_advice.length})</Text>,
              children: (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {ctx.interview_advice.map((a, i) => (
                    <li key={i} style={{ fontSize: 12, marginBottom: 2, color: "#52527a" }}>
                      {a}
                    </li>
                  ))}
                </ul>
              ),
            },
          ]}
        />
      )}
    </Space>
  );
}

function DefaultModeBody({
  candidate,
  onCapabilitiesDerived,
}: {
  candidate: CandidateDetail | null;
  onCapabilitiesDerived?: () => void | Promise<void>;
}) {
  const caps = candidate?.derived_capabilities ?? [];
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [analyses, setAnalyses] = useState<Record<number, AnalysisState>>({});
  const [deriving, setDeriving] = useState(false);

  const handleDerive = async () => {
    if (!candidate || deriving) return;
    setDeriving(true);
    try {
      await candidatesApi.deriveCapabilities(candidate.id);
      message.success("AI 能力画像已生成");
      await onCapabilitiesDerived?.();
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? "派生能力失败，请稍后重试");
    } finally {
      setDeriving(false);
    }
  };

  const fetchAnalysis = async (idx: number, cap: { capability: string; evidence_ref?: string; evidence_detail?: string }) => {
    if (!candidate) return;
    if (analyses[idx]?.text || analyses[idx]?.loading) return;
    setAnalyses((m) => ({ ...m, [idx]: { loading: true, text: null, error: null } }));
    try {
      const r = await candidatesApi.explainCapability(candidate.id, {
        capability: cap.capability,
        evidence_ref: cap.evidence_ref,
        evidence_detail: cap.evidence_detail,
      });
      setAnalyses((m) => ({ ...m, [idx]: { loading: false, text: r.analysis, error: null } }));
    } catch (e: any) {
      const detail = e?.response?.data?.detail ?? e?.message ?? "解读失败";
      setAnalyses((m) => ({ ...m, [idx]: { loading: false, text: null, error: detail } }));
    }
  };

  if (!caps.length) {
    return (
      <Space direction="vertical" size={8} style={{ width: "100%", alignItems: "center", padding: "4px 0" }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          尚未提取到能力画像
        </Text>
        <Button
          size="small"
          type="primary"
          icon={deriving ? <LoadingOutlined /> : <ThunderboltOutlined />}
          loading={deriving}
          onClick={handleDerive}
          disabled={!candidate || deriving}
          style={{ background: "#722ed1", borderColor: "#722ed1" }}
        >
          {deriving ? "派生中…" : "AI 派生能力"}
        </Button>
      </Space>
    );
  }

  return (
    <Space direction="vertical" size={6} style={{ width: "100%" }}>
      <Text type="secondary" style={{ fontSize: 12 }}>
        AI 从简历提炼，点击展开 AI 深度解读
      </Text>
      {caps.map((c, i) => {
        const isOpen = openIdx === i;
        const a = analyses[i];
        return (
          <div
            key={i}
            style={{
              background: "#fff",
              border: "1px solid #f0e6ff",
              borderRadius: 6,
              overflow: "hidden",
            }}
          >
            <div
              onClick={() => {
                const next = isOpen ? null : i;
                setOpenIdx(next);
                if (next !== null) fetchAnalysis(i, c);
              }}
              style={{
                padding: "6px 12px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Tag color="purple" style={{ margin: 0 }}>
                {c.capability}
              </Tag>
              {c.evidence_ref && (
                <Text type="secondary" style={{ fontSize: 11 }}>
                  · {c.evidence_ref}
                </Text>
              )}
              <Tooltip title={isOpen ? "" : "点击让 AI 深度解读"}>
                <Text type="secondary" style={{ fontSize: 11, marginLeft: "auto" }}>
                  {isOpen ? "收起" : "AI 解读 ↗"}
                </Text>
              </Tooltip>
            </div>
            {isOpen && (
              <div
                style={{
                  padding: "8px 12px 10px",
                  borderTop: "1px solid #f0e6ff",
                  background: "#fafafe",
                  fontSize: 12,
                  color: "#52527a",
                }}
              >
                {a?.loading && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#722ed1" }}>
                    <Spin indicator={<LoadingOutlined spin />} size="small" />
                    <Text style={{ fontSize: 12, color: "#722ed1" }}>AI 正在结合简历深度解读…</Text>
                  </div>
                )}
                {a?.error && (
                  <Text type="danger" style={{ fontSize: 12 }}>
                    {a.error}
                  </Text>
                )}
                {a?.text && (
                  <Paragraph style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>
                    {a.text}
                  </Paragraph>
                )}
                {/* fallback to stored evidence_detail while loading first time */}
                {!a && c.evidence_detail && (
                  <Paragraph style={{ margin: 0, fontSize: 12, color: "#8c8c9a" }}>
                    {c.evidence_detail}
                  </Paragraph>
                )}
              </div>
            )}
          </div>
        );
      })}
    </Space>
  );
}