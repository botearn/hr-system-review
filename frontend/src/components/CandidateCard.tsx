import { Tag, Tooltip, Typography } from "antd";
import type { Candidate } from "@/api/candidates";
import CandidateRowActions from "@/components/CandidateRowActions";
import { STATUS_LABEL as FU_STATUS_LABEL, type FollowUpStatus } from "@/api/follow-ups";

const { Text } = Typography;

interface Props {
  candidate: Candidate;
  onOpen: (id: number) => void;
  onChanged?: () => void;
}

// 求职状态对应卡片左侧细色条 (隐式表达)
// active=可推送  watching=有空再聊  onboarded=已入职暂搁置
// 详见 backend/app/models/candidate.py
const JOB_STATUS_ACCENT: Record<string, string> = {
  active: "#1a1a4e", // 深紫蓝 (主色)
  watching: "#a8c5ff", // 天蓝 (次色)
  onboarded: "#d4d4dc", // 中性灰 (淡出)
};

// 跟进状态 pill 颜色 - 全部用品牌色系,克制
const FU_STATUS_TINT: Record<string, { bg: string; fg: string }> = {
  initial_contact: { bg: "#f4f4f8", fg: "#52527a" },
  resume_pushed: { bg: "#eef2ff", fg: "#1a1a4e" },
  interview_scheduled: { bg: "#e6efff", fg: "#1a1a4e" },
  interview_1_passed: { bg: "#dee8ff", fg: "#1a1a4e" },
  interview_2_passed: { bg: "#cfe0ff", fg: "#1a1a4e" },
  offer_sent: { bg: "#fff7e6", fg: "#874d00" },
  onboarded: { bg: "#e6f4ec", fg: "#0e5b34" },
  rejected_1: { bg: "#fef0ef", fg: "#a8231d" },
  rejected_2: { bg: "#fde7e6", fg: "#a8231d" },
  declined_offer: { bg: "#fdecea", fg: "#a8231d" },
  dropped: { bg: "#f5f5f8", fg: "#8c8c98" },
};

const tagWrap3LineStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 5,
  maxHeight: 78,
  overflow: "hidden",
};

function fmtRelative(ts: string | null | undefined): string | null {
  if (!ts) return null;
  const days = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
  if (days <= 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 7) return `${days} 天前`;
  if (days < 30) return `${Math.floor(days / 7)} 周前`;
  if (days < 365) return `${Math.floor(days / 30)} 月前`;
  return `${Math.floor(days / 365)} 年前`;
}

