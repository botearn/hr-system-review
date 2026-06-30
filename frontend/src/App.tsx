import { Avatar, Button, Dropdown, Space, Spin } from "antd";
import { UserOutlined } from "@ant-design/icons";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import LoginPage from "./pages/Login";
import Sidebar from "./components/Sidebar";
import InterviewPlatform from "./pages/interview/InterviewPlatform";
import MySubmissions from "./pages/interview/MySubmissions";
import AiPanel from "./components/AiPanel";
import { useAuthStore } from "./store/auth";
import { useChatStore, bindChatStoreToUser } from "./store/chat";
import { lazy, Suspense, useEffect } from "react";

// Route-level code splitting: each page becomes its own chunk so the
// initial bundle ships only the current route + shared deps. Without
// this the gzipped initial JS sat near 650 kB which is rough on slower
// networks during cold loads. Login is eager (entry surface).
const AgentPage = lazy(() => import("./pages/Agent"));
const CandidatesPage = lazy(() => import("./pages/Candidates"));
const CompaniesPage = lazy(() => import("./pages/Companies"));
const PositionsPage = lazy(() => import("./pages/Positions"));
const MatchesPage = lazy(() => import("./pages/Matches"));
const DashboardPage = lazy(() => import("./pages/Dashboard"));
const ProfilePage = lazy(() => import("./pages/Profile"));
const UsersPage = lazy(() => import("./pages/Users"));

function PageFallback() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 64,
        minHeight: 240,
      }}
    >
      <Spin />
    </div>
  );
}

// Page-specific AI panel hints
const PAGE_HINTS: Record<string, { label: string; hints: string[] }> = {
  "/agent": { label: "", hints: [] }, // Agent page has its own full UI
  "/dashboard": {
    label: "看板",
    hints: ["漏斗分析", "最近跟进", "开放岗位", "活跃候选人"],
  },
  "/candidates": {
    label: "候选人",
    hints: ["找AI方向候选人", "谁最近没跟进", "推荐匹配岗位", "候选人漏斗"],
  },
  "/positions": {
    label: "岗位",
    hints: ["有哪些急招岗位", "哪个岗位匹配最多候选人", "岗位进展汇总"],
  },
  "/companies": {
    label: "企业",
    hints: ["哪家公司合作最多", "最近新增哪些客户", "客户跟进情况"],
  },
  "/matches": {
    label: "智能匹配",
    hints: ["推荐最佳匹配", "解释匹配理由", "找适合的候选人"],
  },
};

function getPageConfig(pathname: string) {
  for (const key of Object.keys(PAGE_HINTS)) {
    if (pathname === key || pathname.startsWith(key + "/")) {
      return PAGE_HINTS[key];
    }
  }
  return { label: "", hints: [] };
}

function ProtectedLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { accessToken, user, clear } = useAuthStore();

  // Re-bind the chat store namespace whenever the active user changes
  // (covers the page-refresh case where Login.tsx didn't run this round).
  useEffect(() => {
    if (user?.id != null) bindChatStoreToUser(user.id);
  }, [user?.id]);

  if (!accessToken) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  const isAgentPage = location.pathname === "/agent" || location.pathname.startsWith("/agent/");
  const pageConfig = getPageConfig(location.pathname);

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* Left sidebar */}
      <Sidebar />

      {/* Center: topbar + content */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        {/* Topbar */}
        <div
          style={{
            height: 56,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            padding: "0 20px",
            borderBottom: "1px solid #f0f0f0",
            background: "#fff",
            flexShrink: 0,
            gap: 8,
          }}
        >
          <Dropdown
            menu={{
              items: [
                {
                  key: "profile",
                  label: "个人设置",
                  onClick: () => navigate("/profile"),
                },
                { type: "divider" },
                {
                  key: "logout",
                  label: "退出登录",
                  onClick: () => {
                    // Archive the current thread to history but keep history
                    // intact so the user can revisit past sessions later.
                    useChatStore.getState().archiveCurrent();
                    clear();
                    navigate("/login");
                  },
                },
              ],
            }}
          >
            <Button type="text" size="small" style={{ height: 36, padding: "0 8px" }}>
              <Space size={8}>
                <Avatar
                  size={28}
                  src={user?.avatar_url ?? undefined}
                  icon={<UserOutlined />}
                />
                <span>{user?.display_name ?? user?.username}</span>
              </Space>
            </Button>
          </Dropdown>
        </div>

        {/* Page content */}
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/agent" element={<AgentPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/candidates" element={<CandidatesPage />} />
              <Route path="/companies" element={<CompaniesPage />} />
              <Route path="/positions" element={<PositionsPage />} />
              <Route path="/matches" element={<MatchesPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/users" element={<UsersPage />} />
              <Route path="/" element={<Navigate to="/agent" replace />} />
              <Route path="*" element={<Navigate to="/agent" replace />} />
            </Routes>
          </Suspense>
        </div>
      </div>

      {/* Right AI panel — hidden on /agent (it has its own full UI) */}
      {!isAgentPage && (
        <div style={{ display: "flex", height: "100%", flexShrink: 0 }}>
          <AiPanel hints={pageConfig.hints} pageLabel={pageConfig.label} />
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      {/* 面试者公开平台（独立于 HR 后台，完全隔离） */}
      <Route path="/interview" element={<InterviewPlatform />} />
      <Route path="/interview/submissions" element={<MySubmissions />} />

      <Route path="/login" element={<LoginPage />} />
      <Route path="/*" element={<ProtectedLayout />} />
    </Routes>
  );
}
