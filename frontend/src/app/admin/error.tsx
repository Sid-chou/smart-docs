"use client";

import { useEffect } from "react";
import { IconLockCode, IconArrowBackUp } from "@tabler/icons-react";
import Link from "next/link";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Admin dashboard crash caught:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center p-8 bg-zinc-900 border border-zinc-800 rounded-2xl text-center max-w-xl mx-auto my-12">
      <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-full mb-4">
        <IconLockCode className="w-10 h-10" />
      </div>
      <h3 className="text-xl font-bold text-slate-100">
        Admin dashboard error
      </h3>
      <p className="mt-2 text-sm text-slate-400">
        The admin panel was unable to compile the metrics or tables. This is often caused by MongoDB pipeline mismatches or authorization limits.
      </p>
      <div className="mt-6 flex gap-4">
        <button
          onClick={() => reset()}
          className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors cursor-pointer"
        >
          Retry Load
        </button>
        <Link
          href="/"
          className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-slate-400 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
        >
          <IconArrowBackUp className="w-4 h-4 mr-2" />
          User Dashboard
        </Link>
      </div>
    </div>
  );
}
