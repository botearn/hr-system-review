import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/auth";
import { apiClient } from "@/api/client";

interface Submission {
  id: number;
  challenge_id: string;
  github_url: string | null;
  status: string;
  selected_at?: string | null;
  submitted_at?: string | null;
  time_spent_seconds?: number | null;
  score?: number | null;
  grade?: string | null;
  candidate_id?: number | null;
}

const CHALLENGE_NAMES: Record<string, string> = {
  "01": "自动化简历筛选器",
  "02": "Webhook 事件转发工具",
  "03": "AI 产品每日报告 Pipeline",
  "04": "AI 竞品分析报告",
};

const GRADE_META: Record<string, { color: string; bg: string; label: string }> = {
  S: { color: "#c084fc", bg: "rgba(192,132,252,0.12)", label: "S 级 · 卓越" },
  A: { color: "#10b981", bg: "rgba(16,185,129,0.12)", label: "A 级 · 优秀" },
  B: { color: "#2baee8", bg: "rgba(43,174,232,0.12)", label: "B 级 · 良好" },
  C: { color: "#f59e0b", bg: "rgba(245,158,11,0.12)", label: "C 级 · 待提升" },
};

const STEPS = ["账号注册", "选好题目", "作品提交", "评估中", "结果出炉"];
const TIMER_KEY = "interview_selected_timer";

function getActiveStep(subs: Submission[], timerRunning: boolean) {
  if (subs.length === 0) return timerRunning ? 2 : 0;
  if (subs[0].status === "challenge_selected") return 2;
  return subs[0].status === "evaluated" ? 4 : 3;
}

function fmtSeconds(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h} 小时 ${m} 分钟` : `${m} 分钟`;
}

function useCountdown() {
  const [remaining, setRemaining] = useState("");
  const [running, setRunning] = useState(false);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const tick = () => {
      const raw = localStorage.getItem(TIMER_KEY);
      if (!raw) { setRunning(false); setRemaining(""); return; }
      setRunning(true);
      const end = parseInt(raw, 10) + 3 * 60 * 60 * 1000;
      const diff = Math.max(0, end - Date.now());
      if (diff === 0) { setExpired(true); setRemaining("0:00:00"); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`);
    };
    const id = setInterval(tick, 1000);
    tick();
    return () => clearInterval(id);
  }, []);

  return { remaining, running, expired };
}

