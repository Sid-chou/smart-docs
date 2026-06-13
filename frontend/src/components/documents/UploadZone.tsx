"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { toast } from "sonner";
import {
  IconCloudUpload,
  IconLoader,
  IconCheck,
  IconAlertTriangle,
  IconRefresh,
} from "@tabler/icons-react";

export type UploadState =
  | { phase: "idle" }
  | { phase: "uploading"; progress: number }
  | { phase: "indexing"; documentId: string }
  | { phase: "done" }
  | { phase: "error"; message: string };

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function UploadZone() {
  const queryClient = useQueryClient();
  const [state, setState] = useState<UploadState>({ phase: "idle" });
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Clear polling interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const pollStatus = useCallback((docId: string) => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = setInterval(async () => {
      try {
        const res = await apiClient.get(`/documents/${docId}/status`);
        const { status, error_message } = res.data;

        if (status === "indexed") {
          if (intervalRef.current) clearInterval(intervalRef.current);
          setState({ phase: "done" });
          toast.success("Document indexed successfully!");
          queryClient.invalidateQueries({ queryKey: ["documents"] });
        } else if (status.startsWith("failed")) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          setState({
            phase: "error",
            message: error_message ?? "Indexing failed",
          });
          toast.error(`Indexing failed: ${error_message ?? "Unknown error"}`);
          queryClient.invalidateQueries({ queryKey: ["documents"] });
        }
      } catch (err) {
        console.error(err);
      }
    }, 4000);
  }, [queryClient]);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;
      const file = acceptedFiles[0];

      if (file.size > MAX_FILE_SIZE) {
        toast.error("File too large. Maximum size is 10MB.");
        return;
      }

      setState({ phase: "uploading", progress: 0 });

      const formData = new FormData();
      formData.append("file", file);

      try {
        const response = await apiClient.post("/documents/upload", formData, {
          headers: {
            "Content-Type": "multipart/form-data",
          },
          onUploadProgress: (e) => {
            const progress = Math.round((e.loaded / (e.total ?? 1)) * 100);
            setState({ phase: "uploading", progress });
          },
        });

        // Backend returns 202 Accepted on success
        const docId = response.data.id;
        setState({ phase: "indexing", documentId: docId });
        pollStatus(docId);
      } catch (err: any) {
        console.error(err);
        const errMsg = err.response?.data?.detail || "Upload failed.";
        setState({ phase: "error", message: errMsg });
        toast.error(errMsg);
      }
    },
    [pollStatus]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "text/plain": [".txt"],
    },
    multiple: false,
    maxSize: MAX_FILE_SIZE,
    onDropRejected: () => {
      toast.error("File too large. Maximum size is 10MB.");
    },
  });

  return (
    <div className="space-y-4">
      {state.phase === "idle" && (
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
                {isDragActive ? "Drop the file here..." : "Drag & drop a file here, or click to browse"}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Supports PDF, DOCX, TXT (Max 10MB)
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Progress Bar for Uploading (Phase 1) */}
      {state.phase === "uploading" && (
        <div className="p-6 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-sm text-center">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
            Uploading document...
          </p>
          <div className="w-full bg-slate-100 dark:bg-zinc-800 h-2 rounded-full overflow-hidden mb-2">
            <div
              className="bg-indigo-600 h-full transition-all duration-300"
              style={{ width: `${state.progress}%` }}
            />
          </div>
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
            {state.progress}% Uploaded
          </span>
        </div>
      )}

      {/* Animated Spinner + Text for Indexing (Phase 2) */}
      {state.phase === "indexing" && (
        <div className="p-6 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-sm flex flex-col items-center justify-center gap-3 text-center">
          <IconLoader className="w-8 h-8 animate-spin text-indigo-600 dark:text-indigo-400" />
          <div>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
              Indexing your document...
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Extracting text and generating vector database chunks
            </p>
          </div>
        </div>
      )}

      {/* Done State */}
      {state.phase === "done" && (
        <div className="p-6 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-sm flex flex-col items-center justify-center gap-3 text-center">
          <div className="p-2 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 rounded-full">
            <IconCheck className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
              Document indexed successfully
            </p>
            <button
              onClick={() => setState({ phase: "idle" })}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-xs font-semibold text-slate-700 dark:text-slate-300 rounded-lg cursor-pointer transition-colors"
            >
              <IconRefresh className="w-3.5 h-3.5" /> Upload Another
            </button>
          </div>
        </div>
      )}

      {/* Error State */}
      {state.phase === "error" && (
        <div className="p-6 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-sm flex flex-col items-center justify-center gap-3 text-center">
          <div className="p-2 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded-full">
            <IconAlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
              Indexing failed
            </p>
            <p className="text-xs text-red-500 mt-1 max-w-sm">
              {state.message}
            </p>
            <button
              onClick={() => setState({ phase: "idle" })}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-xs font-semibold text-slate-700 dark:text-slate-300 rounded-lg cursor-pointer transition-colors"
            >
              <IconRefresh className="w-3.5 h-3.5" /> Try Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
