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

const registerSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  email: z.string().email("Please enter a valid email address"),
  full_name: z.string().min(2, "Full name must be at least 2 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type RegisterFields = z.infer<typeof registerSchema>;

export function RegisterForm() {
  const router = useRouter();
  const loginStore = useAuthStore((state) => state.login);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFields>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterFields) => {
    setIsLoading(true);
    setErrorMsg(null);

    try {
      // 1. POST to /auth/register
      await apiClient.post("/auth/register", {
        username: data.username,
        email: data.email,
        full_name: data.full_name,
        password: data.password,
      });

      // 2. Automically sign in to retrieve token
      const urlParams = new URLSearchParams();
      urlParams.append("username", data.email);
      urlParams.append("password", data.password);

      const loginRes = await apiClient.post("/auth/login", urlParams, {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });

      const { access_token, refresh_token } = loginRes.data;

      // 3. Hydrate user info
      const meRes = await apiClient.get("/auth/me", {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      });

      loginStore({ access_token, refresh_token }, meRes.data);

      router.push("/dashboard");
    } catch (err: any) {
      console.error(err);
      let detail = err.response?.data?.detail;

      // Sanitize raw validation array errors if present
      if (Array.isArray(detail)) {
        detail = "Registration failed. Verify username/email parameters.";
      } else if (typeof detail !== "string") {
        detail = "Could not register account. Email or Username might be taken.";
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
          Create Account
        </h2>
        <p className="text-[11px] text-gray-400 font-semibold tracking-wide">
          Sign up to begin indexing and querying your knowledge base
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
            Username
          </label>
          <input
            type="text"
            {...register("username")}
            placeholder="johndoe"
            disabled={isLoading}
            className="w-full h-11 px-4 rounded-[10px] border border-gray-200 bg-white text-gray-800 placeholder:text-gray-400 text-sm focus:outline-none focus:border-[#5B63FF] focus:ring-1 focus:ring-[#5B63FF] transition-all"
          />
          {errors.username && (
            <p className="text-xs text-red-500 font-semibold mt-1">{errors.username.message}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-800 mb-1.5">
            Full Name
          </label>
          <input
            type="text"
            {...register("full_name")}
            placeholder="John Doe"
            disabled={isLoading}
            className="w-full h-11 px-4 rounded-[10px] border border-gray-200 bg-white text-gray-800 placeholder:text-gray-400 text-sm focus:outline-none focus:border-[#5B63FF] focus:ring-1 focus:ring-[#5B63FF] transition-all"
          />
          {errors.full_name && (
            <p className="text-xs text-red-500 font-semibold mt-1">{errors.full_name.message}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-800 mb-1.5">
            Email Address
          </label>
          <input
            type="email"
            {...register("email")}
            placeholder="you@example.com"
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
              placeholder="••••••••"
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

        <div className="pt-2">
          <button
            type="submit"
            disabled={isLoading}
            className="w-full h-11 flex items-center justify-center gap-2 bg-[#5B63FF] hover:bg-[#4d55e0] text-white font-bold text-sm rounded-[10px] shadow-sm transition-all cursor-pointer disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <IconLoader className="w-4 h-4 animate-spin" />
                <span>Registering Account...</span>
              </>
            ) : (
              "Create Account"
            )}
          </button>
        </div>
      </form>

      <div className="text-center text-xs text-gray-400 font-semibold tracking-wide">
        Already have an account?{" "}
        <Link href="/login" className="font-bold text-[#5B63FF] hover:underline">
          Sign In
        </Link>
      </div>
    </div>
  );
}
