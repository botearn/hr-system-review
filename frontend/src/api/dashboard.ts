import { apiClient } from "./client";

export interface KPISpark {
  value: number;
  label: string;
  sparkline: number[];
  delta_pct: number | null;
  source: string;
}

export interface FunnelStage {
  key: string;
  label: string;
  count: number;
  conversion_pct: number | null;
}

export interface BreakdownItem {
  key: string;
  label: string;
  count: number;
}

export interface DayActivity {
  day: string;
  follow_ups: number;
  status_changes: number;
}

export interface DashboardOverview {
  kpis: KPISpark[];
  funnel: FunnelStage[];
  industry_breakdown: BreakdownItem[];
  job_status_breakdown: BreakdownItem[];
  activity_7d: DayActivity[];
  scope: "self" | "org";
  generated_at: string;
}

export interface AIInsight {
  text: string;
  cached: boolean;
  generated_at: string;
}

export interface RecentFollowUp {
  id: number;
  candidate_id: number;
  candidate_name: string;
  occurred_at: string;
  channel: string;
  content_excerpt: string;
}

export interface RecentStatusChange {
  id: number;
  candidate_id: number;
  candidate_name: string;
  changed_at: string;
  from_status: string | null;
  to_status: string;
}

export interface RecentActivityOut {
  follow_ups: RecentFollowUp[];
  status_changes: RecentStatusChange[];
}

export interface FunnelStageCandidate {
  candidate_id: number;
  candidate_name: string;
  reached_at: string;
  current_status: string | null;
}

export interface FunnelStageCandidatesOut {
  stage_key: string;
  stage_label: string;
  candidates: FunnelStageCandidate[];
}

export const dashboardApi = {
  overview: () => apiClient.get<DashboardOverview>("/dashboard/overview").then((r) => r.data),
  insight: (force = false) =>
    apiClient.get<AIInsight>("/dashboard/ai-insight", { params: { force } }).then((r) => r.data),
  recentActivity: (days = 7, limit = 50) =>
    apiClient
      .get<RecentActivityOut>("/dashboard/recent-activity", {
        params: { days, limit },
      })
      .then((r) => r.data),
  funnelStageCandidates: (stageKey: string, limit = 50) =>
    apiClient
      .get<FunnelStageCandidatesOut>(`/dashboard/funnel/${stageKey}/candidates`, {
        params: { limit },
      })
      .then((r) => r.data),
};
