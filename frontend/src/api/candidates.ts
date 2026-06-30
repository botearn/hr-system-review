import { apiClient } from "./client";

export interface Candidate {
  id: number;
  owner_id: number;
  name: string;
  phone: string | null;
  email: string | null;
  wechat: string | null;
  city: string | null;
  industry: string | null;
  years_of_experience: number | null;
  education_level: string | null;
  job_status: string;
  current_salary_min: number | null;
  current_salary_max: number | null;
  expected_salary_min: number | null;
  expected_salary_max: number | null;
  skills: string[];
  derived_capabilities: Array<{
    capability: string;
    evidence_ref?: string;
    evidence_detail?: string;
  }> | null;
  resume_quality_score: number | null;
  source: string;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  last_follow_at?: string | null;
  last_follow_status?: string | null;
  landed_company?: string | null;
  landed_role?: string | null;
}

export interface CandidateExperience {
  id: number;
  company_name: string;
  position_title: string;
  start_date: string | null;
  end_date: string | null;
  description: string | null;
}

export interface CandidateProject {
  id: number;
  project_name: string;
  role: string | null;
  start_date: string | null;
  end_date: string | null;
  description: string | null;
  tech_stack: string[];
}

export interface CandidateEducation {
  id: number;
  school: string;
  degree: string | null;
  major: string | null;
  start_date: string | null;
  end_date: string | null;
}

export interface WebProfileSource {
  type: string;
  title?: string;
  url?: string;
  snippet?: string;
  platform?: string;
  username?: string;
  public_repos?: number;
  followers?: number;
  top_languages?: Record<string, number>;
  notable_repos?: Array<{ name: string; stars: number; description: string; language: string | null }>;
  contribution_level?: string;
  bio?: string;
}

export interface WebProfile {
  summary: string;
  highlights: string[];
  risk_flags: string[];
  sources?: WebProfileSource[];
  enriched_at?: string;
  error?: string;
}

export interface CandidateDetail extends Candidate {
  experiences: CandidateExperience[];
  projects: CandidateProject[];
  educations: CandidateEducation[];
  resume_file_id: number | null;
  resume_file_name: string | null;
  resume_source_url: string | null;
  web_profile: WebProfile | null;
  web_profile_updated_at: string | null;
}

export interface CandidateCreate {
  name: string;
  phone?: string;
  email?: string;
  city?: string;
  industry?: string;
  years_of_experience?: number;
  education_level?: string;
  job_status?: string;
  expected_salary_min?: number;
  expected_salary_max?: number;
  skills?: string[];
  notes?: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export const candidatesApi = {
  list: (params?: {
    name?: string;
    city?: string;
    industry?: string;
    job_status?: string;
    keyword?: string;
    skills?: string[];
    capabilities?: string[];
    page?: number;
    page_size?: number;
  }) =>
    apiClient
      .get<Page<Candidate>>("/candidates", {
        params,
        paramsSerializer: { indexes: null },
      })
      .then((r) => r.data),
  facets: () =>
    apiClient
      .get<{
        industries: string[];
        cities: string[];
        job_statuses: Array<{ value: string; label: string }>;
      }>("/candidates/facets")
      .then((r) => r.data),
  create: (payload: CandidateCreate) =>
    apiClient.post<Candidate>("/candidates", payload).then((r) => r.data),
  get: (id: number) => apiClient.get<CandidateDetail>(`/candidates/${id}`).then((r) => r.data),
  update: (id: number, patch: Partial<CandidateCreate>) =>
    apiClient.patch<Candidate>(`/candidates/${id}`, patch).then((r) => r.data),
  void: (id: number, reason?: string) =>
    apiClient.post<Candidate>(`/candidates/${id}/void`, null, {
      params: reason ? { reason } : undefined,
    }),
  exportXlsx: (params?: {
    name?: string;
    city?: string;
    industry?: string;
    job_status?: string;
    keyword?: string;
    skills?: string[];
    capabilities?: string[];
  }) =>
    apiClient.get<Blob>("/candidates/export", {
      params,
      paramsSerializer: { indexes: null },
      responseType: "blob",
    }),
  resumeBlob: (id: number) =>
    apiClient.get<Blob>(`/candidates/${id}/resume`, { responseType: "blob" }),
  explainCapability: (
    id: number,
    payload: { capability: string; evidence_ref?: string | null; evidence_detail?: string | null },
  ) =>
    apiClient
      .post<{ analysis: string }>(`/candidates/${id}/capabilities/explain`, payload, {
        timeout: 60000,
      })
      .then((r) => r.data),
  deriveCapabilities: (id: number) =>
    apiClient
      .post<{
        capabilities: Array<{
          capability: string;
          evidence_ref?: string;
          evidence_detail?: string;
        }>;
      }>(`/candidates/${id}/capabilities/derive`, undefined, { timeout: 90000 })
      .then((r) => r.data),
  enrichCandidate: (id: number) =>
    apiClient
      .post<{ detail: string }>(`/candidates/${id}/enrich`)
      .then((r) => r.data),
};
