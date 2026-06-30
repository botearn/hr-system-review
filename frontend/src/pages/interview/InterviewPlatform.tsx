import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/auth";
import { apiClient } from "@/api/client";
import { submissionsApi } from "@/api/submissions";

const CHALLENGES = [
  {
    num: 1, id: "01", title: "自动化简历筛选器", badge: "AI 工具类", badgeClass: "badge-mid",
    desc: "做一个真正好用的简历自动筛选工具。不是只让 AI 跑一遍，而是让任何人都能输入条件让 AI 帮你分析真实项目经历、评价和潜在匹配度。",
    tasks: [
      "用任何你熟悉的语言实现（Python / Node / Go 均可）。",
      "支持上传 PDF / 文本简历，或直接粘贴文本。",
      "用 LLM 提取关键信息（技能、项目经历、年限、教育等）。",
      "根据用户输入的筛选条件（如：3年以上 Python + 有 LLM 项目），给出通过 / 不通过 + 打分 + 理由。",
      "提供一个简洁漂亮的前端界面。",
    ],
    scores: ["实用性", "工程化设计", "AI 能力", "AI 协作记录"],
    bonus: "支持批量处理 + 导出结果；支持自定义筛选模板。",
  },
  {
    num: 2, id: "02", title: "Webhook 事件转发工具", badge: "系统构建", badgeClass: "badge-dev",
    desc: "做一个通用的 Webhook 事件转发 / 路由工具。支持把 GitHub、飞书、Stripe 等来源的事件安全、可靠地转发给多个下游系统。",
    tasks: [
      "接收任意来源的 Webhook 请求。",
      "支持签名验证（常见 HMAC）。",
      "支持事件过滤、转换、延迟重试。",
      "提供简单的管理界面查看日志和重试情况。",
      "部署后用真实事件测试通过。",
    ],
    scores: ["工程化", "可靠性", "可观测性", "AI 辅助编码"],
    bonus: "支持可视化配置规则；内置常用集成（飞书、Slack、邮件）。",
  },
  {
    num: 3, id: "03", title: "AI 产品每日报告 Pipeline", badge: "自动化", badgeClass: "badge-auto",
    desc: "构建一个可自动运行的日报 pipeline，每天定时抓取产品相关信息（竞品动态、用户反馈、关键指标），用 AI 整理成结构化日报。",
    tasks: [
      "数据源至少包含 2 个不同类型（GitHub、飞书群、官网、公开 API 等）。",
      "定时任务 + 失败重试机制。",
      "用 LLM 把原始信息提炼成要点 + 洞察。",
      "输出格式美观（支持 Markdown / 飞书卡片 / 邮件）。",
      "有基本的错误监控和日志。",
    ],
    scores: ["自动化", "数据流", "AI 洞察", "独立决策"],
    bonus: "支持多项目配置；有前端查看历史报告。",
  },
  {
    num: 4, id: "04", title: "AI 竞品分析报告", badge: "产品类", badgeClass: "badge-product",
    desc: "选择 3-5 个 AI 相关产品/工具，做一次有深度的竞品分析。重点不是罗列功能，而是真正分析策略、用户价值、商业模式和差异点。",
    tasks: [
      "至少覆盖 3 个真实产品。",
      "从用户价值、核心能力、商业化路径、团队背景等维度分析。",
      "给出清晰的结论：谁更有可能赢、为什么、你自己的产品该怎么差异化。",
      "输出一份可直接阅读的报告（Notion / PDF / 网页均可）。",
    ],
    scores: ["产品思维", "分析能力", "商业洞察", "战略判断"],
    bonus: "包含真实用户访谈或数据支撑；提出可执行的差异化打法。",
  },
];

const TIMER_KEY = "interview_selected_timer";
const CHALLENGE_KEY = "interview_selected_challenge"; // 持久化已选题目 id