export default function MySubmissions() {
  const navigate = useNavigate();
  const { accessToken, user, clear } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Submission[]>([]);
  const { remaining, running, expired } = useCountdown();

  useEffect(() => {
    if (!accessToken) return;
    apiClient
      .get<Submission[]>("/code-submissions/mine")
      .then((r) => setData(r.data))
      .finally(() => setLoading(false));
  }, [accessToken]);

  if (!accessToken || user?.role_name !== "interviewee") {
    return (
      <div style={{ minHeight: "100vh", background: "#0f0f14", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: '-apple-system,"PingFang SC",sans-serif' }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 18, color: "#a0a0aa", marginBottom: 16 }}>请先以面试者身份登录</div>
          <button
            onClick={() => navigate("/login")}
            style={{ background: "#7b52d3", color: "#fff", border: "none", borderRadius: 10, padding: "11px 28px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
          >
            去登录
          </button>
        </div>
      </div>
    );
  }

  const activeStep = getActiveStep(data, running);
  const sub = data[0] ?? null;
  const evaluated = sub?.status === "evaluated";
  const selectedOnly = sub?.status === "challenge_selected";

  return (
    <div style={{ minHeight: "100vh", background: "#0f0f14", color: "#e6e6ea", fontFamily: '-apple-system,"PingFang SC",sans-serif' }}>

      {/* 顶部导航 */}
      <nav style={{ position: "sticky", top: 0, zIndex: 100, background: "rgba(15,15,20,0.88)", backdropFilter: "blur(12px)", borderBottom: "1px solid #2a2a33", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px" }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>
          面试 <span style={{ color: "#7b52d3" }}>· 挑战</span>
        </div>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <button onClick={() => navigate("/interview")} style={{ background: "none", border: "none", color: "#a0a0aa", fontSize: 13, cursor: "pointer" }}>
            查看题目
          </button>
          <span style={{ color: "#3a3a45" }}>|</span>
          <span style={{ fontSize: 13, color: "#a0a0aa" }}>{user.display_name || user.username}</span>
          <button
            onClick={() => { clear(); navigate("/login"); }}
            style={{ background: "none", border: "1px solid #2a2a33", color: "#6b6b78", borderRadius: 6, padding: "4px 12px", fontSize: 12, cursor: "pointer" }}
          >
            退出
          </button>
        </div>
      </nav>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "44px 24px 80px" }}>

        {/* 问候语 */}
        <div style={{ marginBottom: running || expired ? 20 : 36 }}>
          <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.5px", lineHeight: 1.2 }}>
            你好，{user.display_name || user.username}
          </div>
          <div style={{ marginTop: 8, fontSize: 14, color: "#6b6b78" }}>
            {sub
              ? evaluated
                ? "你的评估已完成，查看结果和得分。"
                : selectedOnly
                ? "题目已确认，完成后回到题目页提交作品。"
                : "作品已收到，面试官正在评估，耐心等待一下。"
              : running
              ? "计时已开始，完成后去提交页提交作品。"
              : "还没有提交记录，现在选一道题开始吧。"}
          </div>
        </div>

        {/* 倒计时横幅 */}
        {(running || expired) && !sub && (
          <div style={{
            marginBottom: 24,
            padding: "14px 20px",
            borderRadius: 12,
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap",
            background: expired ? "rgba(224,64,26,0.08)" : "rgba(16,185,129,0.08)",
            border: `1px solid ${expired ? "rgba(224,64,26,0.25)" : "rgba(16,185,129,0.25)"}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 18 }}>{expired ? "⏰" : "⏱"}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: expired ? "#e0401a" : "#10b981" }}>
                  {expired ? "时间已到" : `剩余时间 · ${remaining}`}
                </div>
                <div style={{ fontSize: 12, color: "#6b6b78", marginTop: 2 }}>
                  {expired ? "请尽快提交你的作品" : "计时中，完成后去提交你的作品"}
                </div>
              </div>
            </div>
            <button
              onClick={() => navigate("/interview")}
              style={{
                background: expired ? "rgba(224,64,26,0.15)" : "rgba(16,185,129,0.15)",
                border: `1px solid ${expired ? "rgba(224,64,26,0.3)" : "rgba(16,185,129,0.3)"}`,
                color: expired ? "#e0401a" : "#10b981",
                borderRadius: 8, padding: "6px 16px", fontSize: 13, cursor: "pointer", fontWeight: 600,
              }}
            >
              去提交
            </button>
          </div>
        )}

        {/* 进度步骤条 */}
        <div style={{ background: "#16161e", border: "1px solid #2a2a33", borderRadius: 16, padding: "28px 32px", marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1.2px", textTransform: "uppercase", color: "#6b6b78", marginBottom: 24 }}>
            流程进度
          </div>
          <div style={{ display: "flex", alignItems: "flex-start" }}>
            {STEPS.map((label, i) => {
              const done = i < activeStep;
              const active = i === activeStep;
              return (
                <div key={label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
                  {/* 连接线 */}
                  {i > 0 && (
                    <div style={{
                      position: "absolute", top: 13, left: "-50%",
                      width: "100%", height: 2,
                      background: done ? "#7b52d3" : "#2a2a33",
                      transition: "background 0.4s",
                    }} />
                  )}
                  {/* 节点圆 */}
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%", position: "relative", zIndex: 1,
                    background: done ? "#7b52d3" : active ? "rgba(123,82,211,0.18)" : "#1a1a22",
                    border: `2px solid ${done || active ? "#7b52d3" : "#2a2a33"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 700,
                    color: done ? "#fff" : active ? "#7b52d3" : "#3a3a45",
                    transition: "all 0.3s",
                    boxShadow: active ? "0 0 0 4px rgba(123,82,211,0.12)" : "none",
                  }}>
                    {done ? "✓" : i + 1}
                  </div>
                  <div style={{
                    marginTop: 10, fontSize: 11, textAlign: "center", lineHeight: 1.4,
                    color: done ? "#a0a0aa" : active ? "#e6e6ea" : "#3a3a45",
                    fontWeight: active ? 600 : 400,
                  }}>
                    {label}
                    {active && (
                      <div style={{ marginTop: 3, width: 4, height: 4, borderRadius: "50%", background: "#7b52d3", margin: "3px auto 0" }} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 加载中 */}
        {loading && (
          <div style={{ textAlign: "center", padding: 60, color: "#3a3a45", fontSize: 14 }}>加载中…</div>
        )}

        {/* 空状态 */}
        {!loading && !sub && (
          <div style={{ background: "#16161e", border: "1px dashed #2a2a33", borderRadius: 16, padding: "52px 32px", textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>{running || expired ? "⏳" : "🚀"}</div>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
              {running || expired ? "题目进行中" : "还没有提交记录"}
            </div>
            <div style={{ fontSize: 14, color: "#6b6b78", marginBottom: 28, lineHeight: 1.7 }}>
              {running || expired ? (
                <>完成作品后，回到题目页提交你的 GitHub 仓库链接。<br />我们会综合作品质量与 AI 使用记录进行评估。</>
              ) : (
                <>选一道你最能发挥的题，3 小时内完成并提交。<br />我们会综合作品质量与 AI 使用记录进行评估。</>
              )}
            </div>
            <button
              onClick={() => navigate("/interview")}
              style={{ background: "#7b52d3", color: "#fff", border: "none", borderRadius: 10, padding: "13px 36px", fontSize: 14, fontWeight: 600, cursor: "pointer", letterSpacing: "0.2px" }}
            >
              {running || expired ? "去提交" : "去选题"}
            </button>
          </div>
        )}

        {/* 提交详情卡 */}
        {!loading && sub && (
          <div style={{
            background: "#16161e",
            border: `1px solid ${evaluated ? "rgba(16,185,129,0.35)" : "#2a2a33"}`,
            borderRadius: 16, padding: 28, position: "relative", overflow: "hidden",
          }}>
            {/* 顶部装饰线 */}
            <div style={{
              position: "absolute", top: 0, left: 0, right: 0, height: 3,
              background: evaluated
                ? "linear-gradient(90deg,#10b981,#2baee8)"
                : selectedOnly
                ? "linear-gradient(90deg,#7b52d3,#f59e0b)"
                : "linear-gradient(90deg,#7b52d3,#2baee8)",
            }} />

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24, flexWrap: "wrap" }}>
              {/* 左侧信息 */}
              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1.2px", textTransform: "uppercase", color: "#6b6b78", marginBottom: 6 }}>
                  题目 {sub.challenge_id}
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.3px", marginBottom: 16 }}>
                  {CHALLENGE_NAMES[sub.challenge_id] ?? `挑战 ${sub.challenge_id}`}
                </div>

                {/* GitHub 链接 */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: "#6b6b78", flexShrink: 0 }}>仓库</span>
                  {sub.github_url ? (
                    <a
                      href={sub.github_url} target="_blank" rel="noreferrer"
                      style={{ color: "#7b52d3", fontSize: 13, wordBreak: "break-all", textDecoration: "none" }}
                    >
                      {sub.github_url}
                    </a>
                  ) : (
                    <span style={{ color: "#6b6b78", fontSize: 13 }}>完成作品后回到题目页提交链接</span>
                  )}
                </div>

                {/* 元信息行 */}
                <div style={{ display: "flex", gap: 20, marginTop: 16, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 12 }}>
                    <span style={{ color: "#6b6b78" }}>{sub.submitted_at ? "提交时间　" : "选题时间　"}</span>
                    <span style={{ color: "#a0a0aa" }}>
                      {new Date(sub.submitted_at ?? sub.selected_at ?? "").toLocaleString("zh-CN")}
                    </span>
                  </div>
                  {sub.time_spent_seconds != null && (
                    <div style={{ fontSize: 12 }}>
                      <span style={{ color: "#6b6b78" }}>作答用时　</span>
                      <span style={{ color: "#a0a0aa" }}>{fmtSeconds(sub.time_spent_seconds)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 右侧状态 + 得分 */}
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <span style={{
                  display: "inline-block", padding: "5px 14px", borderRadius: 999,
                  fontSize: 12, fontWeight: 600,
                  background: evaluated ? "rgba(16,185,129,0.12)" : selectedOnly ? "rgba(123,82,211,0.12)" : "rgba(245,158,11,0.10)",
                  color: evaluated ? "#10b981" : selectedOnly ? "#c084fc" : "#f59e0b",
                  border: `1px solid ${evaluated ? "rgba(16,185,129,0.3)" : selectedOnly ? "rgba(123,82,211,0.3)" : "rgba(245,158,11,0.25)"}`,
                }}>
                  {evaluated ? "已评估" : selectedOnly ? "题目进行中" : "评估中…"}
                </span>

                {sub.score != null && (
                  <div style={{ marginTop: 20 }}>
                    <div style={{ fontSize: 11, color: "#6b6b78", marginBottom: 4 }}>综合得分</div>
                    <div style={{ fontSize: 48, fontWeight: 800, lineHeight: 1, color: "#e6e6ea", letterSpacing: "-2px" }}>
                      {Math.round(sub.score)}
                    </div>
                    {sub.grade && GRADE_META[sub.grade] && (
                      <div style={{
                        display: "inline-block", marginTop: 8,
                        padding: "4px 16px", borderRadius: 8,
                        background: GRADE_META[sub.grade].bg,
                        color: GRADE_META[sub.grade].color,
                        fontSize: 13, fontWeight: 700,
                      }}>
                        {GRADE_META[sub.grade].label}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* 等待提示 */}
            {selectedOnly ? (
              <div style={{
                marginTop: 24, padding: "14px 18px",
                background: "rgba(123,82,211,0.07)", border: "1px solid rgba(123,82,211,0.18)",
                borderRadius: 10, fontSize: 13, color: "#a0a0aa", lineHeight: 1.7,
              }}>
                题目已记录。完成作品后，回到题目页提交 GitHub 链接和简历，系统会把你的信息同步给面试官。
              </div>
            ) : !evaluated && (
              <div style={{
                marginTop: 24, padding: "14px 18px",
                background: "rgba(123,82,211,0.07)", border: "1px solid rgba(123,82,211,0.18)",
                borderRadius: 10, fontSize: 13, color: "#a0a0aa", lineHeight: 1.7,
              }}>
                已收到你的作品，面试官正在仔细评估。通常在 <strong style={{ color: "#e6e6ea" }}>1–2 个工作日</strong>内完成，结果将通过邮件通知你，请留意收件箱。
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
