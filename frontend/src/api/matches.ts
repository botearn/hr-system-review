import { apiClient } from "./client";
import { useAuthStore } from "@/store/auth";
import { useChatStore } from "@/store/chat";

const STREAM_BASE = (() => {
  const envBase = import.meta.env.VITE_API_BASE as string | undefined;
  return envBase ? `${envBase.replace(/\/+$/, "")}/api/v1` : "/api/v1";
})();

export interface TagItem {
  name: string;
  matched: boolean;
}

export interface MatchItem {
  candidate_id: number;
  candidate_name: string;
  score: number;
  sub_scores: Record<string, number>;
  matched_points: Array<{ dim: string; detail: string }>;
  gap_points: Array<{ dim: string; detail: string }>;
  phone: string | null;
  email: string | null;
  wechat: string | null;
  city: string | null;
  industry: string | null;
  years_of_experience: number | null;
  job_status: string | null;
  last_contact_at: string | null;
  last_contact_channel: string | null;
  capability_breakdown: { must?: TagItem[]; nice?: TagItem[] };
  skill_breakdown: { required?: TagItem[]; nice_to_have?: TagItem[] };
  analysis: string;
  interview_advice: string[];
  rank_reason: string;
}

export interface MatchRunOut {
  position_id: number;
  weights_used: Record<string, number>;
  results: MatchItem[];
}

export interface PositionOverviewItem {
  position_id: number;
  position_title: string;
  position_city: string | null;
  strong: number;
  good: number;
  weak: number;
  top_score: number | null;
}

export interface OverviewStreamHandlers {
  onMeta?: (meta: { total: number; cached: boolean }) => void;
  onItem: (item: PositionOverviewItem) => void;
  onDone?: () => void;
  signal?: AbortSignal;
}

export const matchesApi = {
  overview: () =>
    apiClient
      .get<{ items: PositionOverviewItem[] }>("/matches/overview", { timeout: 120000 })
      .then((r) => r.data.items),
  streamOverview: async (
    handlers: OverviewStreamHandlers,
    opts: { refresh?: boolean } = {},
  ): Promise<void> => {
    const token = useAuthStore.getState().accessToken;
    const url = `${STREAM_BASE}/matches/overview/stream${opts.refresh ? "?refresh=1" : ""}`;
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      signal: handlers.signal,
    });
    if (!res.ok) {
      if (res.status === 401) {
        useChatStore.getState().archiveCurrent();
        useAuthStore.getState().clear();
        if (window.location.pathname !== "/login") window.location.href = "/login";
      }
      throw new Error(`HTTP ${res.status}`);
    }
    if (!res.body) throw new Error("no response body");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let msg: any;
          try {
            msg = JSON.parse(line);
          } catch {
            continue;
          }
          if (msg.type === "meta") {
            handlers.onMeta?.({ total: msg.total, cached: msg.cached });
          } else if (msg.type === "item" && msg.item) {
            handlers.onItem(msg.item as PositionOverviewItem);
          } else if (msg.type === "done") {
            handlers.onDone?.();
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  },
  parseWeights: (text: string) =>
    apiClient
      .post<{ weights: Record<string, number>; explanation: string }>("/matches/parse-weights", {
        text,
      })
      .then((r) => r.data),
  run: (payload: {
    position_id: number;
    top_k?: number;
    limit?: number;
    weights?: Record<string, number>;
  }) => apiClient.post<MatchRunOut>("/matches/run", payload).then((r) => r.data),
  reindex: () =>
    apiClient
      .post<{ candidates: number; positions: number }>("/matches/reindex")
      .then((r) => r.data),
  exportXlsx: (payload: {
    position_id: number;
    top_k?: number;
    limit?: number;
    weights?: Record<string, number>;
  }) => apiClient.post<Blob>("/matches/export", payload, { responseType: "blob" }),
};
