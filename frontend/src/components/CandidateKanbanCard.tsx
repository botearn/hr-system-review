import { Tag, Tooltip } from "antd";
import type { Candidate } from "@/api/candidates";

interface Props {
  candidate: Candidate;
  onClick?: () => void;
}

const JOB_STATUS_ACCENT: Record<string, string> = {
  active: "#1a1a4e",
  watching: "#a8c5ff",
  onboarded: "#d4d4dc",
};

export default function CandidateKanbanCard({ candidate, onClick }: Props) {
  const accent = JOB_STATUS_ACCENT[candidate.job_status] ?? "#d4d4dc";
  const skills = (candidate.skills ?? []).slice(0, 3);
  const totalSkills = candidate.skills?.length ?? 0;
  const caps = (candidate.derived_capabilities ?? []).slice(0, 2);

  return (
    <div
      onPointerDown={(e) => {
        // 留给 dnd-kit 处理拖拽; 点击交给 onClick(由父组件外层 wrap)
        e.stopPropagation;
      }}
      onClick={(e) => {
        // 单击进 detail (拖拽超过阈值由 dnd 接管)
        if (onClick) onClick();
        e.stopPropagation();
      }}
      style={{
        position: "relative",
        background: "#fff",
        border: "1px solid #ececf2",
        borderRadius: 8,
        padding: "10px 12px",
        boxShadow: "0 1px 2px rgba(20,20,50,0.03)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          background: accent,
        }}
      />
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "#1a1a4e",
          marginBottom: 6,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 6,
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {candidate.name}
        </span>
        <span style={{ color: "#b8b8c4", fontSize: 11, fontWeight: 400, flexShrink: 0 }}>
          #{candidate.id}
        </span>
      </div>

      {(skills.length > 0 || caps.length > 0) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
          {caps.map((c, i) => (
            <Tag
              key={`c-${i}`}
              style={{
                margin: 0,
                border: "none",
                background: "#eef2ff",
                color: "#1a1a4e",
                borderRadius: 4,
                fontSize: 11,
                padding: "0 6px",
                lineHeight: "18px",
              }}
            >
              {c.capability}
            </Tag>
          ))}
          {skills.map((s) => (
            <Tag
              key={s}
              style={{
                margin: 0,
                border: "none",
                background: "#fafafb",
                color: "#52527a",
                borderRadius: 4,
                fontSize: 11,
                padding: "0 6px",
                lineHeight: "18px",
              }}
            >
              {s}
            </Tag>
          ))}
          {totalSkills > 3 && (
            <Tooltip title={`共 ${totalSkills} 个技能`}>
              <span
                style={{
                  fontSize: 11,
                  color: "#b8b8c4",
                  lineHeight: "18px",
                }}
              >
                +{totalSkills - 3}
              </span>
            </Tooltip>
          )}
        </div>
      )}

      <div
        style={{
          fontSize: 11,
          color: "#9ea0b0",
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        {candidate.industry && <span>{candidate.industry}</span>}
        {candidate.years_of_experience != null && <span>· {candidate.years_of_experience}年</span>}
      </div>
    </div>
  );
}
