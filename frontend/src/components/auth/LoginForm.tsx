"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/stores/auth";
import { apiClient } from "@/lib/api/client";
import { IconLoader, IconAlertCircle } from "@tabler/icons-react";
import Link from "next/link";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginFields = z.infer<typeof loginSchema>;

export function LoginForm() {
  const router = useRouter();
  const loginStore = useAuthStore((state) => state.login);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFields>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFields) => {
    setIsLoading(true);
    setErrorMsg(null);

    try {
      // Backend OAuth2 requires application/x-www-form-urlencoded
      const urlParams = new URLSearchParams();
      urlParams.append("username", data.email);
      urlParams.append("password", data.password);

      const res = await apiClient.post("/auth/login", urlParams, {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });

      const { access_token, refresh_token } = res.data;

      // Hydrate user info using the retrieved access token
      const meRes = await apiClient.get("/auth/me", {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      });

      // Save to Zustand auth store
      loginStore({ access_token, refresh_token }, meRes.data);

      router.push("/dashboard");
    } catch (err: any) {
      console.error(err);
      let detail = err.response?.data?.detail;

      // Sanitize raw validation array errors if present
      if (Array.isArray(detail)) {
        detail = "Invalid credentials or malformed parameters.";
      } else if (typeof detail !== "string") {
        detail = "Sign-in operation failed. Please check your credentials.";
      }

      setErrorMsg(detail);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md p-8 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-xl space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-black bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
          Welcome Back
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Enter credentials to access your secure document repository
        </p>
      </div>

      {errorMsg && (
        <div className="p-4 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50 rounded-xl flex items-start gap-2.5 text-xs font-semibold">
          <IconAlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-xs font-black text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
            Email Address
          </label>
          <input
            type="email"
            {...register("email")}
            placeholder="you@example.com"
            disabled={isLoading}
            className="w-full px-4 py-3 rounded-xl border border-slate-200 hover:border-slate-300 focus:border-indigo-500 bg-slate-50/50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-slate-100 dark:hover:border-zinc-700 text-sm focus:outline-none transition-colors"
          />
          {errors.email && (
            <p className="text-xs text-red-500 font-medium mt-1">{errors.email.message}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-black text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
            Password
          </label>
          <input
            type="password"
            {...register("password")}
            placeholder="••••••••"
            disabled={isLoading}
            className="w-full px-4 py-3 rounded-xl border border-slate-200 hover:border-slate-300 focus:border-indigo-500 bg-slate-50/50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-slate-100 dark:hover:border-zinc-700 text-sm focus:outline-none transition-colors"
          />
          {errors.password && (
            <p className="text-xs text-red-500 font-medium mt-1">{errors.password.message}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md transition-colors disabled:opacity-50 cursor-pointer"
        >
          {isLoading ? (
            <>
              <IconLoader className="w-4 h-4 animate-spin" />
              Verifying Session...
            </>
          ) : (
            "Access Repository"
          )}
        </button>
      </form>

      <div className="text-center text-xs text-slate-500 dark:text-slate-400">
        New to SmartDocs?{" "}
        <Link href="/register" className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline">
          Register Account
        </Link>
      </div>
    </div>
  );
}
