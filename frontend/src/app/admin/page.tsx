"use client";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { IconShield } from "@tabler/icons-react";
import dynamic from "next/dynamic";

// Dynamic import with SSR disabled to optimize page loading
const AdminTabs = dynamic(
  () => import("@/components/admin/AdminTabs").then((mod) => mod.AdminTabs),
  { ssr: false }
);

export default function AdminPage() {
  return (
    <DashboardLayout>
      <AdminGuard>
        <div className="space-y-6 max-w-5xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 rounded-2xl">
              <IconShield className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-50">
                Admin Control Center
              </h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm">
                Global overview of user registries, indexing stats, and document allocations.
              </p>
            </div>
          </div>

          <AdminTabs />
        </div>
      </AdminGuard>
    </DashboardLayout>
  );
}
