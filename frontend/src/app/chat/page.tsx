"use client";

import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import {
  IconMessageChatbot,
  IconSend,
  IconLoader,
  IconFileText,
  IconSearch,
  IconTrash,
  IconCornerDownRight,
  IconChevronRight,
  IconChevronDown,
} from "@tabler/icons-react";
import { toast } from "sonner";

interface DocumentItem {
  id: string;
  original_filename: string;
  status: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Array<{
    filename: string;
    excerpt: string;
    relevance_score: number;
  }>;
  created_at?: string;
}

export default function ChatPage() {
  const queryClient = useQueryClient();
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null); // null means search all documents
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputVal, setInputVal] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const [openCitations, setOpenCitations] = useState<Record<number, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch indexed documents to let user pick scope
  const { data: documents } = useQuery({
    queryKey: ["indexed-documents"],
    queryFn: async () => {
      const res = await api.get("/documents/?page=1&page_size=100");
      // Filter out only successfully indexed files
      return (res.data.items || []).filter((d: DocumentItem) => d.status === "indexed") as DocumentItem[];
    },
  });

  // Fetch Q&A history for the selected scope
  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ["chat-history", selectedDocId],
    queryFn: async () => {
      const docQuery = selectedDocId ? `?document_id=${selectedDocId}` : "";
      const res = await api.get(`/chat/history${docQuery}`);
      return res.data.items as Message[];
    },
  });

  // Automatically sync local state message list when historical data arrives
  useEffect(() => {
    if (historyData) {
      // Sort history chronologically if backend returned reversed
      const sortedHistory = [...historyData].sort(
        (a, b) =>
          new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
      );
      setMessages(sortedHistory);
    }
  }, [historyData]);

  // Scroll to bottom helper
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isAsking]);

  // Send message mutation
  const askMutation = useMutation({
    mutationFn: async (question: string) => {
      const payload: { question: string; document_id?: string } = {
        question,
      };
      if (selectedDocId) {
        payload.document_id = selectedDocId;
      }
      const res = await api.post("/chat/ask", payload);
      return res.data;
    },
    onSuccess: (data) => {
      // Data returns { answer, sources[] }
      const aiMessage: Message = {
        id: Math.random().toString(36).substring(7),
        role: "assistant",
        content: data.answer,
        sources: data.sources,
      };
      setMessages((prev) => [...prev, aiMessage]);
      queryClient.invalidateQueries({ queryKey: ["chat-history"] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || "Assistant was unable to generate an answer.");
      // Remove the optimistic user message if call failed
      setMessages((prev) => prev.slice(0, -1));
    },
    onSettled: () => {
      setIsAsking(false);
    },
  });

  // Send message handler
  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim() || isAsking) return;

    const userMsg: Message = {
      id: Math.random().toString(36).substring(7),
      role: "user",
      content: inputVal,
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsAsking(true);
    askMutation.mutate(inputVal);
    setInputVal("");
  };

  // Clear chat history mutation
  const clearHistoryMutation = useMutation({
    mutationFn: async () => {
      const docQuery = selectedDocId ? `?document_id=${selectedDocId}` : "";
      await api.delete(`/chat/history${docQuery}`);
    },
    onSuccess: () => {
      setMessages([]);
      toast.success("Conversation history purged.");
      queryClient.invalidateQueries({ queryKey: ["chat-history"] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || "Failed to clear history.");
    },
  });

  const toggleCitation = (idx: number) => {
    setOpenCitations((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const activeDocName = selectedDocId
    ? documents?.find((d) => d.id === selectedDocId)?.original_filename || "Document"
    : "All Files (Global Scope)";

  return (
    <DashboardLayout>
      <div className="flex h-[calc(100vh-10rem)] max-w-6xl mx-auto border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden shadow-xl">
        {/* Left Side Scope Sidebar */}
        <aside className="w-80 border-r border-slate-200 dark:border-zinc-800 flex flex-col bg-slate-50/50 dark:bg-zinc-900/50 shrink-0">
          <div className="p-4 border-b border-slate-200 dark:border-zinc-800">
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              Query Security Scope
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Select a single file to isolate RAG queries, or query globally.
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            <button
              onClick={() => setSelectedDocId(null)}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-sm font-bold text-left transition-all ${
                selectedDocId === null
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-zinc-800"
              }`}
            >
              <IconSearch className="w-4 h-4" />
              Global Scope (All Files)
            </button>

            <div className="h-px bg-slate-200 dark:bg-zinc-800 my-2" />

            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase px-3 mb-1">
              Isolated Documents
            </p>

            {(documents || []).length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400 dark:text-slate-600">
                No indexed files available.
              </div>
            ) : (
              documents?.map((doc) => (
                <button
                  key={doc.id}
                  onClick={() => setSelectedDocId(doc.id)}
                  className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-xs font-semibold text-left transition-all truncate ${
                    selectedDocId === doc.id
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-zinc-800"
                  }`}
                >
                  <IconFileText className="w-4 h-4 shrink-0" />
                  <span className="truncate">{doc.original_filename}</span>
                </button>
              ))
            )}
          </div>

          {/* Clear history panel action */}
          <div className="p-3 border-t border-slate-200 dark:border-zinc-800">
            <button
              onClick={() => {
                if (confirm(`Clear conversation history for "${activeDocName}"?`)) {
                  clearHistoryMutation.mutate();
                }
              }}
              disabled={messages.length === 0 || clearHistoryMutation.isPending}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 border border-slate-200 dark:border-zinc-800 hover:border-red-200 dark:hover:border-red-950 text-slate-600 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 rounded-lg text-xs font-semibold shadow-sm transition-all disabled:opacity-50 cursor-pointer"
            >
              <IconTrash className="w-4 h-4" />
              Clear Thread History
            </button>
          </div>
        </aside>

        {/* Right side Q&A panel */}
        <section className="flex-1 flex flex-col min-w-0 bg-white dark:bg-zinc-950">
          {/* Active Scope Header */}
          <div className="px-6 py-4 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between bg-white dark:bg-zinc-900">
            <div className="flex items-center gap-2.5 min-w-0">
              <IconMessageChatbot className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50 truncate">
                  AI Q&A Assistant
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate flex items-center gap-1 mt-0.5">
                  <IconCornerDownRight className="w-3.5 h-3.5 text-slate-400" />
                  Scoped to: <span className="font-bold text-indigo-600 dark:text-indigo-400">{activeDocName}</span>
                </p>
              </div>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {historyLoading ? (
              <div className="h-full flex flex-col items-center justify-center gap-2">
                <IconLoader className="w-7 h-7 animate-spin text-indigo-600 dark:text-indigo-400" />
                <p className="text-xs text-slate-500 dark:text-slate-400">Loading chat history...</p>
              </div>
            ) : messages.length === 0 && !isAsking ? (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-sm mx-auto p-4">
                <div className="p-4 bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 rounded-full mb-4">
                  <IconMessageChatbot className="w-8 h-8" />
                </div>
                <h4 className="font-extrabold text-slate-800 dark:text-slate-100 text-lg">
                  Ask anything about the files
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                  Ask a question. The AI will cross-reference the relevant chunks and cite exact sources in the document.
                </p>
              </div>
            ) : (
              <>
                {messages.map((msg, index) => (
                  <div
                    key={msg.id || index}
                    className={`flex flex-col ${
                      msg.role === "user" ? "items-end" : "items-start"
                    }`}
                  >
                    <div
                      className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                        msg.role === "user"
                          ? "bg-indigo-600 text-white"
                          : "bg-slate-100 dark:bg-zinc-800 text-slate-800 dark:text-slate-100 border border-slate-200/50 dark:border-zinc-800"
                      }`}
                    >
                      <p className="whitespace-pre-line leading-relaxed">{msg.content}</p>
                    </div>

                    {/* Citations Box for AI Answers */}
                    {msg.role === "assistant" && msg.sources && msg.sources.length > 0 && (
                      <div className="mt-2.5 max-w-[85%] border border-slate-200 dark:border-zinc-800/80 rounded-xl overflow-hidden shadow-sm">
                        <button
                          onClick={() => toggleCitation(index)}
                          className="w-full flex items-center justify-between px-3.5 py-2 bg-slate-50 dark:bg-zinc-900 text-xs font-bold text-slate-600 dark:text-slate-400 border-b border-slate-200/80 dark:border-zinc-800 cursor-pointer"
                        >
                          <span className="flex items-center gap-1.5">
                            <IconFileText className="w-3.5 h-3.5 text-indigo-500" />
                            Sources Used ({msg.sources.length})
                          </span>
                          {openCitations[index] ? (
                            <IconChevronDown className="w-3.5 h-3.5" />
                          ) : (
                            <IconChevronRight className="w-3.5 h-3.5" />
                          )}
                        </button>
                        {openCitations[index] && (
                          <div className="p-3 bg-white dark:bg-zinc-950 divide-y divide-slate-100 dark:divide-zinc-800/50 max-h-60 overflow-y-auto">
                            {msg.sources.map((src, sIdx) => (
                              <div key={sIdx} className="py-2.5 first:pt-0 last:pb-0">
                                <div className="flex items-center justify-between text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                                  <span className="truncate max-w-[70%]">{src.filename}</span>
                                  <span className="bg-indigo-50 dark:bg-indigo-950/40 px-1.5 py-0.5 rounded text-[10px]">
                                    Match: {Math.round(src.relevance_score * 100)}%
                                  </span>
                                </div>
                                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 italic bg-slate-50/50 dark:bg-zinc-900/30 p-2 rounded border border-slate-100 dark:border-zinc-800/20">
                                  "{src.excerpt}"
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {/* Optimistic Wait Skeleton loader */}
                {isAsking && (
                  <div className="flex flex-col items-start">
                    <div className="max-w-[70%] bg-slate-100 dark:bg-zinc-800 rounded-2xl px-4 py-3 shadow-sm flex items-center justify-center">
                      <div className="flex flex-col gap-2.5 w-48">
                        <div className="h-3 bg-slate-200 dark:bg-zinc-700 rounded-full animate-pulse w-full" />
                        <div className="h-3 bg-slate-200 dark:bg-zinc-700 rounded-full animate-pulse w-[80%]" />
                        <div className="h-3 bg-slate-200 dark:bg-zinc-700 rounded-full animate-pulse w-[40%]" />
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Form Q&A input bar */}
          <form
            onSubmit={handleSend}
            className="p-4 border-t border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
          >
            <div className="relative flex items-center bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-transparent transition-all">
              <input
                type="text"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                placeholder={
                  selectedDocId
                    ? `Ask about "${activeDocName}"...`
                    : "Ask about all indexed documents..."
                }
                disabled={isAsking || historyLoading}
                className="w-full py-3.5 pl-4 pr-14 text-sm bg-transparent border-none focus:outline-none text-slate-800 dark:text-slate-100"
              />
              <button
                type="submit"
                disabled={!inputVal.trim() || isAsking || historyLoading}
                className="absolute right-2 p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                {isAsking ? (
                  <IconLoader className="w-5 h-5 animate-spin" />
                ) : (
                  <IconSend className="w-5 h-5" />
                )}
              </button>
            </div>
          </form>
        </section>
      </div>
    </DashboardLayout>
  );
}
