import { apiClient } from "./client";

export interface UserOut {
  id: number;
  username: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  role_name: string;
}

export interface LoginOut {
  access_token: string;
  refresh_token: string;
  user: UserOut;
}

export const authApi = {
  login: (username: string, password: string) =>
    apiClient.post<LoginOut>("/auth/login", { username, password }).then((r) => r.data),
  me: () => apiClient.get<UserOut>("/auth/me").then((r) => r.data),
  logout: () => apiClient.post("/auth/logout"),

  updateMe: (display_name: string | null) =>
    apiClient.patch<UserOut>("/auth/me", { display_name }).then((r) => r.data),

  changePassword: (old_password: string, new_password: string) =>
    apiClient.post("/auth/me/password", { old_password, new_password }),

  uploadAvatar: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return apiClient
      .post<UserOut>("/auth/me/avatar", fd, { headers: { "Content-Type": "multipart/form-data" } })
      .then((r) => r.data);
  },

  // 面试者公开注册（强制 interviewee 角色）
  registerInterviewee: (payload: { username: string; email: string; password: string }) =>
    apiClient.post<UserOut>("/auth/register/interviewee", payload).then((r) => r.data),
};
