"use client";

import React, { useState, useRef, useEffect } from "react";
import { apiClient } from "@/lib/api/client";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/stores/auth";
import {
  IconMessageChatbot,
  IconSend,
  IconLoader,
  IconChevronRight,
  IconChevronDown,
  IconFileText,
} from "@tabler/icons-react";
import { toast } from "sonner";

interface Source {
  filename: string;
  excerpt: string;
  relevance_score: number;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  isPending?: boolean;
}

interface ChatInterfaceProps {
  documentId: string | "all";
}

export function ChatInterface({ documentId }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);

  const { isAuthenticated } = useAuthStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch chat history with TanStack Query v5, scoped by documentId
  const { data: historyData, isLoading: historyLoading, refetch: refetchHistory } = useQuery({
    queryKey: ["chat-history", documentId],
    queryFn: async () => {
      if (!useAuthStore.getState().isAuthenticated) return [];
      
      const url = documentId === "all" ? "/chat/history" : `/chat/history?document_id=${documentId}`;
      const res = await apiClient.get(url);
      
      const sessions = res.data || [];
      // If global scope, find session with null document_id
      if (documentId === "all") {
        const globalSession = sessions.find((s: any) => !s.document_id);
        return globalSession ? globalSession.messages : [];
      } else {
        // For isolated scope, find session matching this documentId
        const docSession = sessions.find((s: any) => s.document_id === documentId);
        return docSession ? docSession.messages : [];
      }
    },
    enabled: isAuthenticated,
  });

  // Hydrate chat messages list from fetched history
  useEffect(() => {
    if (historyData) {
      const formatted: Message[] = [];
      historyData.forEach((msg: any, idx: number) => {
        formatted.push({
          id: `q-${idx}`,
          role: "user",
          content: msg.question,
        });
        formatted.push({
          id: `a-${idx}`,
          role: "assistant",
          content: msg.answer,
          sources: msg.sources || [],
        });
      });
      setMessages(formatted);
    } else {
      setMessages([]);
    }
  }, [historyData]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const clearHistory = async () => {
    if (isClearing) return;
    if (!confirm("Are you sure you want to permanently clear the conversation history for this scope?")) {
      return;
    }

    setIsClearing(true);
    try {
      const url = documentId === "all" ? "/chat/history" : `/chat/history?document_id=${documentId}`;
      await apiClient.delete(url);
      toast.success("Chat history cleared.");
      refetchHistory();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Could not clear chat history.");
    } finally {
      setIsClearing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Guard against double submission / enter key bypass
    if (isLoading || isClearing) return;

    const trimmed = inputValue.trim();

    if (trimmed.length < 3) {
      setInputError("Query must be at least 3 characters long.");
      return;
    }

    setInputError(null);
    setIsLoading(true);

    const userMessageId = Math.random().toString(36).substring(7);
    const assistantMessageId = Math.random().toString(36).substring(7);

    const userMsg: Message = {
      id: userMessageId,
      role: "user",
      content: trimmed,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");

    try {
      const response = await apiClient.post("/chat/ask", {
        question: trimmed,
        document_id: documentId === "all" ? null : documentId,
      });

      const data = response.data;

      const assistantMsg: Message = {
        id: assistantMessageId,
        role: "assistant",
        content: data.answer,
        sources: data.sources || [],
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      console.error(err);
      const errMsg = err.response?.data?.detail || "Failed to generate an answer.";
      toast.error(errMsg);
    } finally {
      setIsLoading(false);
    }
  };

  // Track open/collapsed citations state at message index level
  const [openCitations, setOpenCitations] = useState<Record<string, boolean>>({});
  // Track show-more state for excerpts using messageId-sourceIdx keys
  const [expandedExcerpts, setExpandedExcerpts] = useState<Record<string, boolean>>({});

  const toggleCitations = (msgId: string) => {
    setOpenCitations((prev) => ({ ...prev, [msgId]: !prev[msgId] }));
  };

  const toggleExcerpt = (key: string) => {
    setExpandedExcerpts((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Helper to color-code relevance score
  const getScoreColor = (rawScore: number) => {
    const score = Math.max(0, Math.min(1, rawScore)); // Clamp score to 0–1
    if (score >= 0.8) {
      return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900";
    }
    if (score >= 0.5) {
      return "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border-amber-200 dark:border-amber-900";
    }
    return "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400 border-rose-200 dark:border-rose-900";
  };

  if (historyLoading) {
    return (
      <div className="flex-1 p-6 space-y-6 overflow-y-auto bg-slate-50/30 dark:bg-zinc-950/30 h-full flex flex-col justify-center items-center">
        <IconLoader className="w-8 h-8 animate-spin text-indigo-600 dark:text-indigo-400 mb-2" />
        <span className="text-xs text-slate-500 dark:text-slate-400 font-bold animate-pulse">
          Loading conversation history...
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50/30 dark:bg-zinc-950/30">
      {/* Top Header Bar */}
      <div className="px-6 py-3 bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
        <span className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider">
          {documentId === "all" ? "Global Knowledge Base Chat" : "Isolated Document Query"}
        </span>
        {messages.length > 0 && (
          <button
            onClick={clearHistory}
            disabled={isClearing}
            className="text-[10px] font-black text-red-600 hover:text-red-700 hover:underline uppercase tracking-wider transition-colors disabled:opacity-50 cursor-pointer"
          >
            Clear History
          </button>
        )}
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.length === 0 && !isLoading ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-sm mx-auto">
            <div className="p-4 bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 rounded-full mb-4">
              <IconMessageChatbot className="w-8 h-8" />
            </div>
            <h4 className="font-extrabold text-slate-800 dark:text-slate-100 text-lg">
              SmartDocs AI Chat
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
              Ask questions about your selected scope. The assistant will cross-reference the indexed fragments and cite references.
            </p>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  msg.role === "user" ? "items-end" : "items-start"
                }`}
              >
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm shadow-sm leading-relaxed border ${
                    msg.role === "user"
                      ? "bg-indigo-600 border-indigo-700 text-white"
                      : "bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-800 dark:text-slate-100"
                  }`}
                >
                  <p className="whitespace-pre-line">{msg.content}</p>
                </div>

                {/* Sources Collapsible Panel */}
                {msg.role === "assistant" && (
                  <div className="mt-2.5 max-w-[85%] border border-slate-200 dark:border-zinc-800/80 rounded-xl overflow-hidden shadow-sm bg-white dark:bg-zinc-900">
                    <button
                      onClick={() => toggleCitations(msg.id)}
                      className="w-full flex items-center justify-between px-3.5 py-2 bg-slate-50 dark:bg-zinc-900/50 text-xs font-bold text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-zinc-800 cursor-pointer"
                    >
                      <span className="flex items-center gap-1.5">
                        <IconFileText className="w-3.5 h-3.5 text-indigo-500" />
                        Sources Used ({msg.sources?.length ?? 0})
                      </span>
                      {openCitations[msg.id] ? (
                        <IconChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <IconChevronRight className="w-3.5 h-3.5" />
                      )}
                    </button>
                    {openCitations[msg.id] && (
                      <div className="p-3 bg-white dark:bg-zinc-950 divide-y divide-slate-100 dark:divide-zinc-800/50 max-h-60 overflow-y-auto">
                        {!msg.sources || msg.sources.length === 0 ? (
                          <p className="text-xs text-slate-400 dark:text-slate-500 py-1 italic">
                            No source chunks were matched for this answer
                          </p>
                        ) : (
                          msg.sources.map((src, sIdx) => {
                            const expKey = `${msg.id}-${sIdx}`;
                            const isExpanded = expandedExcerpts[expKey] || false;
                            const isLong = src.excerpt.length > 120;
                            const displayExcerpt = isLong && !isExpanded
                              ? `${src.excerpt.substring(0, 120)}...`
                              : src.excerpt;

                            return (
                              <div key={sIdx} className="py-2.5 first:pt-0 last:pb-0">
                                <div className="flex items-center justify-between text-[11px] font-bold">
                                  <span className="text-slate-800 dark:text-slate-200 truncate max-w-[70%]">
                                    {src.filename}
                                  </span>
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] border ${getScoreColor(
                                      src.relevance_score
                                    )}`}
                                  >
                                    Match: {Math.round(Math.max(0, Math.min(1, src.relevance_score)) * 100)}%
                                  </span>
                                </div>
                                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 italic bg-slate-50/50 dark:bg-zinc-900/30 p-2 rounded border border-slate-100 dark:border-zinc-800/20">
                                  "{displayExcerpt}"
                                </p>
                                {isLong && (
                                  <button
                                    onClick={() => toggleExcerpt(expKey)}
                                    className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 mt-1 cursor-pointer hover:underline"
                                  >
                                    {isExpanded ? "Show less" : "Show more"}
                                  </button>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Pending Assistant Response Loader (Skeleton) */}
            {isLoading && (
              <div className="flex flex-col items-start w-full">
                <div className="max-w-[75%] w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl px-4 py-3 shadow-sm">
                  {/* Show skeleton (3 animated pulse lines, full width) */}
                  <div className="flex flex-col gap-2.5 w-full">
                    <div className="h-3 bg-slate-200 dark:bg-zinc-800 rounded-full animate-pulse w-full" />
                    <div className="h-3 bg-slate-200 dark:bg-zinc-800 rounded-full animate-pulse w-[90%]" />
                    <div className="h-3 bg-slate-200 dark:bg-zinc-800 rounded-full animate-pulse w-[75%]" />
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Tray */}
      <div className="p-4 border-t border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <form onSubmit={handleSubmit} className="relative">
          <div className="flex flex-col gap-1.5">
            <div className="relative flex items-center bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-transparent transition-all">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                maxLength={2000}
                placeholder={
                  documentId === "all"
                    ? "Ask a question globally (across all files)..."
                    : "Ask a question about this document..."
                }
                disabled={isLoading}
                className="w-full py-4 pl-4 pr-14 text-sm bg-transparent border-none focus:outline-none text-slate-800 dark:text-slate-100"
              />
              <button
                type="submit"
                disabled={isLoading}
                className="absolute right-2 p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                {isLoading ? (
                  <IconLoader className="w-5 h-5 animate-spin" />
                ) : (
                  <IconSend className="w-5 h-5" />
                )}
              </button>
            </div>
            
            <div className="flex justify-between items-center px-1">
              {inputError ? (
                <span className="text-xs text-red-500 font-medium">{inputError}</span>
              ) : (
                <div />
              )}
              {/* Show character counter only when length >= 1800 */}
              {inputValue.length >= 1800 && (
                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold ml-auto">
                  {inputValue.length}/2000 characters
                </span>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
