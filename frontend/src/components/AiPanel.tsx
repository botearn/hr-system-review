import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Input, Spin, Tooltip, message as antMessage } from "antd";
import {
  HistoryOutlined,
  LeftOutlined,
  LoadingOutlined,
  PaperClipOutlined,
  RightOutlined,
  RobotOutlined,
  SendOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { agentApi, type AgentResponse, type ChatMessage } from "@/api/agent";
import { useLayoutStore } from "@/store/layout";
import { useChatStore, type ChatMsg } from "@/store/chat";
import { usePageContextStore } from "@/store/pageContext";
import ChatHistoryDrawer from "@/components/ChatHistoryDrawer";
import { renderAssistantMarkdown } from "@/lib/agentMarkdown";

// Side-effects to fire when the agent's reply includes write-tool calls,
// so other pages (Candidates kanban, Dashboard KPIs) can refetch instead
// of showing stale data after a chat-driven mutation.
function emitToolSideEffects(res: AgentResponse) {
  const calls = res?.tool_calls ?? [];
  for (const tc of calls) {
    const result = tc.result as { success?: boolean; candidate_id?: number; follow_up_id?: number } | null;
    if (!result) continue;
    if (tc.tool === "create_candidate" && (result.success || result.candidate_id)) {
      window.dispatchEvent(
        new CustomEvent("candidate:created", { detail: { id: result.candidate_id } }),
      );
    } else if (tc.tool === "create_follow_up" && (result.success || result.follow_up_id)) {
      window.dispatchEvent(
        new CustomEvent("follow_up:created", { detail: { id: result.follow_up_id } }),
      );
    }
  }
}

// Stable empty array so the selector never returns a fresh reference
// (otherwise zustand would re-render this component on every store update).
const EMPTY_MSGS: ChatMsg[] = [];

export interface AiPanelProps {
  /** Page-specific hint chips shown below the input */
  hints?: string[];
  /** Page label shown in collapsed icon tooltip */
  pageLabel?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BORDER = "#ececf2";
const MIN_WIDTH = 260;
const MAX_WIDTH_FRAC = 0.5; // 50vw
const DEFAULT_WIDTH = 300;
const COLLAPSED_WIDTH = 48;

// ─── Main component ───────────────────────────────────────────────────────────

export default function AiPanel({ hints = [], pageLabel }: AiPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const msgs: ChatMsg[] = useChatStore((s) => s.current?.messages ?? EMPTY_MSGS);
  const appendMessage = useChatStore((s) => s.appendMessage);
  const replaceLast = useChatStore((s) => s.replaceLast);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  // Publish current panel width so other pages (e.g. Matches) can align
  // fixed-position elements against the panel's left edge.
  const setAiPanelWidth = useLayoutStore((s) => s.setAiPanelWidth);
  useEffect(() => {
    setAiPanelWidth(collapsed ? COLLAPSED_WIDTH : width);
    return () => setAiPanelWidth(0);
  }, [collapsed, width, setAiPanelWidth]);

  // (Greeting is no longer pushed into the thread — when the thread is empty,
  //  the panel shows a starter card with page-specific suggested questions
  //  rendered as cheap UI, so refreshing or revisiting doesn't accumulate
  //  identical greeting messages.)

  // ── Resize drag ──────────────────────────────────────────────────────────

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      startX.current = e.clientX;
      startWidth.current = width;

      const onMove = (ev: MouseEvent) => {
        if (!dragging.current) return;
        const dx = startX.current - ev.clientX; // drag left = wider
        const maxW = window.innerWidth * MAX_WIDTH_FRAC;
        const next = Math.min(maxW, Math.max(MIN_WIDTH, startWidth.current + dx));
        setWidth(next);
      };
      const onUp = () => {
        dragging.current = false;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [width],
  );

  // ── Send + file attach ───────────────────────────────────────────────────

  const fileInputRef = useRef<HTMLInputElement>(null);
  // A file picked via the paperclip but not yet sent. Held here so the
  // user can type a message alongside it before pressing Send — same
  // mental model as Claude.ai / ChatGPT composers.
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  // Resume Attachment id returned by /agent/parse-file. Persisted across
  // chat turns until the agent commits a create_candidate, so the import
  // can attach the original PDF to the new candidate row regardless of
  // how many confirmation turns happen in between.
  const [pendingResumeFileId, setPendingResumeFileId] = useState<number | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setPendingFile(file);
  };

  const send = async (text: string) => {
    const t = text.trim();
    if (loading) return;
    if (!t && !pendingFile) return;

    const file = pendingFile;
    setInput("");
    setPendingFile(null);

    // Render a single user bubble that shows both the attachment and the typed text.
    const displayContent = file
      ? t
        ? `📎 ${file.name}\n\n${t}`
        : `📎 ${file.name}`
      : t;
    appendMessage({ role: "user", content: displayContent });
    appendMessage({ role: "assistant", content: "", pending: true });
    setLoading(true);

    try {
      let backendUserContent = t;
      let nextPendingResumeFileId: number | null = pendingResumeFileId;
      if (file) {
        const parsed = await agentApi.parseFile(file);
        const filePart = `以下是文件「${parsed.filename}」的内容：\n\n${parsed.text}`;
        backendUserContent = t ? `${filePart}\n\n用户备注：${t}` : `${filePart}\n\n请分析这份简历。`;
        if (parsed.file_id != null) {
          nextPendingResumeFileId = parsed.file_id;
          setPendingResumeFileId(parsed.file_id);
        }
      }

      const history: ChatMessage[] = [
        ...msgs.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: backendUserContent },
      ];
      const res = await agentApi.chat(history, {
        pendingResumeFileId: nextPendingResumeFileId,
        pageContext: usePageContextStore.getState().context,
      });
      replaceLast({ role: "assistant", content: res.reply });
      emitToolSideEffects(res);
      // After a successful create_candidate, the file id has been consumed —
      // clear it so the next chat turn doesn't accidentally reattach the
      // same PDF to a different candidate.
      const consumed = res.tool_calls?.some(
        (tc) =>
          tc.tool === "create_candidate" &&
          (tc.result as { success?: boolean } | null)?.success,
      );
      if (consumed) {
        setPendingResumeFileId(null);
      }
    } catch (err: any) {
      const errMsg = file
        ? err?.response?.data?.detail ?? "文件解析失败，请重试"
        : "请求失败，请稍后重试。";
      if (file) antMessage.error(errMsg);
      replaceLast({ role: "assistant", content: errMsg });
    } finally {
      setLoading(false);
    }
  };

  // ── Collapsed state ──────────────────────────────────────────────────────

  if (collapsed) {
    return (
      <div
        style={{
          width: COLLAPSED_WIDTH,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: 12,
          gap: 16,
          background: "#fff",
          borderLeft: `1px solid ${BORDER}`,
          height: "100%",
          transition: "width 0.2s",
        }}
      >
        <Tooltip title={`展开 TalentOS AI${pageLabel ? ` · ${pageLabel}` : ""}`} placement="left">
          <button
            onClick={() => setCollapsed(false)}
            style={{
              background: "linear-gradient(135deg,#1a1a4e,#722ed1)",
              border: "none",
              borderRadius: "50%",
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "#fff",
              fontSize: 15,
            }}
          >
            <RobotOutlined />
          </button>
        </Tooltip>
        <Tooltip title="展开" placement="left">
          <RightOutlined
            onClick={() => setCollapsed(false)}
            style={{
              color: "#b0b0c8",
              fontSize: 12,
              cursor: "pointer",
              marginTop: "auto",
              marginBottom: 16,
            }}
          />
        </Tooltip>
      </div>
    );
  }

  // ── Expanded state ───────────────────────────────────────────────────────

  return (
    <div
      ref={panelRef}
      style={{
        width,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        background: "#fff",
        borderLeft: `1px solid ${BORDER}`,
        height: "100%",
        position: "relative",
        transition: dragging.current ? "none" : "width 0.18s",
        userSelect: dragging.current ? "none" : undefined,
      }}
    >
      {/* Drag handle */}
      <div
        onMouseDown={onMouseDown}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 5,
          cursor: "col-resize",
          zIndex: 10,
        }}
      />

      {/* Header */}
      <div
        style={{
          padding: "12px 14px",
          borderBottom: `1px solid ${BORDER}`,
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "linear-gradient(135deg,#1a1a4e 0%,#722ed1 100%)",
          flexShrink: 0,
        }}
      >
        <RobotOutlined style={{ color: "#fff", fontSize: 15 }} />
        <span style={{ color: "#fff", fontWeight: 600, fontSize: 13 }}>TalentOS AI</span>
        {pageLabel && (
          <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 11, marginLeft: 2 }}>
            · {pageLabel}
          </span>
        )}
        <Tooltip title="历史会话" placement="bottom">
          <HistoryOutlined
            onClick={() => setHistoryOpen(true)}
            style={{
              color: "rgba(255,255,255,0.7)",
              fontSize: 13,
              marginLeft: "auto",
              cursor: "pointer",
              padding: 4,
            }}
          />
        </Tooltip>
        <Tooltip title="最小化" placement="bottom">
          <LeftOutlined
            onClick={() => setCollapsed(true)}
            style={{
              color: "rgba(255,255,255,0.7)",
              fontSize: 12,
              cursor: "pointer",
              padding: 4,
            }}
          />
        </Tooltip>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 12px 4px" }}>
        {!msgs.some((m) => m.role === "user") ? (
          <div style={{ padding: "20px 4px 12px" }}>
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <RobotOutlined
                style={{ fontSize: 26, color: "#d3bfff", display: "block", marginBottom: 6 }}
              />
              <div style={{ fontSize: 12, color: "#8c8c9a" }}>
                {pageLabel ? `在「${pageLabel}」可以试试：` : "可以试试："}
              </div>
            </div>
            {hints.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {hints.map((h) => (
                  <button
                    key={h}
                    onClick={() => send(h)}
                    style={{
                      textAlign: "left",
                      background: "#faf8ff",
                      border: "1px solid #ede4ff",
                      borderRadius: 10,
                      padding: "8px 12px",
                      fontSize: 12.5,
                      color: "#52527a",
                      cursor: "pointer",
                      transition: "background 120ms, border-color 120ms",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "#f4eeff";
                      e.currentTarget.style.borderColor = "#d3adf7";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "#faf8ff";
                      e.currentTarget.style.borderColor = "#ede4ff";
                    }}
                  >
                    {h}
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: "center", fontSize: 12, color: "#b8b8c4" }}>
                输入问题，或点击 📎 上传简历分析
              </div>
            )}
          </div>
        ) : (
          msgs.map((m, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                flexDirection: m.role === "user" ? "row-reverse" : "row",
                gap: 6,
                marginBottom: 10,
                alignItems: "flex-end",
              }}
            >
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  background:
                    m.role === "user"
                      ? "linear-gradient(135deg,#1a1a4e,#5b7cff)"
                      : "linear-gradient(135deg,#722ed1,#fa8c16)",
                  color: "#fff",
                }}
              >
                {m.role === "user" ? <UserOutlined /> : <RobotOutlined />}
              </div>
              <div
                className={m.role === "assistant" ? "ai-md" : undefined}
                style={{
                  maxWidth: "82%",
                  background: m.role === "user" ? "#1a1a4e" : "#f8f7ff",
                  color: m.role === "user" ? "#fff" : "#1a1a3e",
                  borderRadius: m.role === "user" ? "12px 3px 12px 12px" : "3px 12px 12px 12px",
                  padding: "7px 10px",
                  fontSize: 12.5,
                  lineHeight: 1.6,
                  border: m.role === "assistant" ? "1px solid #ede9ff" : "none",
                  whiteSpace: m.role === "user" ? "pre-wrap" : "normal",
                  wordBreak: "break-word",
                }}
              >
                {m.pending ? (
                  <Spin indicator={<LoadingOutlined spin />} size="small" />
                ) : m.role === "assistant" ? (
                  <div
                    dangerouslySetInnerHTML={{ __html: renderAssistantMarkdown(m.content) }}
                  />
                ) : (
                  m.content
                )}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: "8px 10px 10px", borderTop: `1px solid ${BORDER}`, flexShrink: 0 }}>
        {/* Inline hint chips — shown only after the user has sent at least one
         * message, so the empty-thread starter cards don't visually duplicate. */}
        {hints.length > 0 && msgs.some((m) => m.role === "user") && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {hints.map((h) => (
              <button
                key={h}
                onClick={() => send(h)}
                style={{
                  background: "#f0eeff",
                  border: "1px solid #d3bfff",
                  borderRadius: 999,
                  padding: "3px 10px",
                  fontSize: 11,
                  color: "#722ed1",
                  cursor: "pointer",
                  transition: "background 120ms",
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
        )}
        {pendingFile && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "#f4f0ff",
              border: "1px solid #d3bfff",
              borderRadius: 8,
              padding: "3px 6px 3px 8px",
              fontSize: 11.5,
              color: "#5b3aae",
              marginBottom: 6,
              maxWidth: "100%",
            }}
          >
            <PaperClipOutlined style={{ fontSize: 11 }} />
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: 180,
              }}
              title={pendingFile.name}
            >
              {pendingFile.name}
            </span>
            <button
              onClick={() => setPendingFile(null)}
              disabled={loading}
              aria-label="移除附件"
              style={{
                background: "transparent",
                border: "none",
                cursor: loading ? "default" : "pointer",
                color: "#9b8ac8",
                fontSize: 13,
                lineHeight: 1,
                padding: 0,
                marginLeft: 2,
              }}
            >
              ×
            </button>
          </div>
        )}
        <div
          style={{
            display: "flex",
            gap: 6,
            alignItems: "flex-end",
            border: "1.5px solid #d3bfff",
            borderRadius: 10,
            padding: "5px 6px 5px 10px",
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt,.md,.html,.htm,.jpg,.jpeg,.png,.webp,.gif"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
          <Tooltip title="上传文件（PDF / DOCX / TXT / 图片）" placement="top">
            <Button
              type="text"
              size="small"
              icon={<PaperClipOutlined />}
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              style={{
                color: "#b0b0c8",
                flexShrink: 0,
                width: 28,
                height: 28,
                minWidth: 28,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
              }}
            />
          </Tooltip>
          <Input.TextArea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder="输入问题，或点击 📎 上传文件…"
            autoSize={{ minRows: 1, maxRows: 4 }}
            style={{
              border: "none",
              boxShadow: "none",
              padding: 0,
              fontSize: 12.5,
              resize: "none",
            }}
            disabled={loading}
          />
          <Button
            type="primary"
            size="small"
            shape="circle"
            icon={loading ? <LoadingOutlined /> : <SendOutlined />}
            onClick={() => send(input)}
            disabled={loading || (!input.trim() && !pendingFile)}
            style={{
              background: (input.trim() || pendingFile) && !loading ? "#722ed1" : undefined,
              border: "none",
              flexShrink: 0,
              width: 28,
              height: 28,
              minWidth: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          />
        </div>
        <div style={{ textAlign: "center", fontSize: 10, color: "#c8c8d8", marginTop: 4 }}>
          AI 可能出错，请以系统数据为准
        </div>
      </div>
      <ChatHistoryDrawer open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </div>
  );
}
