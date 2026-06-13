"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import {
  IconUsers,
  IconFiles,
  IconChartBar,
  IconShield,
  IconLoader,
  IconAlertTriangle,
  IconCheck,
  IconX,
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
  username: string;
  full_name?: string;
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
  };
}

export function AdminTabs() {
  const [activeTab, setActiveTab] = useState<"stats" | "users" | "documents">("stats");

  // Fetch stats metrics
  const { data: stats, isLoading: statsLoading } = useQuery<AdminStats>({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const res = await apiClient.get("/admin/stats");
      return res.data;
    },
  });

  // Fetch registered users
  const { data: usersData, isLoading: usersLoading } = useQuery<{ items: AdminUser[] }>({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const res = await apiClient.get("/admin/users/?page=1&page_size=50");
      return res.data;
    },
    enabled: activeTab === "users",
  });

  // Fetch uploaded documents
  const { data: documentsData, isLoading: documentsLoading } = useQuery<{ items: AdminDocument[] }>({
    queryKey: ["admin-documents"],
    queryFn: async () => {
      const res = await apiClient.get("/admin/documents/?page=1&page_size=50");
      return res.data;
    },
    enabled: activeTab === "documents",
  });

  const users = usersData?.items || [];
  const documents = documentsData?.items || [];

  return (
    <div className="space-y-6">
      {/* Tab Selectors */}
      <div className="flex border-b border-slate-200 dark:border-zinc-800">
        <button
          onClick={() => setActiveTab("stats")}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-all cursor-pointer ${
            activeTab === "stats"
              ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <IconChartBar className="w-4 h-4" />
          Metrics Overview
        </button>
        <button
          onClick={() => setActiveTab("users")}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-all cursor-pointer ${
            activeTab === "users"
              ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <IconUsers className="w-4 h-4" />
          Registered Users
        </button>
        <button
          onClick={() => setActiveTab("documents")}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-all cursor-pointer ${
            activeTab === "documents"
              ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <IconFiles className="w-4 h-4" />
          System Documents
        </button>
      </div>

      {/* Tab Panels */}
      {activeTab === "stats" && (
        <div className="space-y-6">
          {statsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, idx) => (
                <div key={idx} className="h-28 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Card 1: Total Registered Users */}
              <div className="p-5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-sm space-y-2">
                <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  Total Users
                </p>
                <div className="flex items-baseline justify-between">
                  <span className="text-3xl font-black text-slate-800 dark:text-slate-100">
                    {stats?.total_users ?? 0}
                  </span>
                  <IconUsers className="w-5 h-5 text-indigo-500" />
                </div>
              </div>

              {/* Card 2: Indexed Knowledge Sources */}
              <div className="p-5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-sm space-y-2">
                <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  Indexed Files
                </p>
                <div className="flex items-baseline justify-between">
                  <span className="text-3xl font-black text-slate-800 dark:text-slate-100">
                    {stats?.indexed_documents ?? 0}
                  </span>
                  <IconFiles className="w-5 h-5 text-emerald-500" />
                </div>
              </div>

              {/* Card 3: Failed Indexing Processes */}
              <div className="p-5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-sm space-y-2">
                <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  Failed Operations
                </p>
                <div className="flex items-baseline justify-between">
                  <span className="text-3xl font-black text-slate-800 dark:text-slate-100">
                    {stats?.failed_documents ?? 0}
                  </span>
                  <IconX className="w-5 h-5 text-red-500" />
                </div>
              </div>

              {/* Card 4: Total Chat Q&A Sessions */}
              <div className="p-5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-sm space-y-2">
                <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  Chat Sessions
                </p>
                <div className="flex items-baseline justify-between">
                  <span className="text-3xl font-black text-slate-800 dark:text-slate-100">
                    {stats?.total_chat_sessions ?? 0}
                  </span>
                  <IconShield className="w-5 h-5 text-violet-500" />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "users" && (
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
          {usersLoading ? (
            <div className="p-6 space-y-4">
              {Array.from({ length: 3 }).map((_, idx) => (
                <div key={idx} className="h-12 bg-slate-100 dark:bg-zinc-850 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : users.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              No registered users found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-zinc-900/50 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase border-b border-slate-100 dark:border-zinc-800/50">
                    <th className="px-6 py-4">Full Name</th>
                    <th className="px-6 py-4">Username</th>
                    <th className="px-6 py-4">Email</th>
                    <th className="px-6 py-4">Admin Status</th>
                    <th className="px-6 py-4">Registered Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/50 text-sm">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50/20 dark:hover:bg-zinc-800/20">
                      <td className="px-6 py-4 font-bold text-slate-800 dark:text-slate-200">
                        {u.full_name || "N/A"}
                      </td>
                      <td className="px-6 py-4 text-slate-600 dark:text-slate-400">
                        {u.username}
                      </td>
                      <td className="px-6 py-4 text-slate-600 dark:text-slate-400">
                        {u.email}
                      </td>
                      <td className="px-6 py-4">
                        {u.is_admin ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-400">
                            Administrator
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-50 text-slate-600 dark:bg-zinc-850 dark:text-slate-400">
                            Standard User
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-400 text-xs">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "documents" && (
        <div className="space-y-4">
          {/* Yellow Banner Warning */}
          <div className="p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-400 rounded-xl flex items-start gap-3 text-xs font-semibold">
            <IconAlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
            <span>
              Owner data unavailable — backend index type mismatch pending fix.
            </span>
          </div>

          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
            {documentsLoading ? (
              <div className="p-6 space-y-4">
                {Array.from({ length: 3 }).map((_, idx) => (
                  <div key={idx} className="h-12 bg-slate-100 dark:bg-zinc-850 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : documents.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                No system documents found.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-zinc-900/50 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase border-b border-slate-100 dark:border-zinc-800/50">
                      <th className="px-6 py-4">Filename</th>
                      <th className="px-6 py-4">Size (Bytes)</th>
                      <th className="px-6 py-4">Owner</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Uploaded</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/50 text-sm">
                    {documents.map((doc) => (
                      <tr key={doc.id} className="hover:bg-slate-50/20 dark:hover:bg-zinc-800/20">
                        <td className="px-6 py-4 font-bold text-slate-800 dark:text-slate-200">
                          {doc.original_filename}
                        </td>
                        <td className="px-6 py-4 text-slate-600 dark:text-slate-400">
                          {doc.file_size_bytes.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">
                          {doc.owner?.username ?? "Unknown user"}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${
                              doc.status === "indexed"
                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400"
                                : doc.status === "pending"
                                ? "bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400"
                                : "bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400"
                            }`}
                          >
                            {doc.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-400 text-xs">
                          {new Date(doc.uploaded_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
