import { apiClient } from "./client";

export interface SubmissionListItem {
  id: number;
  challenge_id: string;
  github_url: string;
  candidate_id: number | null;
  status: string;
  submitted_at: string;
  time_spent_seconds: number | null;
  score: number | null;
  grade: string | null;
  notes: string | null;
  evaluated_at: string | null;
  user_id: number;
  submitter_username: string;
  submitter_name: string | null;
  submitter_email: string | null;
}

export interface ScorePayload {
  score: number;
  grade: string | null;
  notes: string | null;
}

export interface SubmissionStats {
  total_interviewees: number;
  total_submissions: number;
  pending: number;
  evaluated: number;
  avg_score: number | null;
  grade_distribution: Record<string, number>;
}

export const submissionsApi = {
  list: (filter_status?: string, since?: string) =>
    apiClient.get<SubmissionListItem[]>("/code-submissions", {
      params: {
        ...(filter_status ? { filter_status } : {}),
        ...(since ? { since } : {}),
      },
    }),

  stats: () => apiClient.get<SubmissionStats>("/code-submissions/stats"),

  score: (id: number, payload: ScorePayload) =>
    apiClient.post(`/code-submissions/${id}/score`, payload),
};
