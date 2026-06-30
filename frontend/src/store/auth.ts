import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UserOut } from "@/api/auth";

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: UserOut | null;
  setAuth: (data: { accessToken: string; refreshToken: string; user: UserOut }) => void;
  updateUser: (user: UserOut) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      setAuth: ({ accessToken, refreshToken, user }) => set({ accessToken, refreshToken, user }),
      updateUser: (user) => set({ user }),
      clear: () => set({ accessToken: null, refreshToken: null, user: null }),
    }),
    { name: "hr-auth" },
  ),
);
