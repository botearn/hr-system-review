import { apiClient } from "./client";
import type { Candidate } from "./candidates";

export interface ResumeTaskBrief {
  id: number;
  source_type: string;
  source_url: string | null;
  status: string;
  candidate_id: number | null;
  candidate_name: string | null;
  filename: string | null;
  error_msg: string | null;
  created_at: string;
}

export interface ResumeDuplicate {
  candidate_id: number;
  name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  matched_by: string[];
  created_at: string;
}

export interface ResumeTaskDetail extends ResumeTaskBrief {
  user_id: number;
  extracted: any | null;
  derived_capabilities: any[] | null;
  resume_quality: any | null;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
  duplicates?: ResumeDuplicate[];
}

export const resumesApi = {
  upload: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiClient
      .post<{ task_id: number }>("/resumes/upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data);
  },
  uploadBatch: (files: File[]) => {
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    return apiClient
      .post<{ task_ids: number[]; failed: string[] }>("/resumes/upload/batch", form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data);
  },
  fromUrl: (url: string) =>
    apiClient.post<{ task_id: number }>("/resumes/url", { url }).then((r) => r.data),
  listTasks: (params?: {
    page?: number;
    page_size?: number;
    status?: string[];
    source_type?: string;
    q?: string;
    date_from?: string;
    date_to?: string;
  }) =>
    apiClient
      .get<{
        items: ResumeTaskBrief[];
        total: number;
        page: number;
        page_size: number;
      }>("/resumes/tasks", {
        params,
        paramsSerializer: {
          indexes: null, // status=foo&status=bar 格式
        },
      })
      .then((r) => r.data),
  getTask: (id: number) =>
    apiClient.get<ResumeTaskDetail>(`/resumes/tasks/${id}`).then((r) => r.data),
  confirm: (id: number, opts?: { overrides?: Record<string, any>; merge_candidate_id?: number }) =>
    apiClient
      .post<Candidate>(`/resumes/tasks/${id}/confirm`, {
        overrides: opts?.overrides,
        merge_candidate_id: opts?.merge_candidate_id,
      })
      .then((r) => r.data),
  deleteTask: (id: number) =>
    apiClient.delete<void>(`/resumes/tasks/${id}`).then((r) => r.data),
  batchDelete: (ids: number[]) =>
    apiClient
      .post<{ deleted: number[]; skipped: { id: number; reason: string }[] }>(
        "/resumes/tasks/batch-delete",
        { ids },
      )
      .then((r) => r.data),
  retryTask: (id: number) =>
    apiClient.post<ResumeTaskBrief>(`/resumes/tasks/${id}/retry`).then((r) => r.data),
};
