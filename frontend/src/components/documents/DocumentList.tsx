"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import {
  IconTrash,
  IconLoader,
  IconFileText,
  IconChevronLeft,
  IconChevronRight,
  IconCheck,
  IconX,
  IconAlertCircle,
  IconMessageChatbot,
} from "@tabler/icons-react";
import { toast } from "sonner";
import Link from "next/link";

interface DocumentItem {
  id: string;
  filename: string;
  original_filename: string;
  file_type: string;
  file_size_bytes: number;
  status: string;
  chunk_count: number;
  error_message?: string;
  uploaded_at: string;
}

// Custom status badge component based on specifications:
// pending = yellow spinner, indexed = green checkmark + chunk count, failed_* = red X + truncated error message with tooltip for full text.
function StatusBadge({ doc }: { doc: DocumentItem }) {
  if (doc.status === "pending") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-600 dark:bg-amber-950/20 dark:text-amber-400">
        <IconLoader className="w-3.5 h-3.5 animate-spin" />
        Processing
      </span>
    );
  }

  if (doc.status === "indexed") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400">
        <IconCheck className="w-3.5 h-3.5 shrink-0" />
        Indexed ({doc.chunk_count} chunks)
      </span>
    );
  }

  if (doc.status.startsWith("failed")) {
    const defaultMsg = "Indexing failed due to an extraction or model error.";
    const fullErr = doc.error_message || defaultMsg;
    const truncatedErr = fullErr.length > 25 ? `${fullErr.substring(0, 25)}...` : fullErr;

    return (
      <div className="group relative inline-block">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400 cursor-help">
          <IconX className="w-3.5 h-3.5 shrink-0" />
          {truncatedErr}
        </span>
        {/* Simple tooltip for full text */}
        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block w-56 p-2 bg-slate-800 text-white text-[10px] rounded-lg shadow-lg z-30 leading-normal">
          {fullErr}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
        </div>
      </div>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-slate-400">
      {doc.status}
    </span>
  );
}

export function DocumentList() {
  const queryClient = useQueryClient();
  const [currentPage, setCurrentPage] = useState(1);

  // Fetch documents with TanStack Query v5
  const { data: documentData, isLoading } = useQuery({
    queryKey: ["documents", currentPage],
    queryFn: async () => {
      const res = await apiClient.get(`/documents/?page=${currentPage}&page_size=10`);
      return res.data;
    },
    // Auto refresh status if any document is pending
    refetchInterval: (query) => {
      const items = query.state.data?.items || [];
      const hasPending = items.some((doc: DocumentItem) => doc.status === "pending");
      return hasPending ? 4000 : false;
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/documents/${id}`);
    },
    onSuccess: () => {
      toast.success("Document deleted.");
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || "Delete operation failed.");
    },
  });

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const docs = documentData?.items || [];
  const totalPages = documentData?.total_pages || 1;

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (docs.length === 0) {
    return (
      <div className="py-12 text-center bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-sm">
        <IconFileText className="w-12 h-12 text-slate-300 dark:text-zinc-700 mx-auto mb-3" />
        <p className="font-bold text-slate-700 dark:text-slate-300">
          No files in your repository
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Upload a file to start indexing content for RAG queries.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-md">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/50 dark:bg-zinc-900/50 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase border-b border-slate-100 dark:border-zinc-800/50">
              <th className="px-6 py-4">Filename</th>
              <th className="px-6 py-4">Size</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Uploaded</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/50">
            {docs.map((doc: DocumentItem) => (
              <tr key={doc.id} className="hover:bg-slate-50/30 dark:hover:bg-zinc-800/10 text-sm">
                <td className="px-6 py-4 font-bold text-slate-800 dark:text-slate-200 max-w-xs truncate">
                  {doc.original_filename}
                </td>
                <td className="px-6 py-4 text-slate-500 dark:text-slate-400">
                  {formatBytes(doc.file_size_bytes)}
                </td>
                <td className="px-6 py-4">
                  <StatusBadge doc={doc} />
                </td>
                <td className="px-6 py-4 text-slate-500 dark:text-slate-400 text-xs">
                  {new Date(doc.uploaded_at).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                  {doc.status === "indexed" && (
                    <Link
                      href={`/dashboard/chat/${doc.id}`}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors inline-flex items-center"
                    >
                      <IconMessageChatbot className="w-5 h-5" />
                    </Link>
                  )}
                  <button
                    onClick={() => {
                      if (confirm("Are you sure you want to permanently delete this document and all its chunks?")) {
                        deleteMutation.mutate(doc.id);
                      }
                    }}
                    disabled={deleteMutation.isPending}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50 cursor-pointer inline-flex items-center"
                  >
                    <IconTrash className="w-5 h-5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="px-6 py-4 border-t border-slate-100 dark:border-zinc-800/50 flex items-center justify-between">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Page {currentPage} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 dark:border-zinc-800 dark:hover:bg-zinc-800 text-slate-600 dark:text-slate-400 disabled:opacity-50 cursor-pointer"
            >
              <IconChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 dark:border-zinc-800 dark:hover:bg-zinc-800 text-slate-600 dark:text-slate-400 disabled:opacity-50 cursor-pointer"
            >
              <IconChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
