import { Space, Typography } from "antd";
import { ThunderboltFilled } from "@ant-design/icons";

const { Text } = Typography;

interface Props {
  positionTitle: string;
  score: number;
  /** Click switches the active tab to 概览 (where the AI assessment card lives). */
  onJumpToAssessment?: () => void;
}

export default function MatchContextBanner({ positionTitle, score, onJumpToAssessment }: Props) {
  const tier =
    score >= 80
      ? { label: "强匹配", color: "#52c41a", bg: "#f6ffed", border: "#b7eb8f" }
      : score >= 60
        ? { label: "良好", color: "#1677ff", bg: "#e6f4ff", border: "#91caff" }
        : { label: "一般", color: "#faad14", bg: "#fffbe6", border: "#ffe58f" };

  return (
    <div
      style={{
        padding: "8px 16px",
        background: tier.bg,
        border: `1px solid ${tier.border}`,
        borderRadius: 6,
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <ThunderboltFilled style={{ color: tier.color, fontSize: 14 }} />
      <Space size={6} style={{ flex: 1, flexWrap: "wrap" }}>
        <Text style={{ fontSize: 13 }}>正在匹配</Text>
        <Text strong style={{ fontSize: 13 }}>「{positionTitle}」</Text>
        <span
          style={{
            fontSize: 12,
            padding: "1px 8px",
            borderRadius: 999,
            background: tier.color,
            color: "#fff",
            fontWeight: 600,
          }}
        >
          {score.toFixed(0)} 分 · {tier.label}
        </span>
      </Space>
      {onJumpToAssessment && (
        <a
          onClick={(e) => {
            e.preventDefault();
            onJumpToAssessment();
          }}
          style={{ fontSize: 12, color: tier.color, fontWeight: 500 }}
        >
          查看打分明细 →
        </a>
      )}
    </div>
  );
}