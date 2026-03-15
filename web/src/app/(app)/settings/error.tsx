"use client";

import { AlertCircle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function SettingsError({ error, reset }: ErrorProps) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
      <AlertCircle className="h-12 w-12 text-red-500" />
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          Failed to load settings
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {error.message || "An error occurred while loading your settings."}
        </p>
      </div>
      <div className="flex gap-3">
        <Button variant="primary" onClick={reset}>
          Try again
        </Button>
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 transition-colors hover:bg-zinc-200 dark:hover:bg-zinc-700"
        >
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
