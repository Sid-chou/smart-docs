"use client";

import React, { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/auth";
import {
  IconFiles,
  IconMessageChatbot,
  IconShieldLock,
  IconLogout,
  IconUserCircle,
  IconLoader,
} from "@tabler/icons-react";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, isLoading, logout } = useAuthStore();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-zinc-950">
        <div className="flex flex-col items-center gap-3">
          <IconLoader className="w-8 h-8 animate-spin text-indigo-600 dark:text-indigo-400" />
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
            Verifying session...
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  const navItems = [
    {
      name: "Documents",
      href: "/dashboard",
      icon: IconFiles,
    },
    {
      name: "AI Chat Assistant",
      href: "/chat",
      icon: IconMessageChatbot,
    },
  ];

  // Only display Admin panel route if user is flagged as admin
  if (user.is_admin) {
    navItems.push({
      name: "Admin Control",
      href: "/admin",
      icon: IconShieldLock,
    });
  }

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-zinc-950">
      {/* Sidebar Desktop */}
      <aside className="hidden md:flex flex-col w-64 border-r border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shrink-0">
        {/* Sidebar Header Logo */}
        <div className="h-16 flex items-center px-6 border-b border-slate-100 dark:border-zinc-800/50">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="text-xl font-black bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
              SmartDocs AI
            </span>
          </Link>
        </div>

        {/* Navigation Section */}
        <nav className="flex-1 px-4 py-6 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 text-sm font-semibold rounded-lg transition-all ${
                  isActive
                    ? "bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-zinc-800"
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400 dark:text-slate-500"}`} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* User Info / Profile Banner */}
        <div className="p-4 border-t border-slate-100 dark:border-zinc-800/50 bg-slate-50/50 dark:bg-zinc-900/30">
          <div className="flex items-center gap-3 mb-4">
            <IconUserCircle className="w-9 h-9 text-slate-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">
                {user.full_name}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {user.email}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              logout();
              router.push("/login");
            }}
            className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg border border-slate-200 hover:border-red-200 text-slate-600 hover:text-red-600 bg-white dark:border-zinc-800 dark:hover:border-red-950 dark:text-slate-400 dark:bg-zinc-950 dark:hover:text-red-400 dark:hover:bg-red-950/10 text-xs font-semibold shadow-sm transition-all cursor-pointer"
          >
            <IconLogout className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Workspace Wrapper */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Navigation Header */}
        <header className="flex md:hidden items-center justify-between h-16 px-6 bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800">
          <span className="text-lg font-black bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
            SmartDocs AI
          </span>
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className={`text-sm font-bold ${pathname === "/dashboard" ? "text-indigo-600" : "text-slate-600"}`}
            >
              Docs
            </Link>
            <Link
              href="/chat"
              className={`text-sm font-bold ${pathname === "/chat" ? "text-indigo-600" : "text-slate-600"}`}
            >
              Chat
            </Link>
            {user.is_admin && (
              <Link
                href="/admin"
                className={`text-sm font-bold ${pathname === "/admin" ? "text-indigo-600" : "text-slate-600"}`}
              >
                Admin
              </Link>
            )}
            <button
              onClick={() => {
                logout();
                router.push("/login");
              }}
              className="text-slate-600 dark:text-slate-400 hover:text-red-600 cursor-pointer"
            >
              <IconLogout className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Content Viewport */}
        <main className="flex-1 p-6 md:p-10 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
