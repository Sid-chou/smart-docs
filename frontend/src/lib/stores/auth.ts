import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface User {
  id: string;
  username: string;
  email: string;
  is_admin: boolean;
  full_name?: string;
  created_at: string;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  isAuthenticated: boolean;
  login: (tokens: { access_token: string; refresh_token: string }, user: User | null) => void;
  logout: () => void;
  setAccessToken: (token: string | null) => void;
  setUser: (user: User | null) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null, // Memory only
      refreshToken: null,
      user: null,
      isAuthenticated: false,

      login: (tokens, user) =>
        set({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          user,
          isAuthenticated: true,
        }),

      logout: () => {
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          isAuthenticated: false,
        });
        if (typeof window !== "undefined") {
          window.location.href = "/login";
        }
      },

      setAccessToken: (token) => set({ accessToken: token, isAuthenticated: !!token }),
      setUser: (user) => set({ user }),
    }),
    {
      name: "smartdocs-refresh",
      storage: createJSONStorage(() => localStorage),
      // Only persist the refreshToken field as per instructions
      partialize: (state) => ({
        refreshToken: state.refreshToken,
      }),
    }
  )
);