export default function InterviewPlatform() {
  const navigate = useNavigate();
  const { accessToken, user, clear } = useAuthStore();
  const isInterviewee = user?.role_name === "interviewee";

  // 选题状态
  const [pendingNum, setPendingNum] = useState<number | null>(null);
  const [pendingId, setPendingId] = useState("");
  const [pendingTitle, setPendingTitle] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);

  // 已确认的选题（驱动提交表单），从 localStorage 恢复
  const savedChallenge = localStorage.getItem(CHALLENGE_KEY) ?? "";
  const savedTitle = CHALLENGES.find((c) => c.id === savedChallenge)?.title ?? "";
  const [confirmedId, setConfirmedId] = useState(savedChallenge);
  const [confirmedTitle, setConfirmedTitle] = useState(savedTitle);

  // 计时器
  const [timerRunning, setTimerRunning] = useState(false);
  const [remaining, setRemaining] = useState("3:00:00");
  const [timerExpired, setTimerExpired] = useState(false);

  // 提交表单
  const [github, setGithub] = useState("");
  const [note, setNote] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);

  // 登录后检查是否已有提交/选题
  useEffect(() => {
    if (!accessToken || !isInterviewee) return;
    apiClient.get("/code-submissions/mine").then((r: any) => {
      const records = r.data ?? [];
      const latest = records[0];
      if (records.some((x: any) => ["pending_evaluation", "evaluated"].includes(x.status))) {
        setAlreadySubmitted(true);
        return;
      }
      if (latest?.status === "challenge_selected") {
        const title = CHALLENGES.find((c) => c.id === latest.challenge_id)?.title ?? "";
        setConfirmedId(latest.challenge_id);
        setConfirmedTitle(title);
        localStorage.setItem(CHALLENGE_KEY, latest.challenge_id);
        if (latest.selected_at && !localStorage.getItem(TIMER_KEY)) {
          localStorage.setItem(TIMER_KEY, String(new Date(latest.selected_at).getTime()));
        }
        setTimerRunning(true);
      }
    }).catch(() => {});
  }, [accessToken, isInterviewee]);

  // 倒计时
  useEffect(() => {
    const raw = localStorage.getItem(TIMER_KEY);
    if (raw) setTimerRunning(true);

    const tick = () => {
      const r = localStorage.getItem(TIMER_KEY);
      if (!r) { setTimerRunning(false); setRemaining("3:00:00"); return; }
      const end = parseInt(r, 10) + 3 * 60 * 60 * 1000;
      const diff = Math.max(0, end - Date.now());
      if (diff === 0) { setTimerExpired(true); setRemaining("0:00:00"); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`);
    };
    const id = setInterval(tick, 1000);
    tick();
    return () => clearInterval(id);
  }, []);

  function openModal(num: number, id: string, title: string) {
    setPendingNum(num);
    setPendingId(id);
    setPendingTitle(title);
    setModalOpen(true);
  }

  async function confirmSelect() {
    if (!accessToken || !isInterviewee) {
      navigate("/login");
      return;
    }
    setSelecting(true);
    try {
      const res = await submissionsApi.select(pendingId);
      setModalOpen(false);
      setConfirmedId(res.data.challenge_id);
      setConfirmedTitle(CHALLENGES.find((c) => c.id === res.data.challenge_id)?.title ?? pendingTitle);
      localStorage.setItem(CHALLENGE_KEY, res.data.challenge_id);
      const selectedAt = res.data.selected_at ? new Date(res.data.selected_at).getTime() : Date.now();
      if (!localStorage.getItem(TIMER_KEY)) {
        localStorage.setItem(TIMER_KEY, String(selectedAt));
        setTimerRunning(true);
      }
      setTimeout(() => {
        document.getElementById("submitSection")?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    } catch (err: any) {
      alert(err?.response?.data?.detail ?? "选题失败，请重试");
    } finally {
      setSelecting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken || !isInterviewee) {
      navigate("/login");
      return;
    }
    if (!confirmedId) {
      alert("请先在上方选择一道题");
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("challenge_id", confirmedId);
      fd.append("github_url", github);
      if (note) fd.append("notes", note);
      const timerStart = localStorage.getItem(TIMER_KEY);
      if (timerStart) {
        fd.append("time_spent_seconds", String(Math.max(0, Math.round((Date.now() - Number(timerStart)) / 1000))));
      }
      if (user?.display_name || user?.username) fd.append("name", user.display_name || user.username || "");
      if (user?.email) fd.append("email", user.email);
      if (resumeFile) fd.append("resume", resumeFile);
      await apiClient.post("/code-submissions", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setSubmitted(true);
      localStorage.removeItem(TIMER_KEY);
      localStorage.removeItem(CHALLENGE_KEY);
    } catch (err: any) {
      const msg = err?.response?.data?.detail ?? err?.message ?? "提交失败，请重试";
      alert(`提交失败：${msg}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <style>{`
        :root { --bg:#0f0f14; --surface:#16161e; --surface2:#1a1a22; --text:#e6e6ea; --text-dim:#a0a0aa; --text-sub:#6b6b78; --border:#2a2a33; --purple:#7b52d3; --blue:#2baee8; --green:#10b981; --orange:#f59e0b; --pink:#e0401a; }
        body { background:var(--bg); color:var(--text); font-family:-apple-system,"PingFang SC","SF Pro Text",sans-serif; line-height:1.6; }
        .iv-nav { position:sticky; top:0; z-index:100; background:rgba(15,15,20,0.88); backdrop-filter:blur(12px); border-bottom:1px solid var(--border); padding:0 24px; height:56px; display:flex; align-items:center; justify-content:space-between; }
        .iv-nav-brand { font-size:15px; font-weight:600; letter-spacing:-0.2px; }
        .iv-nav-brand span { color:var(--purple); }
        .iv-hero { padding:64px 24px 40px; text-align:center; max-width:720px; margin:0 auto; }
        .iv-eyebrow { font-size:12px; font-weight:600; letter-spacing:1.5px; text-transform:uppercase; color:var(--purple); margin-bottom:16px; }
        .iv-title { font-size:36px; font-weight:700; letter-spacing:-1px; line-height:1.2; margin-bottom:16px; }
        .iv-desc { font-size:16px; color:var(--text-dim); line-height:1.7; max-width:520px; margin:0 auto 24px; }
        .iv-rule { display:inline-flex; align-items:center; gap:8px; background:var(--surface2); border:1px solid var(--border); border-radius:100px; padding:6px 16px; font-size:13px; color:var(--text-dim); }
        .iv-rule .dot { width:6px; height:6px; border-radius:50%; background:var(--green); flex-shrink:0; }
        .iv-timer { margin-top:12px; display:inline-flex; align-items:center; gap:8px; padding:8px 20px; border-radius:100px; font-size:14px; font-weight:600; }
        .iv-timer.idle { color:var(--text-sub); }
        .iv-timer.running { background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.25); color:var(--green); }
        .iv-timer.expired { background:rgba(224,64,26,0.1); border:1px solid rgba(224,64,26,0.25); color:var(--pink); }
        .iv-grid { max-width:960px; margin:0 auto; padding:8px 24px 60px; display:grid; grid-template-columns:repeat(2,1fr); gap:20px; }
        @media(max-width:640px){ .iv-grid{grid-template-columns:1fr;} .iv-title{font-size:26px;} }
        .iv-card { background:var(--surface); border:1px solid var(--border); border-radius:18px; padding:28px 28px 24px; display:flex; flex-direction:column; gap:16px; cursor:pointer; transition:all 0.25s; position:relative; overflow:hidden; }
        .iv-card::before { content:''; position:absolute; top:0; left:0; right:0; height:3px; border-radius:18px 18px 0 0; opacity:0; transition:opacity 0.25s; }
        .iv-card:hover { border-color:#3a3a45; box-shadow:0 10px 30px rgba(0,0,0,0.35); transform:translateY(-2px); }
        .iv-card:hover::before, .iv-card.selected::before { opacity:1; }
        .iv-card.selected { border-color:var(--purple); box-shadow:0 0 0 3px rgba(123,82,211,0.15); }
        .c1::before{background:linear-gradient(90deg,var(--blue),var(--purple));} .c2::before{background:linear-gradient(90deg,var(--purple),var(--pink));} .c3::before{background:linear-gradient(90deg,var(--green),var(--blue));} .c4::before{background:linear-gradient(90deg,var(--orange),var(--pink));}
        .iv-card-num { font-size:11px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:var(--text-sub); }
        .iv-card-badge { font-size:11px; font-weight:600; padding:3px 10px; border-radius:100px; white-space:nowrap; }
        .badge-mid{background:rgba(123,82,211,0.18);color:var(--purple);} .badge-dev{background:rgba(43,174,232,0.18);color:var(--blue);} .badge-auto{background:rgba(16,185,129,0.18);color:var(--green);} .badge-product{background:rgba(245,158,11,0.18);color:var(--orange);}
        .iv-card-title { font-size:20px; font-weight:700; letter-spacing:-0.4px; line-height:1.3; }
        .iv-card-desc { font-size:14px; color:var(--text-dim); line-height:1.65; }
        .iv-task-block { background:var(--surface2); border:1px solid var(--border); border-radius:12px; padding:16px 18px; }
        .iv-task-label { font-size:11px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:var(--text-sub); margin-bottom:10px; }
        .iv-task-item { display:flex; gap:10px; font-size:13.5px; color:var(--text-dim); line-height:1.55; margin-bottom:8px; }
        .iv-task-item:last-child{margin-bottom:0;} .iv-task-item .n{color:var(--text-sub);font-weight:600;min-width:18px;flex-shrink:0;}
        .iv-tags { display:flex; flex-wrap:wrap; gap:6px; }
        .iv-tag { font-size:12px; padding:4px 10px; border-radius:6px; border:1px solid var(--border); background:var(--surface2); color:var(--text-dim); }
        .iv-bonus { font-size:13px; color:var(--text-sub); padding-top:6px; border-top:1px solid var(--border); }
        .iv-bonus strong{color:var(--orange);}
        .iv-select-btn { margin-top:auto; width:100%; padding:12px; border-radius:10px; border:none; font-size:14px; font-weight:600; cursor:pointer; transition:all 0.2s; background:var(--blue); color:#fff; }
        .iv-select-btn:hover{opacity:0.88;transform:scale(0.99);}
        .iv-select-btn.chosen{background:var(--purple);}
        .iv-submit-wrap { max-width:720px; margin:0 auto 80px; padding:0 24px; }
        .iv-submit-box { background:var(--surface); border:2px solid var(--purple); border-radius:20px; padding:40px; box-shadow:0 0 0 6px rgba(123,82,211,0.07); position:relative; overflow:hidden; }
        .iv-submit-box::before { content:''; position:absolute; top:0; left:0; right:0; height:4px; background:linear-gradient(90deg,var(--blue),var(--purple),var(--pink)); }
        .iv-submit-hint { background:var(--surface2); border:1px dashed var(--border); border-radius:12px; padding:20px; text-align:center; color:var(--text-sub); font-size:14px; }
        .iv-challenge-pill { display:inline-flex; align-items:center; gap:10px; background:rgba(123,82,211,0.12); border:1px solid rgba(123,82,211,0.3); border-radius:10px; padding:10px 16px; margin-bottom:24px; }
        .iv-form { display:flex; flex-direction:column; gap:12px; }
        .iv-row { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        @media(max-width:560px){.iv-row{grid-template-columns:1fr;}.iv-submit-box{padding:28px 20px;}}
        .iv-input,.iv-select,.iv-textarea { width:100%; background:var(--surface2); border:1px solid var(--border); border-radius:10px; padding:12px 14px; color:var(--text); font-size:14px; font-family:inherit; outline:none; transition:border-color .2s,background .2s; box-sizing:border-box; }
        .iv-input::placeholder,.iv-textarea::placeholder{color:var(--text-sub);}
        .iv-input:focus,.iv-select:focus,.iv-textarea:focus{border-color:var(--purple);background:var(--surface);}
        .iv-select option{background:var(--surface2);}
        .iv-textarea{resize:vertical;min-height:72px;}
        .iv-file-label { display:flex; align-items:center; gap:10px; background:var(--surface2); border:1px solid var(--border); border-radius:10px; padding:11px 14px; cursor:pointer; font-size:13px; color:var(--text-dim); transition:border-color .2s; }
        .iv-file-label:hover{border-color:var(--purple);}
        .iv-submit-btn { padding:14px; border-radius:10px; border:none; background:var(--purple); color:#fff; font-size:15px; font-weight:700; cursor:pointer; transition:opacity .2s,transform .1s; }
        .iv-submit-btn:hover{opacity:0.88;} .iv-submit-btn:active{transform:scale(0.99);} .iv-submit-btn:disabled{opacity:0.45;cursor:not-allowed;}
        .iv-success { text-align:center; padding:32px 20px; }
        .iv-success-icon { font-size:48px; margin-bottom:12px; }
        .iv-success-title { font-size:22px; font-weight:700; margin-bottom:8px; }
        .iv-success-desc { font-size:14px; color:var(--text-dim); line-height:1.7; margin-bottom:20px; }
        .iv-modal-bg { position:fixed; inset:0; z-index:200; background:rgba(0,0,0,0.72); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; padding:24px; }
        .iv-modal { background:var(--surface); border:1px solid var(--border); border-radius:20px; padding:36px; max-width:520px; width:100%; box-shadow:0 10px 40px rgba(0,0,0,0.4); text-align:center; }
        .iv-modal-icon{font-size:48px;margin-bottom:16px;} .iv-modal-title{font-size:22px;font-weight:700;margin-bottom:10px;} .iv-modal-sub{font-size:15px;color:var(--text-dim);line-height:1.65;margin-bottom:24px;}
        .iv-modal-pill{background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:14px 18px;font-size:16px;font-weight:600;margin-bottom:24px;}
        .iv-modal-warn{background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:10px;padding:12px 16px;font-size:13px;color:#d4a017;margin-bottom:24px;line-height:1.6;}
        .iv-modal-actions{display:flex;gap:10px;}
        .iv-modal-cancel{flex:1;padding:12px;border-radius:10px;border:1px solid var(--border);background:var(--surface2);color:var(--text-dim);font-size:14px;font-weight:600;cursor:pointer;}
        .iv-modal-confirm{flex:2;padding:12px;border-radius:10px;border:none;background:var(--purple);color:#fff;font-size:14px;font-weight:600;cursor:pointer;}
        .iv-modal-confirm:hover,.iv-modal-cancel:hover{opacity:0.88;}
        .iv-already-banner { max-width:960px; margin:0 auto 0; padding:0 24px 20px; }
        .iv-already-inner { background:rgba(16,185,129,0.08); border:1px solid rgba(16,185,129,0.25); border-radius:14px; padding:16px 20px; display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; }
      `}</style>

      {/* 导航栏 */}
      <nav className="iv-nav">
        <div className="iv-nav-brand">面试 <span>· 挑战</span></div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {accessToken && isInterviewee ? (
            <>
              <button
                onClick={() => navigate("/interview/submissions")}
                style={{ background: "rgba(123,82,211,0.15)", border: "1px solid rgba(123,82,211,0.35)", color: "#c084fc", borderRadius: 8, padding: "6px 14px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}
              >
                我的进度
              </button>
              <span style={{ fontSize: 13, color: "#a0a0aa" }}>
                {user?.display_name || user?.username}
                <span onClick={() => { clear(); navigate("/login"); }} style={{ color: "#7b52d3", cursor: "pointer", marginLeft: 8 }}>退出</span>
              </span>
            </>
          ) : (
            <button
              onClick={() => navigate("/login")}
              style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text-dim)", borderRadius: 8, padding: "6px 14px", fontSize: 13, cursor: "pointer" }}
            >
              登录 / 注册
            </button>
          )}
        </div>
      </nav>

      {/* Hero */}
      <div className="iv-hero">
        <div className="iv-eyebrow">面试挑战</div>
        <h1 className="iv-title">选择一道你最能发挥的题</h1>
        <p className="iv-desc">
          没有标准答案，我们相信你会用 AI Agent 解决真实问题。<br />
          3 小时内提交作品 + AI 使用记录，我们综合评估实际产出与过程。
        </p>
        <div className="iv-rule">
          <span className="dot" />
          限时 3 小时 · 作品 + AI 协作记录
        </div>
        <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
          <div className={`iv-timer ${timerExpired ? "expired" : timerRunning ? "running" : "idle"}`}>
            {timerExpired
              ? "⏰ 时间已到，请尽快提交"
              : timerRunning
              ? <>⏱ 计时中 · 剩余 {remaining}</>
              : "选题后自动开始计时"}
          </div>
          {timerExpired && (
            <button
              onClick={() => {
                localStorage.removeItem(TIMER_KEY);
                localStorage.removeItem(CHALLENGE_KEY);
                window.location.reload();
              }}
              style={{ background: "none", border: "1px solid #3a3a45", color: "#6b6b78", borderRadius: 6, padding: "4px 12px", fontSize: 12, cursor: "pointer" }}
            >
              重置计时
            </button>
          )}
        </div>
      </div>

      {/* 已提交提示横幅 */}
      {alreadySubmitted && (
        <div className="iv-already-banner">
          <div className="iv-already-inner">
            <span style={{ fontSize: 14, color: "#10b981", fontWeight: 500 }}>
              ✅ 你已提交作品，面试官正在评估中
            </span>
            <button
              onClick={() => navigate("/interview/submissions")}
              style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)", color: "#10b981", borderRadius: 8, padding: "6px 16px", fontSize: 13, cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}
            >
              查看进度
            </button>
          </div>
        </div>
      )}

      {/* 题目卡片 */}
      <div className="iv-grid">
        {CHALLENGES.map((ch) => (
          <div
            key={ch.num}
            className={`iv-card c${ch.num}${confirmedId === ch.id ? " selected" : ""}`}
            onClick={() => openModal(ch.num, ch.id, ch.title)}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <span className="iv-card-num">0{ch.num}</span>
              <span className={`iv-card-badge ${ch.badgeClass}`}>{ch.badge}</span>
            </div>
            <div className="iv-card-title">{ch.title}</div>
            <div className="iv-card-desc">{ch.desc}</div>
            <div className="iv-task-block">
              <div className="iv-task-label">交付要求</div>
              {ch.tasks.map((t, i) => (
                <div key={i} className="iv-task-item">
                  <span className="n">{i + 1}.</span><span>{t}</span>
                </div>
              ))}
            </div>
            <div className="iv-tags">
              {ch.scores.map((s, i) => <span key={i} className="iv-tag">{s}</span>)}
            </div>
            <div className="iv-bonus"><strong>加分项：</strong>{ch.bonus}</div>
            <button
              className={`iv-select-btn${confirmedId === ch.id ? " chosen" : ""}`}
              onClick={(e) => { e.stopPropagation(); openModal(ch.num, ch.id, ch.title); }}
            >
              {confirmedId === ch.id ? "✓ 已选择这道题" : "选择这道题"}
            </button>
          </div>
        ))}
      </div>

      {/* 提交区 */}
      <div id="submitSection" className="iv-submit-wrap">
        <div className="iv-submit-box">
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--purple)", marginBottom: 8 }}>作品提交</div>
          <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.5px", marginBottom: 6 }}>完成后在这里提交</div>
          <div style={{ fontSize: 14, color: "var(--text-dim)", marginBottom: 28, lineHeight: 1.65 }}>
            新建一个 GitHub public repo，完成后把链接填到下方。
            简历可选择上传，提交后系统会自动为你建立候选人档案。
          </div>

          {submitted || alreadySubmitted ? (
            <div className="iv-success">
              <div className="iv-success-icon">🎉</div>
              <div className="iv-success-title">已收到！</div>
              <div className="iv-success-desc">
                面试官将在 1–2 个工作日内完成评估。<br />
                结果会通过邮件通知你，请留意收件箱。
              </div>
              <button
                onClick={() => navigate("/interview/submissions")}
                style={{ background: "var(--purple)", color: "#fff", border: "none", borderRadius: 10, padding: "12px 32px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
              >
                查看我的进度
              </button>
            </div>
          ) : !confirmedId ? (
            <div className="iv-submit-hint">
              ↑ 先在上方选一道题，计时开始后再回来提交
            </div>
          ) : (
            <form className="iv-form" onSubmit={handleSubmit}>
              {/* 已选题目展示 */}
              <div className="iv-challenge-pill">
                <span style={{ fontSize: 12, color: "var(--text-sub)", fontWeight: 600 }}>已选</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
                  {confirmedId} · {confirmedTitle}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmedId("");
                    setConfirmedTitle("");
                    localStorage.removeItem(CHALLENGE_KEY);
                  }}
                  style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--text-sub)", cursor: "pointer", fontSize: 12 }}
                >
                  重选
                </button>
              </div>

              <input
                className="iv-input"
                type="url"
                placeholder="https://github.com/your-username/your-repo"
                value={github}
                onChange={(e) => setGithub(e.target.value)}
                required
              />
              <textarea
                className="iv-textarea"
                placeholder="简单说说你的实现思路（选填）"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />

              {/* 简历上传 */}
              <label className="iv-file-label">
                <span style={{ color: "var(--text-sub)" }}>📎</span>
                <span>{resumeFile ? resumeFile.name : "上传简历（PDF / Word，选填）"}</span>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx"
                  style={{ display: "none" }}
                  onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
                />
                {resumeFile && (
                  <span
                    onClick={(e) => { e.preventDefault(); setResumeFile(null); }}
                    style={{ marginLeft: "auto", color: "var(--text-sub)", cursor: "pointer" }}
                  >
                    ✕
                  </span>
                )}
              </label>

              {/* 未登录提示 */}
              {(!accessToken || !isInterviewee) && (
                <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#d4a017", lineHeight: 1.6 }}>
                  提交前需要登录面试者账号。
                  <span onClick={() => navigate("/login")} style={{ color: "var(--purple)", cursor: "pointer", marginLeft: 6, fontWeight: 600 }}>去登录</span>
                </div>
              )}

              <button type="submit" disabled={submitting} className="iv-submit-btn">
                {submitting ? "提交中…" : "提交作品"}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* 选题确认弹窗 */}
      {modalOpen && (
        <div className="iv-modal-bg" onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}>
          <div className="iv-modal">
            <div className="iv-modal-icon">🎯</div>
            <div className="iv-modal-title">确认选题</div>
            <div className="iv-modal-sub">
              确认后计时开始（3 小时）。全程可以自由使用任何 AI 工具。<br />
              完成后把 GitHub 仓库链接填到下方提交区。
            </div>
            <div className="iv-modal-pill">0{pendingNum} · {pendingTitle}</div>
            <div className="iv-modal-warn">
              选题一旦确认计时立即开始，请确保你已准备好。
            </div>
            <div className="iv-modal-actions">
              <button className="iv-modal-cancel" onClick={() => setModalOpen(false)}>再看看</button>
              <button className="iv-modal-confirm" onClick={confirmSelect} disabled={selecting}>
                {selecting ? "记录中…" : "确认，开始计时"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
