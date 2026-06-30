import { Tooltip, Typography } from "antd";
import { BulbOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import type { MatchItem } from "@/api/matches";
import RadarChart from "@/components/RadarChart";
import ContactPopover from "@/components/ContactPopover";

const { Text } = Typography;

const CHANNEL_LABEL: Record<string, string> = {
  phone: "电话",
  wechat: "微信",
  email: "邮件",
  in_person: "面谈",
  other: "其他",
};

interface Tier {
  label: string;
  accent: string;
  text: string;
  bg: string;
  border: string;
  scoreColor: string;
}

function tierOf(score: number): Tier {
  if (score >= 80) {
    return {
      label: "强匹配",
      accent: "#52c41a",
      text: "#389e0d",
      bg: "#f6ffed",
      border: "#b7eb8f",
      scoreColor: "#52c41a",
    };
  }
  if (score >= 60) {
    return {
      label: "良好",
      accent: "#1677ff",
      text: "#0958d9",
      bg: "#e6f4ff",
      border: "#91caff",
      scoreColor: "#1677ff",
    };
  }
  return {
    label: "一般",
    accent: "#faad14",
    text: "#d46b08",
    bg: "#fffbe6",
    border: "#ffe58f",
    scoreColor: "#faad14",
  };
}

interface Props {
  item: MatchItem;
  radarLabels: string[];
  radarValues: number[];
  /** Open candidate detail drawer (in match-mode) */
  onOpenDetail: () => void;
  /** Open six-dim modal (the "六维详情" target) */
  onOpenRadar: () => void;
  /** Refetch match results after a follow-up is logged from the contact popover */
  onLogged?: () => void;
}

export default function MatchCard({
  item,
  radarLabels,
  radarValues,
  onOpenDetail,
  onOpenRadar,
  onLogged,
}: Props) {
  const tier = tierOf(item.score);

  const meta = [
    item.city,
    item.industry,
    item.years_of_experience != null ? `${item.years_of_experience} 年` : null,
  ].filter(Boolean) as string[];

  return (
    <div
      onClick={(e) => {
        const t = e.target as HTMLElement;
        if (t.closest("button, a, .ant-popover, .ant-tooltip")) return;
        onOpenDetail();
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
      {/* Tier accent bar */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          background: tier.accent,
        }}
      />

      <div
        style={{
          padding: "20px 22px",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {/* Header: name + contact */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 8,
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: "#1a1a4e",
                lineHeight: 1.25,
                letterSpacing: "-0.01em",
              }}
            >
              {item.candidate_name}
              <span
                style={{
                  fontSize: 12,
                  color: "#b8b8c4",
                  fontWeight: 400,
                  marginLeft: 8,
                }}
              >
                #{item.candidate_id}
              </span>
            </div>
          </div>
          <div onClick={(e) => e.stopPropagation()}>
            <ContactPopover
              candidateId={item.candidate_id}
              candidateName={item.candidate_name}
              phone={item.phone}
              email={item.email}
              wechat={item.wechat}
              onLogged={onLogged}
            />
          </div>
        </div>

        {/* Score + radar centerpiece */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            onOpenRadar();
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "8px 4px",
            borderRadius: 10,
            cursor: "pointer",
          }}
          title="点击查看六维详情"
        >
          <RadarChart labels={radarLabels} values={radarValues} size={120} showLabels={false} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span
              style={{
                alignSelf: "flex-start",
                padding: "2px 10px",
                background: tier.bg,
                border: `1px solid ${tier.border}`,
                color: tier.text,
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              {tier.label}
            </span>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span
                style={{
                  fontSize: 32,
                  fontWeight: 700,
                  color: tier.scoreColor,
                  lineHeight: 1,
                  letterSpacing: "-0.02em",
                }}
              >
                {item.score.toFixed(1)}
              </span>
              <span style={{ fontSize: 12, color: "#b8b8c4" }}>/ 100</span>
            </div>
            <span style={{ fontSize: 11, color: tier.text, fontWeight: 500 }}>六维详情 →</span>
          </div>
        </div>

        {/* AI rank reason */}
        {item.rank_reason && (
          <Tooltip title={item.rank_reason} placement="top" mouseEnterDelay={0.4}>
            <div
              style={{
                padding: "8px 12px",
                background: tier.bg,
                border: `1px solid ${tier.border}`,
                borderRadius: 8,
                fontSize: 12.5,
                color: tier.text,
                lineHeight: 1.5,
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              <BulbOutlined style={{ marginRight: 6 }} />
              {item.rank_reason}
            </div>
          </Tooltip>
        )}

        {/* Meta footer */}
        <div
          style={{
            marginTop: "auto",
            paddingTop: 12,
            borderTop: "1px solid #f5f5f8",
            display: "flex",
            flexWrap: "wrap",
            gap: 14,
            fontSize: 12,
            color: "#52527a",
          }}
        >
          {meta.length === 0 ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              -
            </Text>
          ) : (
            meta.map((m, i) => <span key={i}>{m}</span>)
          )}
          {item.last_contact_at && (
            <Tooltip title={new Date(item.last_contact_at).toLocaleString()}>
              <span style={{ color: "#9ea0b0", marginLeft: "auto" }}>
                上次联系 {dayjs(item.last_contact_at).fromNow()}
                {item.last_contact_channel && (
                  <span>
                    {" · "}
                    {CHANNEL_LABEL[item.last_contact_channel] ?? item.last_contact_channel}
                  </span>
                )}
              </span>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  );
}
