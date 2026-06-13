import Link from "next/link";
import { IconFileText, IconArrowLeft } from "@tabler/icons-react";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-4 text-center">
      <div className="p-4 bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 rounded-full mb-6">
        <IconFileText className="w-12 h-12" />
      </div>
      <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50 sm:text-4xl">
        Page Not Found
      </h1>
      <p className="max-w-md mt-3 text-lg text-slate-500 dark:text-slate-400">
        We couldn't find the page you're looking for. It might have been moved or deleted.
      </p>
      <div className="mt-8">
        <Link
          href="/"
          className="inline-flex items-center justify-center px-5 py-3 text-base font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors"
        >
          <IconArrowLeft className="w-5 h-5 mr-2" />
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
