"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/stores/auth";
import { apiClient } from "@/lib/api/client";
import { IconLoader, IconAlertCircle, IconEye, IconEyeOff } from "@tabler/icons-react";
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
  const [showPassword, setShowPassword] = useState(false);

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
    <div className="w-full max-w-[430px] p-10 bg-white border border-gray-100 rounded-[24px] shadow-2xl flex flex-col space-y-6 select-none text-gray-800">
      <div className="text-center space-y-1">
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
          Welcome Back!
        </h2>
        <p className="text-[11px] text-gray-400 font-semibold tracking-wide">
          We missed you! Please enter your details.
        </p>
      </div>

      {errorMsg && (
        <div className="p-3.5 bg-red-50 text-red-600 border border-red-100 rounded-xl flex items-start gap-2.5 text-xs font-semibold">
          <IconAlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-gray-800 mb-1.5">
            Email
          </label>
          <input
            type="email"
            {...register("email")}
            placeholder="Enter your Email"
            disabled={isLoading}
            className="w-full h-11 px-4 rounded-[10px] border border-gray-200 bg-white text-gray-800 placeholder:text-gray-400 text-sm focus:outline-none focus:border-[#5B63FF] focus:ring-1 focus:ring-[#5B63FF] transition-all"
          />
          {errors.email && (
            <p className="text-xs text-red-500 font-semibold mt-1">{errors.email.message}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-800 mb-1.5">
            Password
          </label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              {...register("password")}
              placeholder="Enter Password"
              disabled={isLoading}
              className="w-full h-11 pl-4 pr-11 rounded-[10px] border border-gray-200 bg-white text-gray-800 placeholder:text-gray-400 text-sm focus:outline-none focus:border-[#5B63FF] focus:ring-1 focus:ring-[#5B63FF] transition-all"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer select-none focus:outline-none"
            >
              {showPassword ? (
                <IconEyeOff className="w-[18px] h-[18px]" />
              ) : (
                <IconEye className="w-[18px] h-[18px]" />
              )}
            </button>
          </div>
          {errors.password && (
            <p className="text-xs text-red-500 font-semibold mt-1">{errors.password.message}</p>
          )}
        </div>

        <div className="flex items-center justify-between text-xs font-semibold">
          <label className="flex items-center gap-2 text-gray-400 cursor-pointer select-none">
            <input
              type="checkbox"
              className="w-4 h-4 rounded border-gray-300 text-[#5B63FF] focus:ring-[#5B63FF] cursor-pointer"
            />
            <span>Remember me</span>
          </label>
          <Link href="#" className="text-[#5B63FF] hover:underline font-bold">
            Forgot password?
          </Link>
        </div>

        <div className="space-y-3.5 pt-2">
          <button
            type="submit"
            disabled={isLoading}
            className="w-full h-11 flex items-center justify-center gap-2 bg-[#5B63FF] hover:bg-[#4d55e0] text-white font-bold text-sm rounded-[10px] shadow-sm transition-all cursor-pointer disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <IconLoader className="w-4 h-4 animate-spin" />
                <span>Verifying Session...</span>
              </>
            ) : (
              "Sign in"
            )}
          </button>

          <button
            type="button"
            className="w-full h-11 flex items-center justify-center border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 font-semibold text-sm rounded-[10px] shadow-sm transition-all cursor-pointer"
          >
            <svg className="w-4 h-4 mr-2.5 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Sign in with google</span>
          </button>
        </div>
      </form>

      <div className="text-center text-xs text-gray-400 font-semibold tracking-wide">
        Don't have an account?{" "}
        <Link href="/register" className="font-bold text-[#5B63FF] hover:underline">
          Sign up
        </Link>
      </div>
    </div>
  );
}
