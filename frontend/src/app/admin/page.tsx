"use client";

import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { api } from "@/lib/api";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import {
  IconUsers,
  IconFiles,
  IconMessageChatbot,
  IconShield,
  IconLockOpen,
  IconLock,
  IconLoader,
  IconAlertTriangle,
} from "@tabler/icons-react";

interface AdminStats {
  total_users: number;
  indexed_documents: number;
  total_chat_sessions: number;
  failed_documents: number;
}

interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  is_admin: boolean;
  is_active: boolean;
  created_at: string;
}

interface AdminDocument {
  id: string;
  original_filename: string;
  file_size_bytes: number;
  status: string;
  user_id: string;
  uploaded_at: string;
  owner?: {
    username?: string;
    email?: string;
    full_name?: string;
  } | Array<{
    username?: string;
    email?: string;
    full_name?: string;
  }>;
}

export default function AdminPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading } = useAuthStore();
  const [activeTab, setActiveTab] = useState<"users" | "documents">("users");

  // Redirect if not admin
  useEffect(() => {
    if (!isLoading && isAuthenticated && user && !user.is_admin) {
      router.replace("/dashboard");
    }
  }, [user, isAuthenticated, isLoading, router]);

  // Fetch admin stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const res = await api.get("/admin/stats");
      return res.data as AdminStats;
    },
    enabled: !!user?.is_admin,
  });

  // Fetch admin user table
  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const res = await api.get("/admin/users/?page=1&page_size=50");
      return res.data.items as AdminUser[];
    },
    enabled: !!user?.is_admin && activeTab === "users",
  });

  // Fetch admin document table
  const { data: globalDocs, isLoading: docsLoading } = useQuery({
    queryKey: ["admin-documents"],
    queryFn: async () => {
      const res = await api.get("/admin/documents/?page=1&page_size=50");
      return res.data.items as AdminDocument[];
    },
    enabled: !!user?.is_admin && activeTab === "documents",
  });

  if (isLoading || !user?.is_admin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-zinc-950">
        <div className="flex flex-col items-center gap-3">
          <IconLoader className="w-8 h-8 animate-spin text-indigo-600 dark:text-indigo-400" />
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Checking authorization...</p>
        </div>
      </div>
    );
  }

  // Helper to format bytes
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Helper to safely extract owner username to bypass the backend $lookup type mismatch bug
  const getOwnerName = (doc: AdminDocument) => {
    if (!doc.owner) return "Unknown user (Lookup Mismatch)";

    if (Array.isArray(doc.owner)) {
      if (doc.owner.length === 0) return "Unknown user (Lookup Mismatch)";
      return doc.owner[0]?.full_name || doc.owner[0]?.email || "Unknown user";
    }

    return doc.owner.full_name || doc.owner.email || "Unknown user";
  };

  return (
    <DashboardLayout>
      <div className="space-y-8 max-w-6xl mx-auto">
        {/* Page Header */}
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-slate-50 flex items-center gap-2">
            <IconShield className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
            Admin Control Center
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2">
            Global metrics oversight, user control, and resource inspection.
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {statsLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-32 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl animate-pulse" />
            ))
          ) : (
            <>
              {/* Total Users */}
              <div className="p-6 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-sm relative overflow-hidden flex items-center justify-between">
                <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-500" />
                <div>
                  <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase">Total Users</p>
                  <p className="text-3xl font-black text-slate-800 dark:text-slate-100 mt-2">{stats?.total_users ?? 0}</p>
                </div>
                <div className="p-3 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 rounded-xl">
                  <IconUsers className="w-6 h-6" />
                </div>
              </div>

              {/* Indexed Docs */}
              <div className="p-6 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-sm relative overflow-hidden flex items-center justify-between">
                <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
                <div>
                  <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase">Indexed Docs</p>
                  <p className="text-3xl font-black text-slate-800 dark:text-slate-100 mt-2">{stats?.indexed_documents ?? 0}</p>
                </div>
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 rounded-xl">
                  <IconFiles className="w-6 h-6" />
                </div>
              </div>

              {/* Chat Sessions */}
              <div className="p-6 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-sm relative overflow-hidden flex items-center justify-between">
                <div className="absolute top-0 left-0 right-0 h-1 bg-purple-500" />
                <div>
                  <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase">Chat Sessions</p>
                  <p className="text-3xl font-black text-slate-800 dark:text-slate-100 mt-2">{stats?.total_chat_sessions ?? 0}</p>
                </div>
                <div className="p-3 bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400 rounded-xl">
                  <IconMessageChatbot className="w-6 h-6" />
                </div>
              </div>

              {/* Failed Docs */}
              <div className="p-6 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-sm relative overflow-hidden flex items-center justify-between">
                <div className="absolute top-0 left-0 right-0 h-1 bg-rose-500" />
                <div>
                  <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase">Failed Indexing</p>
                  <p className="text-3xl font-black text-slate-800 dark:text-slate-100 mt-2">{stats?.failed_documents ?? 0}</p>
                </div>
                <div className="p-3 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 rounded-xl">
                  <IconAlertTriangle className="w-6 h-6" />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Tab Controls */}
        <div className="flex border-b border-slate-200 dark:border-zinc-800">
          <button
            onClick={() => setActiveTab("users")}
            className={`px-6 py-3 text-sm font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === "users"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
            }`}
          >
            Registered Users
          </button>
          <button
            onClick={() => setActiveTab("documents")}
            className={`px-6 py-3 text-sm font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === "documents"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
            }`}
          >
            System Documents Log
          </button>
        </div>

        {/* Table Sections */}
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-md">
          {activeTab === "users" && (
            <div className="overflow-x-auto">
              {usersLoading ? (
                <div className="py-20 flex flex-col items-center justify-center gap-3">
                  <IconLoader className="w-8 h-8 animate-spin text-indigo-600 dark:text-indigo-400" />
                  <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Loading user database...</p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50 dark:bg-zinc-900/50 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase border-b border-slate-100 dark:border-zinc-800/50">
                      <th className="px-6 py-4">Full Name</th>
                      <th className="px-6 py-4">Email</th>
                      <th className="px-6 py-4">Registered</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Role</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/50">
                    {users?.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50/30 dark:hover:bg-zinc-800/10 text-sm">
                        <td className="px-6 py-4 font-bold text-slate-800 dark:text-slate-200">{u.full_name}</td>
                        <td className="px-6 py-4 text-slate-500 dark:text-slate-400">{u.email}</td>
                        <td className="px-6 py-4 text-slate-500 dark:text-slate-400 text-xs">
                          {new Date(u.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4">
                          {u.is_active ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                              <IconLockOpen className="w-3.5 h-3.5" /> Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400">
                              <IconLock className="w-3.5 h-3.5" /> Suspended
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {u.is_admin ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-400">
                              Administrator
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-400">
                              User
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {activeTab === "documents" && (
            <div className="overflow-x-auto">
              {docsLoading ? (
                <div className="py-20 flex flex-col items-center justify-center gap-3">
                  <IconLoader className="w-8 h-8 animate-spin text-indigo-600 dark:text-indigo-400" />
                  <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Loading documents log...</p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50 dark:bg-zinc-900/50 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase border-b border-slate-100 dark:border-zinc-800/50">
                      <th className="px-6 py-4">Original Filename</th>
                      <th className="px-6 py-4">Size</th>
                      <th className="px-6 py-4">Uploaded By</th>
                      <th className="px-6 py-4">Date</th>
                      <th className="px-6 py-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/50">
                    {globalDocs?.map((doc) => (
                      <tr key={doc.id} className="hover:bg-slate-50/30 dark:hover:bg-zinc-800/10 text-sm">
                        <td className="px-6 py-4 font-bold text-slate-800 dark:text-slate-200 max-w-xs truncate">
                          {doc.original_filename}
                        </td>
                        <td className="px-6 py-4 text-slate-500 dark:text-slate-400">
                          {formatBytes(doc.file_size_bytes)}
                        </td>
                        {/* Safe owner resolution to bypass lookup type mismatch */}
                        <td className="px-6 py-4 text-slate-500 dark:text-slate-400">
                          {getOwnerName(doc)}
                        </td>
                        <td className="px-6 py-4 text-slate-500 dark:text-slate-400 text-xs">
                          {new Date(doc.uploaded_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4">
                          {doc.status === "indexed" && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400">
                              Indexed
                            </span>
                          )}
                          {doc.status === "pending" && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 animate-pulse">
                              Pending
                            </span>
                          )}
                          {doc.status.startsWith("failed") && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400">
                              Failed
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
