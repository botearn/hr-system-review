import { apiClient } from "./client";
import type { PageContext } from "@/store/pageContext";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
  result: unknown;
}

export interface AgentResponse {
  reply: string;
  tool_calls: ToolCall[];
}

export interface ParseFileResponse {
  filename: string;
  text: string;
  char_count: number;
  file_id: number | null;
}

export const agentApi = {
  chat: async (
    messages: ChatMessage[],
    opts?: {
      pendingResumeFileId?: number | null;
      pageContext?: PageContext | null;
    },
  ): Promise<AgentResponse> => {
    const res = await apiClient.post<AgentResponse>("/agent/chat", {
      messages,
      pending_resume_file_id: opts?.pendingResumeFileId ?? null,
      page_context: opts?.pageContext ?? null,
    });
    return res.data;
  },
  parseFile: async (file: File): Promise<ParseFileResponse> => {
    const form = new FormData();
    form.append("file", file);
    const res = await apiClient.post<ParseFileResponse>("/agent/parse-file", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
  },
};
