import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ToolCall } from "@/api/agent";

export interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
  /** Transient: only set on the in-flight assistant placeholder. Never persisted as `true`. */
  pending?: boolean;
}

export interface ChatThread {
  id: string;
  /** Auto-derived from the first user message, used in the history list. */
  title: string;
  messages: ChatMsg[];
  /** ms since epoch */
  createdAt: number;
  updatedAt: number;
}

const HISTORY_LIMIT = 50;

interface ChatState {
  /** The thread the user is actively chatting in. */
  current: ChatThread | null;
  /** Older threads, most-recent-first. */
  history: ChatThread[];
  /** Append a message; lazily creates `current` if absent. */
  appendMessage: (m: ChatMsg) => void;
  /** Replace the last message (used to swap pending → real reply). */
  replaceLast: (m: ChatMsg) => void;
  /** Archive the current thread to history and reset. Called on logout / manual "新对话". */
  archiveCurrent: () => void;
  /** Start a fresh thread without archiving (e.g. on initial login). */
  resetCurrent: () => void;
  /** Restore a thread from history into `current`, archiving the in-progress one if any. */
  loadFromHistory: (id: string) => void;
  /** Wipe everything, including history. Called on logout. */
  clearAll: () => void;
}

const newThread = (): ChatThread => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  title: "新对话",
  messages: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

const deriveTitle = (messages: ChatMsg[]): string => {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "新对话";
  const t = firstUser.content.replace(/\s+/g, " ").trim();
  return t.length > 30 ? `${t.slice(0, 30)}…` : t;
};

const stripPending = (m: ChatMsg): ChatMsg => ({ ...m, pending: undefined });

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      current: null,
      history: [],

      appendMessage: (m) => {
        set((state) => {
          const cur = state.current ?? newThread();
          const messages = [...cur.messages, m];
          return {
            current: {
              ...cur,
              messages,
              title: cur.title === "新对话" ? deriveTitle(messages) : cur.title,
              updatedAt: Date.now(),
            },
          };
        });
      },

      replaceLast: (m) => {
        set((state) => {
          const cur = state.current;
          if (!cur || cur.messages.length === 0) return state;
          const messages = [...cur.messages.slice(0, -1), m];
          return {
            current: {
              ...cur,
              messages,
              updatedAt: Date.now(),
            },
          };
        });
      },

      archiveCurrent: () => {
        const cur = get().current;
        if (!cur || cur.messages.length === 0) {
          set({ current: null });
          return;
        }
        const archived: ChatThread = {
          ...cur,
          messages: cur.messages.map(stripPending),
        };
        set((state) => ({
          current: null,
          history: [archived, ...state.history].slice(0, HISTORY_LIMIT),
        }));
      },

      resetCurrent: () => set({ current: null }),

      loadFromHistory: (id) => {
        set((state) => {
          const target = state.history.find((h) => h.id === id);
          if (!target) return state;
          // Archive the in-progress thread first (if any) so we don't lose it.
          const stash: ChatThread[] =
            state.current && state.current.messages.length > 0
              ? [{ ...state.current, messages: state.current.messages.map(stripPending) }]
              : [];
          const remaining = state.history.filter((h) => h.id !== id);
          return {
            current: { ...target, updatedAt: Date.now() },
            history: [...stash, ...remaining].slice(0, HISTORY_LIMIT),
          };
        });
      },

      clearAll: () => set({ current: null, history: [] }),
    }),
    {
      // Default key. Once a user logs in we re-bind to "hr-chat-<userId>" so
      // different accounts on the same machine don't see each other's threads.
      // See bindChatStoreToUser() below.
      name: "hr-chat",
      // Bumped from implicit 0 → 1 to drop stale greeting messages that an
      // earlier build appended into the persisted thread on every panel mount.
      version: 1,
      migrate: () => ({ current: null, history: [] }),
      storage: createJSONStorage(() => localStorage),
      // Don't persist transient `pending` flags — they'd show a stuck spinner
      // after a refresh while the in-flight request is gone.
      partialize: (state) => ({
        current: state.current
          ? { ...state.current, messages: state.current.messages.map(stripPending) }
          : null,
        history: state.history,
      }),
    },
  ),
);

/** Re-key the persisted chat to a per-user storage slot. Idempotent — calling
 *  with the same id is a no-op. Pass null to fall back to the anonymous key
 *  (e.g. on logout if you want to drop the binding). */
let _boundUserId: number | string | null = null;

export function bindChatStoreToUser(userId: number | string | null): void {
  if (userId === _boundUserId) return;
  _boundUserId = userId;
  const name = userId == null ? "hr-chat" : `hr-chat-${userId}`;
  // First clear in-memory state so the previous user's thread doesn't briefly
  // flash before the new namespace finishes hydrating.
  useChatStore.setState({ current: null, history: [] });
  useChatStore.persist.setOptions({ name });
  void useChatStore.persist.rehydrate();
}
