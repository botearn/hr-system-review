import { apiClient } from "./client";

export interface UserItem {
  id: number;
  username: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  role_name: string;
  is_active: boolean;
}

export interface UserCreatePayload {
  username: string;
  email: string;
  password: string;
  display_name?: string;
  role_name: string;
}

export interface UserUpdatePayload {
  display_name?: string | null;
  role_name?: string;
  is_active?: boolean;
}

export const usersApi = {
  list: () => apiClient.get<UserItem[]>("/users").then((r) => r.data),

  create: (data: UserCreatePayload) =>
    apiClient.post<UserItem>("/users", data).then((r) => r.data),

  update: (id: number, data: UserUpdatePayload) =>
    apiClient.patch<UserItem>(`/users/${id}`, data).then((r) => r.data),
};
