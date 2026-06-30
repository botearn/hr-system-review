import { apiClient } from "./client";
import type { Page } from "./candidates";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FollowUpChannel = "phone" | "wechat" | "email" | "in_person" | "other";

export type FollowUpStatus =
  | "initial_contact"
  | "resume_pushed"
  | "interview_scheduled"
  | "interview_1_passed"
  | "interview_2_passed"
  | "offer_sent"
  | "onboarded"
  | "rejected_1"
  | "rejected_2"
  | "declined_offer"
  | "dropped";

export interface FollowUpAttachment {
  file_id?: number | null;
  filename: string;
}

export interface FollowUp {
  id: number;
  candidate_id: number;
  position_id: number | null;
  user_id: number;
  occurred_at: string;
  channel: FollowUpChannel;
  content: string;
  next_plan: string | null;
  next_plan_due: string | null;
  attachments: FollowUpAttachment[] | null;
  created_at: string;
  updated_at: string;
}

export interface FollowUpCreate {
  candidate_id: number;
  position_id?: number | null;
  occurred_at: string;
  channel: FollowUpChannel;
  content: string;
  next_plan?: string | null;
  next_plan_due?: string | null;
  attachments?: FollowUpAttachment[];
}

export interface FollowUpUpdate {
  occurred_at?: string;
  channel?: FollowUpChannel;
  content?: string;
  next_plan?: string | null;
  next_plan_due?: string | null;
  attachments?: FollowUpAttachment[];
}

export interface StatusChange {
  id: number;
  candidate_id: number;
  position_id: number | null;
  from_status: FollowUpStatus | null;
  to_status: FollowUpStatus;
  reason: string | null;
  outcome_company: string | null;
  outcome_role: string | null;
  changed_by: number;
  changed_at: string;
}

export interface StatusChangeIn {
  candidate_id: number;
  position_id?: number | null;
  to_status: FollowUpStatus;
  reason?: string | null;
  outcome_company?: string | null;
  outcome_role?: string | null;
}

export interface FollowUpEnums {
  statuses: Array<{ value: FollowUpStatus; label: string }>;
  channels: Array<{ value: FollowUpChannel; label: string }>;
}

export interface ReminderOverdueItem {
  candidate_id: number;
  candidate_name: string;
  next_plan: string | null;
  next_plan_due: string;
  days_overdue: number;
  last_follow_channel: FollowUpChannel | null;
  last_follow_content_excerpt: string | null;
}

export interface ReminderStaleItem {
  candidate_id: number;
  candidate_name: string;
  last_follow_at: string;
  days_since: number;
  last_follow_status: FollowUpStatus | null;
  last_follow_channel: FollowUpChannel | null;
  last_follow_content_excerpt: string | null;
}

export interface Reminders {
  overdue: ReminderOverdueItem[];
  due_today: ReminderOverdueItem[];
  stale: ReminderStaleItem[];
  total: number;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export const followUpsApi = {
  enums: () => apiClient.get<FollowUpEnums>("/follow-ups/enums").then((r) => r.data),

  list: (params: {
    candidate_id?: number;
    position_id?: number;
    page?: number;
    page_size?: number;
  }) => apiClient.get<Page<FollowUp>>("/follow-ups", { params }).then((r) => r.data),

  create: (payload: FollowUpCreate) =>
    apiClient.post<FollowUp>("/follow-ups", payload).then((r) => r.data),

  update: (id: number, patch: FollowUpUpdate) =>
    apiClient.patch<FollowUp>(`/follow-ups/${id}`, patch).then((r) => r.data),

  delete: (id: number) => apiClient.delete(`/follow-ups/${id}`),

  // Status changes
  changeStatus: (payload: StatusChangeIn) =>
    apiClient.post<StatusChange>("/follow-ups/status-changes", payload).then((r) => r.data),

  statusHistory: (candidate_id: number, position_id?: number) =>
    apiClient
      .get<StatusChange[]>("/follow-ups/status-changes", {
        params: { candidate_id, position_id },
      })
      .then((r) => r.data),

  deleteStatusChange: (id: number) => apiClient.delete(`/follow-ups/status-changes/${id}`),

  reminders: () => apiClient.get<Reminders>("/follow-ups/reminders").then((r) => r.data),
};

// 用作 fallback 的中文标签（前端先尝试从 /enums 拉取，拉不到时用这个）
export const STATUS_LABEL: Record<FollowUpStatus, string> = {
  initial_contact: "初步沟通",
  resume_pushed: "简历已推送",
  interview_scheduled: "面试安排中",
  interview_1_passed: "一面通过",
  interview_2_passed: "二面通过",
  offer_sent: "Offer 发放",
  onboarded: "已入职",
  rejected_1: "一面淘汰",
  rejected_2: "二面淘汰",
  declined_offer: "候选人拒绝 Offer",
  dropped: "流失",
};

export const CHANNEL_LABEL: Record<FollowUpChannel, string> = {
  phone: "电话",
  wechat: "微信",
  email: "邮件",
  in_person: "面对面",
  other: "其他",
};

export const STATUS_COLOR: Record<FollowUpStatus, string> = {
  initial_contact: "default",
  resume_pushed: "blue",
  interview_scheduled: "cyan",
  interview_1_passed: "geekblue",
  interview_2_passed: "purple",
  offer_sent: "gold",
  onboarded: "green",
  rejected_1: "orange",
  rejected_2: "red",
  declined_offer: "volcano",
  dropped: "default",
};
