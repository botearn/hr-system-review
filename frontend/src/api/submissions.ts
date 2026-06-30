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

export const submissionsApi = {
  list: (filter_status?: string) =>
    apiClient.get<SubmissionListItem[]>("/code-submissions", {
      params: filter_status ? { filter_status } : undefined,
    }),

  score: (id: number, payload: ScorePayload) =>
    apiClient.post(`/code-submissions/${id}/score`, payload),
};
