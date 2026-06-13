"use client";

import React, { useEffect, useState } from "react";
import { useAuthStore } from "@/lib/stores/auth";
import { IconShieldOff, IconArrowLeft } from "@tabler/icons-react";
import Link from "next/link";

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuthStore();
  const [hasChecked, setHasChecked] = useState(false);

  useEffect(() => {
    if (isAuthenticated !== undefined) {
      setHasChecked(true);
    }
  }, [isAuthenticated]);

  if (!hasChecked) {
    return null; // Let main shell layout loaders handle the hydration phase
  }

  if (!isAuthenticated || !user?.is_admin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center max-w-md mx-auto">
        <div className="p-4 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 rounded-3xl mb-5 border border-red-100 dark:border-red-900/50">
          <IconShieldOff className="w-12 h-12" />
        </div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-slate-50 tracking-tight">
          Access Denied (403)
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
          You do not have the administrator privileges required to access global platform configurations and user metrics.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 flex items-center gap-2 py-2.5 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md transition-colors cursor-pointer"
        >
          <IconArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
