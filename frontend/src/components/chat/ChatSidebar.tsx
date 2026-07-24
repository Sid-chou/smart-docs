"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { IconSearch, IconFileText } from "@tabler/icons-react";
import Link from "next/link";
import { useParams } from "next/navigation";

interface DocumentItem {
  id: string;
  original_filename: string;
  status: string;
}

export function ChatSidebar() {
  const params = useParams();
  const currentDocId = params.documentId as string | undefined;

  // Fetch only indexed documents
  const { data: documents, isLoading } = useQuery({
    queryKey: ["indexed-documents-sidebar"],
    queryFn: async () => {
      const res = await apiClient.get("/documents/?page=1&page_size=100");
      return (res.data.items || []).filter(
        (doc: DocumentItem) => doc.status === "indexed"
      ) as DocumentItem[];
    },
  });

  return (
    <aside className="w-80 border-r border-slate-200 flex flex-col bg-white shrink-0">
      <div className="p-4 border-b border-slate-100">
        <h2 className="text-sm font-bold text-slate-800">
          Query Security Scope
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Select a document to isolate queries, or query globally across all files.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        <Link
          href="/dashboard/chat/all"
          className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-xs font-bold text-left transition-all ${
            !currentDocId
              ? "bg-[#5B63FF] text-white shadow-sm"
              : "text-slate-700 hover:bg-slate-50"
          }`}
        >
          <IconSearch className="w-4 h-4" />
          Global Scope (All Files)
        </Link>

        <div className="h-px bg-slate-100 my-2" />

        <p className="text-[10px] font-black text-slate-400 uppercase px-3 mb-1">
          Isolated Documents
        </p>

        {isLoading ? (
          <div className="space-y-1.5 p-1">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div
                key={idx}
                className="h-8 bg-slate-100 rounded-lg animate-pulse"
              />
            ))}
          </div>
        ) : (documents || []).length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400 italic">
            No indexed files available.
          </div>
        ) : (
          documents?.map((doc) => {
            const isSelected = currentDocId === doc.id;
            return (
              <Link
                key={doc.id}
                href={`/dashboard/chat/${doc.id}`}
                className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-xs font-semibold text-left transition-all truncate ${
                  isSelected
                    ? "bg-[#5B63FF] text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <IconFileText className="w-4 h-4 shrink-0" />
                <span className="truncate">{doc.original_filename}</span>
              </Link>
            );
          })
        )}
      </div>
    </aside>
  );
}
