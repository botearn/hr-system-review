import { apiClient } from "./client";
import type { Page } from "./candidates";

export interface Company {
  id: number;
  owner_id: number;
  name: string;
  industry_tags: string[];
  scale: string | null;
  funding_stage: string | null;
  address: string | null;
  website: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  cooperation_status: string;
  notes: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface CompanyCreate {
  name: string;
  industry_tags?: string[];
  scale?: string;
  funding_stage?: string;
  address?: string;
  website?: string;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  cooperation_status?: string;
  notes?: string;
}

export interface CompanyDraft {
  name: string | null;
  industry_tags: string[];
  scale: string | null;
  funding_stage: string | null;
  address: string | null;
  website: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  notes: string | null;
}

export const companiesApi = {
  list: (params?: {
    keyword?: string;
    cooperation_status?: string;
    funding_stage?: string;
    industry_tags?: string[];
    include_archived?: boolean;
    page?: number;
    page_size?: number;
  }) =>
    apiClient
      .get<Page<Company>>("/companies", {
        params,
        paramsSerializer: { indexes: null },
      })
      .then((r) => r.data),
  facets: () =>
    apiClient
      .get<{
        industry_tags: string[];
        funding_stages: string[];
        cooperation_statuses: Array<{ value: string; label: string }>;
      }>("/companies/facets")
      .then((r) => r.data),
  create: (payload: CompanyCreate) =>
    apiClient.post<Company>("/companies", payload).then((r) => r.data),
  get: (id: number) => apiClient.get<Company>(`/companies/${id}`).then((r) => r.data),
  update: (id: number, patch: Partial<CompanyCreate>) =>
    apiClient.patch<Company>(`/companies/${id}`, patch).then((r) => r.data),
  archive: (id: number) => apiClient.post<Company>(`/companies/${id}/archive`).then((r) => r.data),
  restore: (id: number) => apiClient.post<Company>(`/companies/${id}/restore`).then((r) => r.data),
  fromUrl: (url: string) =>
    apiClient
      .post<CompanyDraft>("/companies/from-url", { url }, { timeout: 180000 })
      .then((r) => r.data),
};
