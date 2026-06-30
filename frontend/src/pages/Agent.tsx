import { useEffect, useRef, useState } from "react";
import { Button, Input, Spin, Tooltip, Typography, message as antMessage } from "antd";
import {
  ApartmentOutlined,
  ArrowUpOutlined,
  BankOutlined,
  BarChartOutlined,
  HistoryOutlined,
  LoadingOutlined,
  PaperClipOutlined,
  RobotOutlined,
  StarOutlined,
  TeamOutlined,
  ToolOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { agentApi, type ChatMessage, type ToolCall } from "@/api/agent";
import { useChatStore, type ChatMsg } from "@/store/chat";
import { usePageContextStore } from "@/store/pageContext";
import ChatHistoryDrawer from "@/components/ChatHistoryDrawer";
import { renderAssistantMarkdown } from "@/lib/agentMarkdown";

const { Paragraph } = Typography;

// ─── Starter prompts ───────────────────────────────────────────────────────────

const STARTER_PROMPTS = [
  "我现在有多少候选人在推进中？",
  "帮我找5个AI方向的候选人",
  "最近7天新增了哪些跟进记录？",
  "现在有哪些岗位还开放？",
  "帮我汇总一下招聘漏斗数据",
  "给我推荐适合产品岗位的候选人",
];

const TOOL_LABELS: Record<string, string> = {
  search_candidates: "搜索候选人",
  get_candidate: "获取候选人详情",
  search_positions: "搜索岗位",
  query_stats: "查询统计数据",
  list_follow_ups: "查询跟进记录",
  create_follow_up: "创建跟进记录",
  recommend_candidates: "推荐候选人",
};

// ─── Tool call step display ────────────────────────────────────────────────────

function ToolCallStep({ tc }: { tc: ToolCall }) {
  const [expanded, setExpanded] = useState(false);
  const label = TOOL_LABELS[tc.tool] ?? tc.tool;
  const resultStr = JSON.stringify(tc.result, null, 2);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 6,
        marginBottom: 4,
        fontSize: 12,
        color: "#8c8ca8",
      }}
    >
      <ToolOutlined style={{ marginTop: 2, color: "#b37feb" }} />
      <span>
        <span style={{ color: "#722ed1", fontWeight: 500 }}>{label}</span>
        {" · "}
        <button
          style={{
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            color: "#8c8ca8",
            fontSize: 12,
            textDecoration: "underline",
          }}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "收起" : "查看结果"}
        </button>
      </span>
      {expanded && (
        <pre
          style={{
            margin: "4px 0 0 0",
            fontSize: 11,
            background: "#f8f7ff",
            borderRadius: 6,
            padding: "6px 10px",
            maxHeight: 200,
            overflowY: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            color: "#52527a",
          }}
        >
          {resultStr}
        </pre>
      )}
    </div>
  );
}

