"use client";

import { AlertCircle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AppError({ error, reset }: ErrorProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950">
      <div className="flex max-w-md flex-col items-center gap-6 text-center">
        <AlertCircle className="h-12 w-12 text-red-500" />
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold text-zinc-100">
            Something went wrong
          </h1>
          <p className="text-sm text-zinc-400">
            {error.message || "An unexpected error occurred. Please try again."}
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="primary" onClick={reset}>
            Try again
          </Button>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-700"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
