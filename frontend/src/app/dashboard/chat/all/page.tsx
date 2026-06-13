"use client";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import dynamic from "next/dynamic";

// Dynamic import with SSR disabled to optimize page loading
const ChatInterface = dynamic(
  () => import("@/components/chat/ChatInterface").then((mod) => mod.ChatInterface),
  { ssr: false }
);

export default function GlobalChatPage() {
  return (
    <DashboardLayout>
      <div className="flex h-[calc(100vh-12rem)] border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden shadow-xl max-w-6xl mx-auto">
        <ChatSidebar />
        <div className="flex-1 min-w-0">
          <ChatInterface documentId="all" />
        </div>
      </div>
    </DashboardLayout>
  );
}
