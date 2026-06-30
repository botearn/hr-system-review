import axios from "axios";
import { useAuthStore } from "@/store/auth";
import { useChatStore } from "@/store/chat";

const envBase = import.meta.env.VITE_API_BASE as string | undefined;
const baseURL = envBase ? `${envBase.replace(/\/+$/, "")}/api/v1` : "/api/v1";

export const apiClient = axios.create({
  baseURL,
  // Render free-plan cold starts plus heavy endpoints (matches overview,
  // agent chat with LLM tool calls, batch resume parsing) routinely run
  // past 30s. 30s timeout produces false-positive failures when the
  // backend is actually still computing. 90s gives genuine room and is
  // still a reasonable upper bound — anything longer is a real bug worth
  // surfacing.
  timeout: 90000,
});

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      useChatStore.getState().archiveCurrent();
      useAuthStore.getState().clear();
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  },
);
