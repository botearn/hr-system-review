import { Tag, Tooltip } from "antd";
import type { Position } from "@/api/positions";

interface Props {
  position: Position;
  companyName?: string;
  onClick?: () => void;
}

const STATUS_COLOR: Record<string, string> = {
  open: "#0e5b34",
  paused: "#874d00",
  filled: "#0958d9",
  closed: "#a8231d",
};

export default function PositionKanbanCard({ position, companyName, onClick }: Props) {
  const accent = STATUS_COLOR[position.status] ?? "#d4d4dc";
  const reqSkills = (position.required_skills ?? []).slice(0, 3);
  const totalSkills =
    (position.required_skills ?? []).length + (position.nice_to_have_skills ?? []).length;

  return (
    <div
      onClick={(e) => {
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
          marginBottom: 4,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {position.title}
      </div>
      {companyName && (
        <div
          style={{
            fontSize: 11,
            color: "#9ea0b0",
            marginBottom: 6,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {companyName}
        </div>
      )}
      {reqSkills.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
          {reqSkills.map((s) => (
            <Tag
              key={s}
              style={{
                margin: 0,
                border: "none",
                background: "#fef0ef",
                color: "#a8231d",
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
              <span style={{ fontSize: 11, color: "#b8b8c4", lineHeight: "18px" }}>
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
        {position.city && <span>{position.city}</span>}
        {position.salary_min != null && (
          <span>
            · {position.salary_min}~{position.salary_max ?? "∞"}k
          </span>
        )}
      </div>
    </div>
  );
}