export default function CandidateCard({ candidate, onOpen, onChanged }: Props) {
  const accent = JOB_STATUS_ACCENT[candidate.job_status] ?? JOB_STATUS_ACCENT.onboarded;

  const followStatus = (candidate.last_follow_status as FollowUpStatus | null | undefined) ?? null;
  const followLabel = followStatus ? FU_STATUS_LABEL[followStatus] : "未跟进";
  const tint = followStatus ? FU_STATUS_TINT[followStatus] : { bg: "transparent", fg: "#a8a8b8" };

  const skills = candidate.skills ?? [];
  const caps = candidate.derived_capabilities ?? [];
  const followAt = fmtRelative(candidate.last_follow_at);

  return (
    <div
      onClick={(e) => {
        const t = e.target as HTMLElement;
        if (t.closest("button, a, .ant-modal, .ant-popover, .ant-tag")) return;
        onOpen(candidate.id);
      }}
      style={{
        position: "relative",
        borderRadius: 14,
        background: "#fff",
        border: "1px solid #ececf2",
        boxShadow: "0 1px 2px rgba(20, 20, 50, 0.02)",
        cursor: "pointer",
        transition: "border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "#d8d8e3";
        e.currentTarget.style.boxShadow =
          "0 1px 2px rgba(20, 20, 50, 0.04), 0 12px 28px rgba(20, 20, 50, 0.06)";
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "#ececf2";
        e.currentTarget.style.boxShadow = "0 1px 2px rgba(20, 20, 50, 0.02)";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      {/* 左侧细色条:求职状态 (隐式) */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          background: accent,
        }}
      />

      <div
        style={{ padding: "22px 24px", flex: 1, display: "flex", flexDirection: "column", gap: 16 }}
      >
        {/* 顶部:姓名 + 跟进状态 + 操作 */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: 19,
                fontWeight: 600,
                color: "#1a1a4e",
                lineHeight: 1.25,
                letterSpacing: "-0.01em",
              }}
            >
              {candidate.name}
              <span
                style={{
                  fontSize: 12,
                  color: "#b8b8c4",
                  fontWeight: 400,
                  marginLeft: 8,
                  letterSpacing: 0,
                }}
              >
                #{candidate.id}
              </span>
            </div>
            <div style={{ marginTop: 8 }}>
              <span
                style={{
                  display: "inline-block",
                  padding: "3px 12px",
                  background: tint.bg,
                  color: tint.fg,
                  border: followStatus ? "none" : "1px dashed #d4d4dc",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 500,
                  letterSpacing: 0.2,
                }}
              >
                {followLabel}
              </span>
            </div>
          </div>
          <div onClick={(e) => e.stopPropagation()}>
            <CandidateRowActions
              candidateId={candidate.id}
              candidateName={candidate.name}
              phone={candidate.phone}
              email={candidate.email}
              wechat={candidate.wechat}
              onChanged={onChanged}
            />
          </div>
        </div>

        {/* 技能 */}
        <div>
          <div
            style={{
              fontSize: 11,
              color: "#9ea0b0",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: 8,
              fontWeight: 500,
            }}
          >
            Skills
          </div>
          {skills.length === 0 ? (
            <Text type="secondary" style={{ fontSize: 13 }}>
              -
            </Text>
          ) : (
            <div style={tagWrap3LineStyle}>
              {skills.map((s) => (
                <Tag
                  key={s}
                  style={{
                    margin: 0,
                    border: "1px solid #ececf2",
                    background: "#fafafb",
                    borderRadius: 6,
                    color: "#52527a",
                    fontSize: 12,
                    padding: "1px 8px",
                  }}
                >
                  {s}
                </Tag>
              ))}
            </div>
          )}
        </div>

        {/* 能力 */}
        <div>
          <div
            style={{
              fontSize: 11,
              color: "#9ea0b0",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: 8,
              fontWeight: 500,
            }}
          >
            Capabilities
          </div>
          {caps.length === 0 ? (
            <Text type="secondary" style={{ fontSize: 13 }}>
              等待 AI 提炼
            </Text>
          ) : (
            <div style={tagWrap3LineStyle}>
              {caps.map((c, i) => (
                <Tag
                  key={i}
                  style={{
                    margin: 0,
                    border: "none",
                    background: "#eef2ff",
                    color: "#1a1a4e",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 500,
                    padding: "1px 8px",
                  }}
                >
                  {c.capability}
                </Tag>
              ))}
            </div>
          )}
        </div>

        {candidate.landed_company && (
          <div
            style={{
              marginTop: "auto",
              padding: "8px 12px",
              background: "#f6ffed",
              border: "1px solid #d9f7be",
              borderRadius: 8,
              fontSize: 12.5,
              color: "#389e0d",
              display: "flex",
              alignItems: "center",
              gap: 6,
              lineHeight: 1.4,
            }}
            title={`已入职 ${candidate.landed_company}${candidate.landed_role ? " · " + candidate.landed_role : ""}`}
          >
            <span style={{ fontSize: 14 }}>🎯</span>
            <span style={{ fontWeight: 500 }}>{candidate.landed_company}</span>
            {candidate.landed_role && (
              <span style={{ color: "#52c41a", opacity: 0.85 }}>· {candidate.landed_role}</span>
            )}
          </div>
        )}

        {/* 元信息 */}
        <div
          style={{
            marginTop: candidate.landed_company ? 0 : "auto",
            paddingTop: 14,
            borderTop: "1px solid #f5f5f8",
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
            fontSize: 12,
            color: "#52527a",
          }}
        >
          {candidate.industry && (
            <span>
              <span style={{ color: "#b8b8c4" }}>行业 · </span>
              {candidate.industry}
            </span>
          )}
          {candidate.years_of_experience != null && (
            <span>
              <span style={{ color: "#b8b8c4" }}>年限 · </span>
              {candidate.years_of_experience} 年
            </span>
          )}
          {followAt && (
            <Tooltip title={new Date(candidate.last_follow_at!).toLocaleString()}>
              <span style={{ color: "#9ea0b0", marginLeft: "auto" }}>{followAt}</span>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  );
}
