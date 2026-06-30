import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Tooltip } from "antd";
import {
  RobotOutlined,
  DashboardOutlined,
  TeamOutlined,
  ApartmentOutlined,
  BankOutlined,
  ThunderboltOutlined,
  LeftOutlined,
  RightOutlined,
  SettingOutlined,
  CodeOutlined,
} from "@ant-design/icons";
import { useAuthStore } from "@/store/auth";

const BORDER = "#ececf2";
const PRIMARY = "#1a1a4e";
const ACCENT = "#722ed1";

interface NavItem {
  key: string;
  label: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { key: "/agent", label: "AI 助手", icon: <RobotOutlined /> },
  { key: "/dashboard", label: "数据看板", icon: <DashboardOutlined /> },
  { key: "/matches", label: "智能匹配", icon: <ThunderboltOutlined /> },
  { key: "/candidates", label: "候选人库", icon: <TeamOutlined /> },
  { key: "/positions", label: "岗位管理", icon: <ApartmentOutlined /> },
  { key: "/companies", label: "企业库", icon: <BankOutlined /> },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const active = location.pathname;
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role_name === "admin";
  const canReviewInterview = user?.role_name === "admin" || user?.role_name === "interviewer";

  const W = collapsed ? 56 : 200;

  const navItems: NavItem[] = [
    ...NAV_ITEMS,
    ...(canReviewInterview
      ? [{ key: "/interview-submissions", label: "面试挑战", icon: <CodeOutlined /> }]
      : []),
    ...(isAdmin ? [{ key: "/users", label: "账号管理", icon: <SettingOutlined /> }] : []),
  ];

  return (
    <div
      style={{
        width: W,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        background: "#fff",
        borderRight: `1px solid ${BORDER}`,
        height: "100%",
        transition: "width 0.2s",
        overflow: "hidden",
      }}
    >
      {/* Logo / brand */}
      <div
        style={{
          height: 56,
          display: "flex",
          alignItems: "center",
          padding: collapsed ? "0 12px" : "0 18px",
          gap: 10,
          borderBottom: `1px solid ${BORDER}`,
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            background: `linear-gradient(135deg, ${PRIMARY} 0%, ${ACCENT} 100%)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            fontSize: 15,
            color: "#fff",
          }}
        >
          <RobotOutlined />
        </div>
        {!collapsed && (
          <span
            style={{
              fontWeight: 700,
              fontSize: 14,
              color: PRIMARY,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            AI 人才管理
          </span>
        )}
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, paddingTop: 8 }}>
        {navItems.map((item) => {
          const isActive = active === item.key || active.startsWith(item.key + "/");
          const content = (
            <Link
              to={item.key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: collapsed ? "10px 0" : "10px 18px",
                justifyContent: collapsed ? "center" : "flex-start",
                color: isActive ? ACCENT : "#4a4a6a",
                background: isActive ? "#f5f0ff" : "transparent",
                borderRadius: 8,
                margin: "1px 6px",
                textDecoration: "none",
                fontSize: 13.5,
                fontWeight: isActive ? 600 : 400,
                transition: "all 0.15s",
                borderLeft: isActive ? `3px solid ${ACCENT}` : "3px solid transparent",
              }}
            >
              <span style={{ fontSize: 16, flexShrink: 0 }}>{item.icon}</span>
              {!collapsed && <span style={{ whiteSpace: "nowrap" }}>{item.label}</span>}
            </Link>
          );

          return collapsed ? (
            <Tooltip key={item.key} title={item.label} placement="right">
              {content}
            </Tooltip>
          ) : (
            <div key={item.key}>{content}</div>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 8, paddingBottom: 8 }}>
        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: collapsed ? "center" : "flex-end",
            width: "100%",
            padding: "8px 14px",
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#b0b0c8",
            fontSize: 12,
            gap: 4,
          }}
        >
          {collapsed ? (
            <RightOutlined />
          ) : (
            <>
              <LeftOutlined />
              <span style={{ fontSize: 11 }}>收起</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
