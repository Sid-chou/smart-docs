"use client";

import { useEffect } from "react";
import { IconAlertTriangle, IconRefresh } from "@tabler/icons-react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard component crash caught:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center p-8 border border-red-100 dark:border-red-950 bg-red-50/30 dark:bg-red-950/10 rounded-2xl text-center">
      <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full mb-4">
        <IconAlertTriangle className="w-8 h-8" />
      </div>
      <h3 className="text-xl font-bold text-slate-900 dark:text-slate-50">
        Dashboard module error
      </h3>
      <p className="max-w-md mt-2 text-sm text-slate-500 dark:text-slate-400">
        There was a problem loading this part of your dashboard. Try reloading it or contact support if the issue persists.
      </p>
      <button
        onClick={() => reset()}
        className="mt-5 inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors cursor-pointer"
      >
        <IconRefresh className="w-4 h-4 mr-2" />
        Retry Module
      </button>
    </div>
  );
}
