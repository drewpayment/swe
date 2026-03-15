import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

type BadgeVariant = "default" | "success" | "warning" | "error" | "info";

const variants: Record<BadgeVariant, string> = {
  default: "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300",
  success: "bg-green-100/50 dark:bg-green-900/50 text-green-700 dark:text-green-400 border-green-300 dark:border-green-800",
  warning: "bg-yellow-100/50 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-400 border-yellow-300 dark:border-yellow-800",
  error: "bg-red-100/50 dark:bg-red-900/50 text-red-700 dark:text-red-400 border-red-300 dark:border-red-800",
  info: "bg-blue-100/50 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-800",
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-transparent px-2.5 py-0.5 text-xs font-medium",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
