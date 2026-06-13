import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { UploadZone } from "@/components/documents/UploadZone";
import { DocumentList } from "@/components/documents/DocumentList";

export default function DashboardPage() {
  return (
    <DashboardLayout>
      <div className="space-y-8 max-w-5xl mx-auto">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-slate-50">
            Document Repository
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2">
            Upload text, PDF, or Word files to index them into ChromaDB for AI Q&A context queries.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8">
          <div>
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
              Add New Knowledge Source
            </h2>
            <UploadZone />
          </div>

          <div>
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
              Indexed Documents & Statuses
            </h2>
            <DocumentList />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
