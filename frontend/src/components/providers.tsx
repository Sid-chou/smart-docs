"use client";

import React, { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { useAuthStore } from "@/lib/stores/auth";
import { useDocumentStatusManager } from "@/lib/hooks/useDocumentStatusManager";
import axios from "axios";
import { IconLoader } from "@tabler/icons-react";
import { ThemeProvider } from "next-themes";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function GlobalStatusManager() {
  useDocumentStatusManager();
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 5, // 5 minutes
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );

  const { setAccessToken, setUser, logout } = useAuthStore();
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      // Zustand persist hydrates synchronously from localStorage.
      const storedRefreshToken = useAuthStore.getState().refreshToken;

      if (!storedRefreshToken) {
        // No stored token, reset auth state and clear loading
        useAuthStore.setState({ accessToken: null, user: null, isAuthenticated: false });
        setIsInitializing(false);
        return;
      }

      try {
        // Call POST /auth/refresh with the stored refresh token
        const response = await axios.post(`${API_URL}/auth/refresh`, {
          refresh_token: storedRefreshToken,
        });
        const { access_token, refresh_token } = response.data;

        // Set access token in Zustand memory
        setAccessToken(access_token);
        useAuthStore.setState({ refreshToken: refresh_token });

        // Fetch GET /auth/me to hydrate user info
        const meRes = await axios.get(`${API_URL}/auth/me`, {
          headers: {
            Authorization: `Bearer ${access_token}`,
          },
        });

        setUser(meRes.data);
      } catch (err) {
        console.error("Cold start session recovery failed:", err);
        logout();
      } finally {
        setIsInitializing(false);
      }
    };

    initAuth();
  }, [setAccessToken, setUser, logout]);

  if (isInitializing) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-zinc-950">
        <div className="flex flex-col items-center gap-3">
          <IconLoader className="w-8 h-8 animate-spin text-indigo-600 dark:text-indigo-400" />
          <p className="text-sm text-slate-500 dark:text-slate-400 font-bold">
            Restoring session...
          </p>
        </div>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <GlobalStatusManager />
        {children}
        <Toaster position="top-right" richColors closeButton />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
