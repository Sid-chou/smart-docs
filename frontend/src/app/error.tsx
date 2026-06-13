"use client";

import { useEffect } from "react";
import { IconAlertCircle, IconRotateClockwise } from "@tabler/icons-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global crash handler caught:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-4 text-center">
      <div className="p-4 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 rounded-full mb-6">
        <IconAlertCircle className="w-12 h-12" />
      </div>
      <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50 sm:text-4xl">
        Something went wrong
      </h1>
      <p className="max-w-md mt-3 text-lg text-slate-500 dark:text-slate-400">
        SmartDocs AI encountered an unexpected error. Don't worry, your files and discussions are safe.
      </p>
      <div className="mt-8 flex gap-4">
        <button
          onClick={() => reset()}
          className="inline-flex items-center justify-center px-5 py-3 text-base font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors cursor-pointer"
        >
          <IconRotateClockwise className="w-5 h-5 mr-2" />
          Try Again
        </button>
        <button
          onClick={() => (window.location.href = "/")}
          className="inline-flex items-center justify-center px-5 py-3 text-base font-medium text-indigo-600 dark:text-indigo-400 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-lg transition-colors cursor-pointer"
        >
          Go to Home
        </button>
      </div>
    </div>
  );
}