// ─── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: ChatMsg }) {
  const isUser = msg.role === "user";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: isUser ? "row-reverse" : "row",
        gap: 10,
        marginBottom: 20,
        alignItems: "flex-start",
      }}
    >
      {/* Avatar */}
      <div
        style={{
          flexShrink: 0,
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: isUser
            ? "linear-gradient(135deg,#1a1a4e,#5b7cff)"
            : "linear-gradient(135deg,#722ed1,#fa8c16)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 14,
          color: "#fff",
        }}
      >
        {isUser ? <UserOutlined /> : <RobotOutlined />}
      </div>

      {/* Content */}
      <div style={{ maxWidth: "76%", minWidth: 0 }}>
        {/* Tool calls (assistant only) */}
        {!isUser && msg.toolCalls && msg.toolCalls.length > 0 && (
          <div
            style={{
              background: "#faf8ff",
              border: "1px solid #ede9ff",
              borderRadius: 10,
              padding: "8px 12px",
              marginBottom: 8,
            }}
          >
            {msg.toolCalls.map((tc, i) => (
              <ToolCallStep key={i} tc={tc} />
            ))}
          </div>
        )}

        {/* Bubble */}
        <div
          style={{
            background: isUser ? "#1a1a4e" : "#fff",
            color: isUser ? "#fff" : "#1a1a3e",
            borderRadius: isUser ? "18px 4px 18px 18px" : "4px 18px 18px 18px",
            padding: "10px 16px",
            boxShadow: isUser ? "0 2px 8px rgba(26,26,78,0.18)" : "0 2px 8px rgba(0,0,0,0.07)",
            fontSize: 14,
            lineHeight: 1.65,
            border: isUser ? "none" : "1px solid #f0f0f5",
          }}
        >
          {msg.pending ? (
            <Spin indicator={<LoadingOutlined spin />} size="small" />
          ) : isUser ? (
            <Paragraph
              style={{
                margin: 0,
                color: "#fff",
                whiteSpace: "pre-wrap",
              }}
            >
              {msg.content}
            </Paragraph>
          ) : (
            <div
              className="ai-md"
              style={{ color: "#1a1a3e" }}
              dangerouslySetInnerHTML={{ __html: renderAssistantMarkdown(msg.content) }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sibling pages with AI ────────────────────────────────────────────────────

const SIBLING_PAGES = [
  {
    path: "/dashboard",
    icon: <BarChartOutlined style={{ fontSize: 20, color: "#722ed1" }} />,
    title: "数据看板",
    desc: "AI 自动生成招聘洞察，解读漏斗与活跃趋势",
    hint: "「帮我分析本周招聘数据」",
  },
  {
    path: "/candidates",
    icon: <TeamOutlined style={{ fontSize: 20, color: "#1a7cff" }} />,
    title: "候选人库",
    desc: "侧边 AI 助手可以搜索候选人、查跟进记录",
    hint: "「找 AI 方向、上海的候选人」",
  },
  {
    path: "/positions",
    icon: <ApartmentOutlined style={{ fontSize: 20, color: "#13c2c2" }} />,
    title: "岗位管理",
    desc: "查询急招岗位状态、优先级与匹配进展",
    hint: "「现在有哪些急招岗位？」",
  },
  {
    path: "/matches",
    icon: <StarOutlined style={{ fontSize: 20, color: "#fa8c16" }} />,
    title: "智能匹配",
    desc: "AI 推荐最佳候选人，解释匹配逻辑",
    hint: "「推荐适合这个岗位的候选人」",
  },
  {
    path: "/companies",
    icon: <BankOutlined style={{ fontSize: 20, color: "#52527a" }} />,
    title: "企业库",
    desc: "查询合作企业、关联岗位与历史候选人",
    hint: "「查一下字节跳动的合作记录」",
  },
];

// ─── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ onPrompt }: { onPrompt: (p: string) => void }) {
  const navigate = useNavigate();

  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "48px 24px 80px",
        gap: 36,
      }}
    >
      {/* Logo + intro */}
      <div style={{ textAlign: "center", maxWidth: 520 }}>
        <div
          style={{
            width: 68,
            height: 68,
            borderRadius: "50%",
            background: "linear-gradient(135deg,#1a1a4e 0%,#722ed1 55%,#fa8c16 100%)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 30,
            marginBottom: 18,
            boxShadow: "0 8px 32px rgba(114,46,209,0.22)",
          }}
        >
          <RobotOutlined style={{ color: "#fff" }} />
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#1a1a4e", marginBottom: 10 }}>
          你好，我是 TalentOS AI
        </div>
        <div style={{ fontSize: 14, color: "#6b6b90", lineHeight: 1.85 }}>
          我是你的专属猎头助手，可以帮你查数据、找候选人、分析简历。
          <br />
          你可以直接在这里问我，也可以去下面任意一个页面——
          <br />
          <span style={{ color: "#722ed1", fontWeight: 500 }}>每个页面都有我的身影。</span>
        </div>
      </div>

      {/* Sibling page cards */}
      <div style={{ width: "100%", maxWidth: 580 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "#b0b0c8",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            marginBottom: 12,
          }}
        >
          我在哪些地方可以帮你
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {SIBLING_PAGES.map((p) => (
            <button
              key={p.path}
              onClick={() => navigate(p.path)}
              style={{
                background: "#fff",
                border: "1px solid #ececf2",
                borderRadius: 12,
                padding: "14px 16px",
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.15s",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "#c4b0ff";
                (e.currentTarget as HTMLButtonElement).style.boxShadow =
                  "0 2px 12px rgba(114,46,209,0.10)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "#ececf2";
                (e.currentTarget as HTMLButtonElement).style.boxShadow = "none";
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {p.icon}
                <span style={{ fontWeight: 600, fontSize: 13, color: "#1a1a4e" }}>{p.title}</span>
              </div>
              <div style={{ fontSize: 12, color: "#8c8ca8", lineHeight: 1.6 }}>{p.desc}</div>
              <div
                style={{
                  fontSize: 11,
                  color: "#b37feb",
                  fontStyle: "italic",
                }}
              >
                {p.hint}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Starter prompts */}
      <div style={{ width: "100%", maxWidth: 580 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "#b0b0c8",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            marginBottom: 12,
          }}
        >
          或者直接问我
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {STARTER_PROMPTS.map((p) => (
            <button
              key={p}
              onClick={() => onPrompt(p)}
              style={{
                background: "#faf8ff",
                border: "1px solid #ede9ff",
                borderRadius: 10,
                padding: "9px 14px",
                fontSize: 12.5,
                color: "#3a3a6e",
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.15s",
                lineHeight: 1.5,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "#722ed1";
                (e.currentTarget as HTMLButtonElement).style.background = "#f0eeff";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "#ede9ff";
                (e.currentTarget as HTMLButtonElement).style.background = "#faf8ff";
              }}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Persistent hint chips (shown after first message) ────────────────────────

const HINTS = ["候选人漏斗分析", "找最近活跃的候选人", "所有开放岗位", "查看跟进记录"];

function HintChips({ onPrompt }: { onPrompt: (p: string) => void }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
      {HINTS.map((h) => (
        <button
          key={h}
          onClick={() => onPrompt(h)}
          style={{
            background: "#f0eeff",
            border: "1px solid #d3bfff",
            borderRadius: 20,
            padding: "4px 12px",
            fontSize: 12,
            color: "#722ed1",
            cursor: "pointer",
            transition: "all 0.12s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "#e6d9ff";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "#f0eeff";
          }}
        >
          {h}
        </button>
      ))}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

const EMPTY_MSGS: ChatMsg[] = [];

export default function AgentPage() {
  const messages: ChatMsg[] = useChatStore((s) => s.current?.messages ?? EMPTY_MSGS);
  const appendMessage = useChatStore((s) => s.appendMessage);
  const replaceLast = useChatStore((s) => s.replaceLast);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Treat a thread that's only seen assistant chatter (e.g. a stale greeting
  // from an earlier build) as empty, so we still surface the welcome screen.
  const hasMessages = messages.some((m) => m.role === "user");
  // See AiPanel: persist the parsed-file id across confirmation turns so the
  // PDF reattaches to the candidate when create_candidate finally fires.
  const [pendingResumeFileId, setPendingResumeFileId] = useState<number | null>(null);
  const [stagedFile, setStagedFile] = useState<File | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (loading) return;
    if (!trimmed && !stagedFile) return;
    setInput("");
    const file = stagedFile;
    setStagedFile(null);

    const userBubble = file
      ? trimmed
        ? `${trimmed}\n\n📎 ${file.name}`
        : `📎 ${file.name}`
      : trimmed;
    appendMessage({ role: "user", content: userBubble });
    appendMessage({ role: "assistant", content: "", pending: true });
    setLoading(true);

    try {
      let userContent = trimmed;
      let nextPendingResumeFileId = pendingResumeFileId;
      if (file) {
        const parsed = await agentApi.parseFile(file);
        const fileBlock = `以下是文件「${parsed.filename}」的内容：\n\n${parsed.text}`;
        userContent = trimmed ? `${trimmed}\n\n${fileBlock}` : `${fileBlock}\n\n请分析。`;
        nextPendingResumeFileId = parsed.file_id ?? pendingResumeFileId;
        if (parsed.file_id != null) setPendingResumeFileId(parsed.file_id);
      }

      const history: ChatMessage[] = [
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: userContent },
      ];
      const res = await agentApi.chat(history, {
        pendingResumeFileId: nextPendingResumeFileId,
        pageContext: usePageContextStore.getState().context,
      });
      replaceLast({
        role: "assistant",
        content: res.reply,
        toolCalls: res.tool_calls,
      });
      const consumed = res.tool_calls?.some(
        (tc) =>
          tc.tool === "create_candidate" &&
          (tc.result as { success?: boolean } | null)?.success,
      );
      if (consumed) setPendingResumeFileId(null);
    } catch (err: any) {
      const errMsg = file
        ? (err?.response?.data?.detail ?? "文件解析或请求失败，请重试")
        : "请求失败，请检查网络或后端服务。";
      replaceLast({ role: "assistant", content: errMsg });
      antMessage.error(errMsg);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setStagedFile(file);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 64px)",
        background: "#fafafb",
        position: "relative",
      }}
    >
      {/* Floating history button (top-right) */}
      <Tooltip title="历史会话" placement="left">
        <Button
          type="text"
          icon={<HistoryOutlined />}
          onClick={() => setHistoryOpen(true)}
          style={{
            position: "absolute",
            top: 16,
            right: 24,
            zIndex: 5,
            color: "#722ed1",
            background: "#fff",
            border: "1px solid #ececf2",
            borderRadius: 999,
            padding: "0 14px",
            height: 32,
            fontSize: 13,
            fontWeight: 500,
            boxShadow: "0 1px 2px rgba(20,20,50,0.04)",
          }}
        >
          历史
        </Button>
      </Tooltip>

      {/* Message list / empty state */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {!hasMessages ? (
          <EmptyState
            onPrompt={(p) => {
              setInput(p);
              send(p);
            }}
          />
        ) : (
          <div
            style={{ maxWidth: 760, width: "100%", margin: "0 auto", padding: "32px 24px 16px" }}
          >
            {messages.map((msg, i) => (
              <MessageBubble key={i} msg={msg} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div
        style={{
          borderTop: "1px solid #ececf2",
          background: "#fff",
          padding: "16px 24px 20px",
        }}
      >
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          {hasMessages && (
            <HintChips
              onPrompt={(p) => {
                setInput(p);
                send(p);
              }}
            />
          )}
          <div
            style={{
              background: "#fff",
              border: "1.5px solid #d3bfff",
              borderRadius: 14,
              padding: "8px 8px 8px 12px",
              boxShadow: "0 2px 12px rgba(114,46,209,0.08)",
              transition: "border-color 0.2s",
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt,.md,.html,.htm,.jpg,.jpeg,.png,.webp,.gif"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
            {stagedFile && (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 6px 4px 10px",
                  background: "#f0eeff",
                  border: "1px solid #d3bfff",
                  borderRadius: 8,
                  fontSize: 13,
                  color: "#1a1a4e",
                  marginBottom: 8,
                  maxWidth: "100%",
                }}
              >
                <PaperClipOutlined style={{ color: "#722ed1", fontSize: 13 }} />
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: 360,
                  }}
                  title={stagedFile.name}
                >
                  {stagedFile.name}
                </span>
                <button
                  type="button"
                  onClick={() => setStagedFile(null)}
                  disabled={loading}
                  aria-label="移除附件"
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#8c8c9a",
                    cursor: loading ? "not-allowed" : "pointer",
                    padding: "0 4px",
                    fontSize: 14,
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </div>
            )}
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
            <Tooltip title="上传文件（PDF / DOCX / TXT / 图片）" placement="top">
              <Button
                type="text"
                icon={<PaperClipOutlined />}
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                style={{
                  color: "#b0b0c8",
                  flexShrink: 0,
                  width: 36,
                  height: 36,
                  minWidth: 36,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              />
            </Tooltip>
            <Input.TextArea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="问我任何关于候选人、岗位或招聘的问题，或点击 📎 上传简历…"
              autoSize={{ minRows: 1, maxRows: 6 }}
              style={{
                border: "none",
                boxShadow: "none",
                resize: "none",
                fontSize: 14,
                flex: 1,
                padding: 0,
                background: "transparent",
              }}
              disabled={loading}
            />
            <Tooltip title={loading ? "处理中…" : "发送 (Enter)"}>
              <Button
                type="primary"
                shape="circle"
                icon={loading ? <LoadingOutlined /> : <ArrowUpOutlined />}
                onClick={() => send(input)}
                disabled={loading || (!input.trim() && !stagedFile)}
                style={{
                  background:
                    (input.trim() || stagedFile) && !loading ? "#722ed1" : undefined,
                  border: "none",
                  flexShrink: 0,
                  width: 36,
                  height: 36,
                  minWidth: 36,
                }}
              />
            </Tooltip>
            </div>
          </div>
          <div style={{ textAlign: "center", fontSize: 11, color: "#c0c0d0", marginTop: 8 }}>
            AI 助手可能产生错误，请以系统数据为准
          </div>
        </div>
      </div>

      <ChatHistoryDrawer open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </div>
  );
}
