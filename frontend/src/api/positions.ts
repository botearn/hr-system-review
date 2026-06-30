import { apiClient } from "./client";
import type { Page } from "./candidates";

export interface Position {
  id: number;
  company_id: number;
  owner_id: number;
  title: string;
  type: string | null;
  responsibilities: string | null;
  requirements: string | null;
  required_skills: string[];
  nice_to_have_skills: string[];
  required_capabilities: Array<{ capability: string; priority: "must" | "nice" }> | null;
  min_years: number | null;
  max_years: number | null;
  required_education: string | null;
  salary_min: number | null;
  salary_max: number | null;
  city: string | null;
  remote_ok: boolean;
  headcount: number;
  benefits: string | null;
  onboard_deadline: string | null;
  status: string;
  closed_reason: string | null;
  is_template: boolean;
  template_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface PositionCreate {
  company_id: number;
  title: string;
  type?: string;
  responsibilities?: string;
  requirements?: string;
  required_skills?: string[];
  nice_to_have_skills?: string[];
  min_years?: number;
  max_years?: number;
  required_education?: string;
  salary_min?: number;
  salary_max?: number;
  city?: string;
  remote_ok?: boolean;
  headcount?: number;
  benefits?: string;
  onboard_deadline?: string;
}

export const positionsApi = {
  list: (params?: {
    company_id?: number;
    status?: string;
    type?: string;
    city?: string;
    keyword?: string;
    page?: number;
    page_size?: number;
  }) => apiClient.get<Page<Position>>("/positions", { params }).then((r) => r.data),
  facets: () =>
    apiClient
      .get<{
        cities: string[];
        types: string[];
        statuses: Array<{ value: string; label: string }>;
      }>("/positions/facets")
      .then((r) => r.data),
  create: (payload: PositionCreate) =>
    apiClient.post<Position>("/positions", payload).then((r) => r.data),
  get: (id: number) => apiClient.get<Position>(`/positions/${id}`).then((r) => r.data),
  update: (id: number, patch: Partial<PositionCreate>) =>
    apiClient.patch<Position>(`/positions/${id}`, patch).then((r) => r.data),
  close: (id: number, reason?: string) =>
    apiClient.post<Position>(`/positions/${id}/close`, { reason }).then((r) => r.data),
  reopen: (id: number) => apiClient.post<Position>(`/positions/${id}/reopen`).then((r) => r.data),
};
