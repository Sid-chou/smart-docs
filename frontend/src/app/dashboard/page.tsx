"use client";

import React, { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useDropzone } from "react-dropzone";
import axios from "axios";
import { api } from "@/lib/api";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import {
  IconCloudUpload,
  IconTrash,
  IconLoader,
  IconFileText,
  IconChevronLeft,
  IconChevronRight,
  IconCheck,
  IconX,
  IconAlertTriangle,
} from "@tabler/icons-react";
import { toast } from "sonner";

interface DocumentItem {
  id: string;
  filename: string;
  original_filename: string;
  file_type: string;
  file_size_bytes: number;
  status: string;
  is_indexed: boolean;
  chunk_count: number;
  error_message?: string;
  uploaded_at: string;
}

interface UploadTask {
  id: string; // temp task uuid
  filename: string;
  progress: number;
  status: "uploading" | "indexing" | "success" | "failed";
  errorMessage?: string;
}

const MAX_FILE_SIZE_MB = 10;

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const [currentPage, setCurrentPage] = useState(1);
  const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([]);

  // Fetch paginated document list
  const { data: documentData, isLoading: listLoading } = useQuery({
    queryKey: ["documents", currentPage],
    queryFn: async () => {
      const res = await api.get(`/documents/?page=${currentPage}&page_size=10`);
      return res.data;
    },
    refetchInterval: (query) => {
      // If there are any pending documents on the page, poll statuses every 4 seconds
      const hasPending = query.state.data?.items?.some(
        (doc: DocumentItem) => doc.status === "pending"
      );
      return hasPending ? 4000 : false;
    },
  });

  // Delete document mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/documents/${id}`);
    },
    onSuccess: () => {
      toast.success("Document deletion started.");
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || "Failed to delete document.");
    },
  });

  // Format file size helper
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Upload handler via Axios with progress tracking
  const uploadFile = async (file: File, taskId: string) => {
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await api.post("/documents/upload", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        onUploadProgress: (progressEvent) => {
          const percent = progressEvent.total
            ? Math.round((progressEvent.loaded * 100) / progressEvent.total)
            : 0;

          // Update progress
          setUploadTasks((prev) =>
            prev.map((t) => (t.id === taskId ? { ...t, progress: percent } : t))
          );
        },
      });

      const docId = response.data.id;

      // Update to Indexing state
      setUploadTasks((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, status: "indexing", progress: 100 } : t
        )
      );

      // Poll specific document status until completion
      pollIndexingStatus(docId, taskId);
    } catch (err: any) {
      console.error(err);
      const errMsg = err.response?.data?.detail || "Upload failed.";
      setUploadTasks((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, status: "failed", errorMessage: errMsg } : t
        )
      );
      toast.error(`Upload failed for "${file.name}": ${errMsg}`);
    }
  };

  // Poll indexing status helper
  const pollIndexingStatus = async (docId: string, taskId: string) => {
    const maxRetries = 30; // 2 minutes max
    let retries = 0;

    const interval = setInterval(async () => {
      try {
        const response = await api.get(`/documents/${docId}/status`);
        const { status, error_message } = response.data;

        if (status === "indexed") {
          clearInterval(interval);
          setUploadTasks((prev) =>
            prev.map((t) => (t.id === taskId ? { ...t, status: "success" } : t))
          );
          toast.success("Document indexed successfully.");
          queryClient.invalidateQueries({ queryKey: ["documents"] });

          // Clear successful task card after 4 seconds
          setTimeout(() => {
            setUploadTasks((prev) => prev.filter((t) => t.id !== taskId));
          }, 4000);
        } else if (status.startsWith("failed")) {
          clearInterval(interval);
          setUploadTasks((prev) =>
            prev.map((t) => (
              t.id === taskId
                ? { ...t, status: "failed", errorMessage: error_message || "Indexing failed." }
                : t
            ))
          );
          queryClient.invalidateQueries({ queryKey: ["documents"] });
        }
      } catch (err) {
        console.error(err);
      }

      retries++;
      if (retries >= maxRetries) {
        clearInterval(interval);
        setUploadTasks((prev) =>
          prev.map((t) => (
            t.id === taskId
              ? { ...t, status: "failed", errorMessage: "Indexing timed out." }
              : t
          ))
        );
      }
    }, 4000);
  };

  // Dropzone Drop Callback
  const onDrop = useCallback((acceptedFiles: File[]) => {
    acceptedFiles.forEach((file) => {
      // Validate file size (10MB limit)
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        toast.error(`"${file.name}" exceeds the ${MAX_FILE_SIZE_MB}MB size limit.`);
        return;
      }

      const taskId = Math.random().toString(36).substring(7);
      const newTask: UploadTask = {
        id: taskId,
        filename: file.name,
        progress: 0,
        status: "uploading",
      };

      setUploadTasks((prev) => [newTask, ...prev]);
      uploadFile(file, taskId);
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "text/plain": [".txt"],
    },
    multiple: true,
  });

  const docs = documentData?.items || [];
  const totalPages = documentData?.total_pages || 1;

  return (
    <DashboardLayout>
      <div className="space-y-8 max-w-5xl mx-auto">
        {/* Page Header */}
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-slate-50">
            Document Center
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2">
            Upload, manage, and monitor your indexed documents.
          </p>
        </div>

        {/* Upload Panel */}
        <div className="grid grid-cols-1 gap-6">
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
              isDragActive
                ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20"
                : "border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-indigo-400 dark:hover:border-indigo-800"
            }`}
          >
            <input {...getInputProps()} />
            <div className="flex flex-col items-center gap-3">
              <div className="p-4 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 rounded-full">
                <IconCloudUpload className="w-8 h-8" />
              </div>
              <div>
                <p className="font-bold text-slate-700 dark:text-slate-200">
                  {isDragActive ? "Drop files here..." : "Drag & drop files here, or click to browse"}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Supported formats: PDF, DOCX, TXT (Max {MAX_FILE_SIZE_MB}MB)
                </p>
              </div>
            </div>
          </div>

          {/* Active Upload Tasks list */}
          {uploadTasks.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Active Uploading & Indexing Operations
              </h2>
              <div className="grid grid-cols-1 gap-3">
                {uploadTasks.map((task) => (
                  <div
                    key={task.id}
                    className="p-4 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl flex items-center justify-between shadow-sm"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1 mr-4">
                      <IconFileText className="w-8 h-8 text-indigo-500 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">
                          {task.filename}
                        </p>
                        {task.status === "uploading" && (
                          <div className="w-full flex items-center gap-3 mt-1.5">
                            <div className="flex-1 bg-slate-100 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                              <div
                                className="bg-indigo-600 h-full transition-all duration-300"
                                style={{ width: `${task.progress}%` }}
                              />
                            </div>
                            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                              {task.progress}%
                            </span>
                          </div>
                        )}
                        {task.status === "indexing" && (
                          <div className="flex items-center gap-2 mt-1 text-xs text-indigo-600 dark:text-indigo-400 font-semibold animate-pulse">
                            <IconLoader className="w-3.5 h-3.5 animate-spin" />
                            Indexing contents (generating chunks & embeddings)...
                          </div>
                        )}
                        {task.status === "success" && (
                          <div className="flex items-center gap-1.5 mt-1 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                            <IconCheck className="w-4 h-4" /> Ready for chat queries.
                          </div>
                        )}
                        {task.status === "failed" && (
                          <div className="flex items-start gap-1.5 mt-1 text-xs text-red-600 dark:text-red-400 font-semibold">
                            <IconAlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span className="truncate">{task.errorMessage}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {task.status === "failed" && (
                      <button
                        onClick={() => setUploadTasks((prev) => prev.filter((t) => t.id !== task.id))}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                      >
                        <IconX className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Document Listing Panel */}
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-md">
          <div className="px-6 py-5 border-b border-slate-100 dark:border-zinc-800/50 flex items-center justify-between">
            <h2 className="text-lg font-black text-slate-800 dark:text-slate-200">
              Your Repository
            </h2>
          </div>

          <div className="overflow-x-auto">
            {listLoading ? (
              <div className="py-20 flex flex-col items-center justify-center gap-3">
                <IconLoader className="w-8 h-8 animate-spin text-indigo-600 dark:text-indigo-400" />
                <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                  Loading files...
                </p>
              </div>
            ) : docs.length === 0 ? (
              <div className="py-16 text-center">
                <IconFileText className="w-12 h-12 text-slate-300 dark:text-zinc-700 mx-auto mb-3" />
                <p className="font-bold text-slate-700 dark:text-slate-300">
                  No documents uploaded yet
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                  Drag and drop a PDF, Word, or plain text file above to start indexing for AI chat.
                </p>
              </div>
            ) : (
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
                    <tr
                      key={doc.id}
                      className="hover:bg-slate-50/30 dark:hover:bg-zinc-800/10 text-sm"
                    >
                      <td className="px-6 py-4 font-bold text-slate-800 dark:text-slate-200 max-w-xs truncate">
                        {doc.original_filename}
                      </td>
                      <td className="px-6 py-4 text-slate-500 dark:text-slate-400">
                        {formatBytes(doc.file_size_bytes)}
                      </td>
                      <td className="px-6 py-4">
                        {doc.status === "pending" && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 animate-pulse">
                            Indexing
                          </span>
                        )}
                        {doc.status === "indexed" && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400">
                            Indexed ({doc.chunk_count} chunks)
                          </span>
                        )}
                        {doc.status === "failed_unreadable" && (
                          <span
                            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 cursor-help"
                            title={doc.error_message}
                          >
                            Unreadable (Image PDF)
                          </span>
                        )}
                        {doc.status === "failed_error" && (
                          <span
                            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 cursor-help"
                            title={doc.error_message}
                          >
                            Failed
                          </span>
                        )}
                        {doc.status === "deleting" && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-slate-400 animate-pulse">
                            Deleting
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-500 dark:text-slate-400 text-xs">
                        {new Date(doc.uploaded_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => {
                            if (confirm("Are you sure you want to permanently delete this document and all its vector indexes?")) {
                              deleteMutation.mutate(doc.id);
                            }
                          }}
                          disabled={deleteMutation.isPending || doc.status === "deleting"}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50 cursor-pointer inline-flex items-center"
                        >
                          <IconTrash className="w-5 h-5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
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
      </div>
    </DashboardLayout>
  );
}
