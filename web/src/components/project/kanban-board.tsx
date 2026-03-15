"use client";

import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ROLE_EMOJI } from "@/lib/types";
import type { Agent, WorkItem, WorkItemStatus } from "@/lib/types";
import {
  CheckCircle,
  Clock,
  Play,
  Search,
  Pause,
  Circle,
  User,
} from "lucide-react";

/* ─── Work item helpers ─── */

const workItemStatusIcon = (status: WorkItemStatus) => {
  switch (status) {
    case "complete":
      return <CheckCircle className="h-4 w-4 text-green-400" />;
    case "in_progress":
      return <Play className="h-4 w-4 text-blue-400" />;
    case "in_review":
      return <Search className="h-4 w-4 text-purple-400" />;
    case "assigned":
      return <User className="h-4 w-4 text-yellow-400" />;
    case "blocked":
      return <Pause className="h-4 w-4 text-red-400" />;
    case "cancelled":
      return <Circle className="h-4 w-4 text-zinc-600" />;
    default:
      return <Circle className="h-4 w-4 text-zinc-500" />;
  }
};

const workItemStatusBadge = (status: WorkItemStatus): "success" | "warning" | "error" | "info" | "default" => {
  const variants: Record<string, "success" | "warning" | "error" | "info" | "default"> = {
    complete: "success",
    in_progress: "info",
    in_review: "warning",
    assigned: "warning",
    blocked: "error",
    pending: "default",
    cancelled: "default",
  };
  return variants[status] || "default";
};

const priorityColor = (p: string) => {
  switch (p) {
    case "critical": return "text-red-400";
    case "high": return "text-orange-400";
    case "normal": return "text-zinc-400";
    case "low": return "text-zinc-600";
    default: return "text-zinc-500";
  }
};

const KANBAN_COLUMNS: { key: WorkItemStatus; label: string; color: string }[] = [
  { key: "pending", label: "Backlog", color: "border-zinc-700" },
  { key: "assigned", label: "Assigned", color: "border-yellow-700" },
  { key: "in_progress", label: "In Progress", color: "border-blue-700" },
  { key: "in_review", label: "Review", color: "border-purple-700" },
  { key: "complete", label: "Done", color: "border-green-700" },
];

interface KanbanBoardProps {
  workItems: WorkItem[];
  agents: Agent[];
  viewMode: "kanban" | "list";
  onViewModeChange: (mode: "kanban" | "list") => void;
}

export const KanbanBoard = memo(function KanbanBoard({
  workItems,
  agents,
  viewMode,
  onViewModeChange,
}: KanbanBoardProps) {
  const totalCount = workItems.length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            Work Items
            {totalCount > 0 && (
              <span className="ml-2 text-xs font-normal text-zinc-500">
                {totalCount} total
              </span>
            )}
          </CardTitle>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={viewMode === "kanban" ? "primary" : "ghost"}
              className="h-6 px-2 text-xs"
              onClick={() => onViewModeChange("kanban")}
            >
              Board
            </Button>
            <Button
              size="sm"
              variant={viewMode === "list" ? "primary" : "ghost"}
              className="h-6 px-2 text-xs"
              onClick={() => onViewModeChange("list")}
            >
              List
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {workItems.length === 0 ? (
          <div className="text-center py-8">
            <Clock className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
            <p className="text-sm text-zinc-500">
              Waiting for orchestrator to create work items...
            </p>
            <p className="text-xs text-zinc-600 mt-1">
              The project orchestrator will analyze your brief and create tasks
            </p>
          </div>
        ) : viewMode === "kanban" ? (
          <div className="flex flex-col gap-3 md:flex-row md:overflow-x-auto pb-2">
            {KANBAN_COLUMNS.map((col) => {
              const items = workItems.filter((w) => w.status === col.key);
              return (
                <div
                  key={col.key}
                  className={`flex-1 md:min-w-[160px] rounded-lg border ${col.color} bg-zinc-900/50 p-2`}
                >
                  <div className="flex items-center justify-between mb-2 px-1">
                    <span className="text-xs font-medium text-zinc-400">
                      {col.label}
                    </span>
                    <span className="text-xs text-zinc-600">
                      {items.length}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {items.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-md border border-zinc-800 bg-zinc-900 p-2 min-h-[44px] hover:border-zinc-700 transition-colors"
                      >
                        <p className="text-xs font-medium text-zinc-300 leading-snug">
                          {item.title}
                        </p>
                        <div className="flex items-center justify-between mt-1.5">
                          <span
                            className={`text-[10px] uppercase font-medium ${priorityColor(item.priority)}`}
                          >
                            {item.priority}
                          </span>
                          {item.assigned_agent_id && (
                            <span className="text-[10px] text-zinc-600">
                              {ROLE_EMOJI[agents.find((a) => a.id === item.assigned_agent_id)?.role ?? "coder"] ?? "🤖"}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                    {items.length === 0 && (
                      <p className="text-[10px] text-zinc-700 text-center py-3">
                        —
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2">
            {workItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-lg border border-zinc-800 px-3 py-2 hover:border-zinc-700 transition-colors"
              >
                {workItemStatusIcon(item.status)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-300 truncate">
                    {item.title}
                  </p>
                  {item.description && (
                    <p className="text-xs text-zinc-600 truncate mt-0.5">
                      {item.description}
                    </p>
                  )}
                </div>
                <span
                  className={`text-[10px] uppercase font-medium ${priorityColor(item.priority)}`}
                >
                  {item.priority}
                </span>
                {item.assigned_agent_id && (
                  <span className="text-xs text-zinc-600">
                    {ROLE_EMOJI[agents.find((a) => a.id === item.assigned_agent_id)?.role ?? "coder"]}
                  </span>
                )}
                <Badge variant={workItemStatusBadge(item.status)}>
                  {item.status.replace(/_/g, " ")}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
});
