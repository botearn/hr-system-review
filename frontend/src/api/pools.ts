import { apiClient } from "./client";

export interface PoolItem {
  id: number;
  name: string;
  is_custom: boolean;
  candidate_count: number;
  aliases: string[];
}

export interface PoolCandidate {
  candidate_id: number;
  name: string;
  city: string | null;
  industry: string | null;
  years_of_experience: number | null;
}

export type PoolKind = "skills" | "capabilities";

export const poolsApi = {
  list: (kind: PoolKind) => apiClient.get<PoolItem[]>(`/pools/${kind}`).then((r) => r.data),
  add: (kind: PoolKind, name: string) =>
    apiClient.post<PoolItem>(`/pools/${kind}`, { name }).then((r) => r.data),
  remove: (kind: PoolKind, id: number) =>
    apiClient.delete<void>(`/pools/${kind}/${id}`).then((r) => r.data),
  candidates: (kind: PoolKind, id: number) =>
    apiClient.get<PoolCandidate[]>(`/pools/${kind}/${id}/candidates`).then((r) => r.data),
  regroupCapabilities: (threshold?: number) =>
    apiClient
      .post<{
        clusters: number;
        threshold_used: number;
      }>("/pools/capabilities/regroup", threshold != null ? { threshold } : {})
      .then((r) => r.data),
};
