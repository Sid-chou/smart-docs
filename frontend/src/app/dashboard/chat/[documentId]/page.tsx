import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { ChatInterface } from "@/components/chat/ChatInterface";

interface ChatPageProps {
  params: Promise<{ documentId: string }>;
}

export default async function DocumentChatPage({ params }: ChatPageProps) {
  const resolvedParams = await params;
  return (
    <DashboardLayout>
      <div className="flex h-[calc(100vh-12rem)] border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden shadow-xl max-w-6xl mx-auto">
        <ChatSidebar />
        <div className="flex-1 min-w-0">
          <ChatInterface documentId={resolvedParams.documentId} />
        </div>
      </div>
    </DashboardLayout>
  );
}
