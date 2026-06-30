import { Button, Drawer, Empty, Popconfirm, Typography } from "antd";
import { DeleteOutlined, MessageOutlined, PlusOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useChatStore, type ChatThread } from "@/store/chat";

const { Text } = Typography;

interface Props {
  open: boolean;
  onClose: () => void;
}

function ThreadRow({
  thread,
  active,
  onPick,
  onDelete,
}: {
  thread: ChatThread;
  active: boolean;
  onPick: () => void;
  onDelete: () => void;
}) {
  const lastUserMsg = [...thread.messages].reverse().find((m) => m.role === "user");
  return (
    <div
      onClick={onPick}
      style={{
        cursor: "pointer",
        padding: "10px 12px",
        borderRadius: 10,
        background: active ? "#f4eeff" : "#fff",
        border: `1px solid ${active ? "#d3adf7" : "#ececf2"}`,
        marginBottom: 8,
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        transition: "background 120ms",
      }}
    >
      <MessageOutlined style={{ color: "#722ed1", marginTop: 3 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "#1a1a4e",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {thread.title}
        </div>
        {lastUserMsg && lastUserMsg.content !== thread.title && (
          <div
            style={{
              fontSize: 12,
              color: "#8c8c9a",
              marginTop: 2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {lastUserMsg.content}
          </div>
        )}
        <div style={{ fontSize: 11, color: "#b8b8c4", marginTop: 4 }}>
          {dayjs(thread.updatedAt).fromNow()} · {thread.messages.length} 条
        </div>
      </div>
      <Popconfirm
        title="删除这条会话?"
        okText="删除"
        okButtonProps={{ danger: true }}
        onConfirm={(e) => {
          e?.stopPropagation();
          onDelete();
        }}
        onCancel={(e) => e?.stopPropagation()}
      >
        <Button
          type="text"
          size="small"
          icon={<DeleteOutlined />}
          onClick={(e) => e.stopPropagation()}
          style={{ color: "#b8b8c4" }}
        />
      </Popconfirm>
    </div>
  );
}

export default function ChatHistoryDrawer({ open, onClose }: Props) {
  const current = useChatStore((s) => s.current);
  const history = useChatStore((s) => s.history);
  const archiveCurrent = useChatStore((s) => s.archiveCurrent);
  const loadFromHistory = useChatStore((s) => s.loadFromHistory);
  // Manual delete: read directly from set since the store doesn't expose one yet.
  const deleteFromHistory = (id: string) => {
    useChatStore.setState((s) => ({ history: s.history.filter((h) => h.id !== id) }));
  };

  const handleNewChat = () => {
    archiveCurrent();
    onClose();
  };

  const handlePick = (id: string) => {
    loadFromHistory(id);
    onClose();
  };

  return (
    <Drawer
      title="会话历史"
      placement="right"
      open={open}
      onClose={onClose}
      width={360}
      extra={
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined />}
          onClick={handleNewChat}
          style={{ background: "#722ed1", borderColor: "#722ed1" }}
        >
          新对话
        </Button>
      }
    >
      {current && current.messages.length > 0 && (
        <>
          <Text type="secondary" style={{ fontSize: 12, marginBottom: 6, display: "block" }}>
            当前对话
          </Text>
          <ThreadRow
            thread={current}
            active
            onPick={onClose}
            onDelete={() => {
              useChatStore.getState().resetCurrent();
            }}
          />
        </>
      )}

      <Text type="secondary" style={{ fontSize: 12, margin: "12px 0 6px", display: "block" }}>
        历史会话
      </Text>
      {history.length === 0 ? (
        <Empty
          description={
            <Text type="secondary" style={{ fontSize: 12 }}>
              暂无历史会话
            </Text>
          }
          imageStyle={{ height: 40 }}
        />
      ) : (
        history.map((t) => (
          <ThreadRow
            key={t.id}
            thread={t}
            active={false}
            onPick={() => handlePick(t.id)}
            onDelete={() => deleteFromHistory(t.id)}
          />
        ))
      )}
    </Drawer>
  );
}
