"use client";

import React, { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/lib/stores/auth";
import {
  IconFiles,
  IconMessageChatbot,
  IconShieldLock,
  IconLogout,
  IconUserCircle,
} from "@tabler/icons-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, logout } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, router]);

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
      href: "/dashboard/chat/all",
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
    <div className="flex min-h-screen bg-slate-100">
      {/* Sidebar Desktop */}
      <aside className="hidden md:flex flex-col w-64 border-r border-slate-200 bg-white shrink-0">
        {/* Sidebar Header Logo */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-slate-100">
          <Link href="/dashboard" className="flex items-center gap-2 text-black select-none">
            <svg
              className="w-5.5 h-5.5 text-black"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2a3.5 3.5 0 0 1 3.5 3.5v1.5a3.5 3.5 0 0 1-7 0v-1.5A3.5 3.5 0 0 1 12 2z" />
              <path d="M12 22a3.5 3.5 0 0 1-3.5-3.5v-1.5a3.5 3.5 0 0 1 7 0v1.5A3.5 3.5 0 0 1 12 22z" />
              <path d="M2 12a3.5 3.5 0 0 1 3.5-3.5h1.5a3.5 3.5 0 0 1 0 7H5.5A3.5 3.5 0 0 1 2 12z" />
              <path d="M22 12a3.5 3.5 0 0 1-3.5 3.5h-1.5a3.5 3.5 0 0 1 0-7h1.5A3.5 3.5 0 0 1 22 12z" />
            </svg>
            <span className="text-[15px] font-black tracking-[0.2em] text-black">SMART DOCS</span>
          </Link>
          <ThemeToggle />
        </div>

        {/* Navigation Section */}
        <nav className="flex-1 px-4 py-6 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href === "/dashboard/chat/all" && pathname.startsWith("/dashboard/chat"));
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 text-sm font-semibold rounded-lg transition-all ${
                  isActive
                    ? "bg-indigo-50 text-indigo-600 shadow-sm"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? "text-indigo-600" : "text-slate-400"}`} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* User Info / Profile Banner */}
        <div className="p-4 border-t border-slate-100 bg-slate-50">
          <div className="flex items-center gap-3 mb-4">
            <IconUserCircle className="w-9 h-9 text-slate-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-800 truncate">
                {user.full_name || user.username}
              </p>
              <p className="text-xs text-slate-500 truncate">
                {user.email}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              logout();
            }}
            className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg border border-slate-200 hover:border-red-200 text-slate-600 hover:text-red-600 bg-white hover:bg-red-50 text-xs font-semibold shadow-sm transition-all cursor-pointer"
          >
            <IconLogout className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Workspace Wrapper */}
      <div className="flex-1 flex flex-col min-w-0 relative overflow-x-hidden bg-gradient-to-br from-[#D8E7F8] via-[#63A8FF] to-[#7B74FF]">
        {/* Background radial soft light-glows */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full bg-[#D8E7F8]/40 blur-[100px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] rounded-full bg-[#7B74FF]/25 blur-[120px] pointer-events-none" />

        {/* Mobile Navigation Header */}
        <header className="flex md:hidden items-center justify-between h-16 px-6 bg-white border-b border-slate-200 z-10">
          <Link href="/dashboard" className="flex items-center gap-2 text-black select-none">
            <svg
              className="w-5 h-5 text-black"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2a3.5 3.5 0 0 1 3.5 3.5v1.5a3.5 3.5 0 0 1-7 0v-1.5A3.5 3.5 0 0 1 12 2z" />
              <path d="M12 22a3.5 3.5 0 0 1-3.5-3.5v-1.5a3.5 3.5 0 0 1 7 0v1.5A3.5 3.5 0 0 1 12 22z" />
              <path d="M2 12a3.5 3.5 0 0 1 3.5-3.5h1.5a3.5 3.5 0 0 1 0 7H5.5A3.5 3.5 0 0 1 2 12z" />
              <path d="M22 12a3.5 3.5 0 0 1-3.5 3.5h-1.5a3.5 3.5 0 0 1 0-7h1.5A3.5 3.5 0 0 1 22 12z" />
            </svg>
            <span className="text-[14px] font-black tracking-[0.2em] text-black">SMART DOCS</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className={`text-sm font-bold ${pathname === "/dashboard" ? "text-indigo-600 font-extrabold" : "text-slate-600"}`}
            >
              Docs
            </Link>
            <Link
              href="/dashboard/chat/all"
              className={`text-sm font-bold ${pathname.startsWith("/dashboard/chat") ? "text-indigo-600 font-extrabold" : "text-slate-600"}`}
            >
              Chat
            </Link>
            {user.is_admin && (
              <Link
                href="/admin"
                className={`text-sm font-bold ${pathname === "/admin" ? "text-indigo-600 font-extrabold" : "text-slate-600"}`}
              >
                Admin
              </Link>
            )}
            <ThemeToggle />
            <button
              onClick={() => {
                logout();
              }}
              className="text-slate-600 hover:text-red-600 cursor-pointer"
            >
              <IconLogout className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Content Viewport */}
        <main className="flex-1 p-6 md:p-10 overflow-y-auto z-10">
          {children}
        </main>
    </div>
  );
}
