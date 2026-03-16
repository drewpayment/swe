"use client";

import { memo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ROLE_EMOJI, ROLE_LABEL } from "@/lib/types";
import type { Agent, WorkItem, WorkItemStatus } from "@/lib/types";
import {
  CheckCircle,
  Clock,
  Play,
  Search,
  Pause,
  Circle,
  User,
  X,
  GitBranch,
  ExternalLink,
  CalendarDays,
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

const KANBAN_ROW_1: { key: WorkItemStatus; label: string; color: string }[] = [
  { key: "pending", label: "Backlog", color: "border-zinc-700" },
  { key: "assigned", label: "Assigned", color: "border-yellow-700" },
];

const KANBAN_ROW_2: { key: WorkItemStatus; label: string; color: string }[] = [
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
  const [selectedItem, setSelectedItem] = useState<WorkItem | null>(null);

  function renderColumn(col: { key: WorkItemStatus; label: string; color: string }) {
    const items = workItems.filter((w) => w.status === col.key);
    return (
      <div
        key={col.key}
        className={`h-full min-w-0 rounded-lg border ${col.color} bg-zinc-50/50 dark:bg-zinc-900/50 p-2 flex flex-col`}
      >
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            {col.label}
          </span>
          <span className="text-xs text-zinc-400 dark:text-zinc-600">
            {items.length}
          </span>
        </div>
        <div className="space-y-1.5 flex-1 overflow-y-auto">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => setSelectedItem(item)}
              className="w-full text-left rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2 min-h-[44px] hover:border-zinc-400 dark:hover:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 transition-colors cursor-pointer"
            >
              <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300 leading-snug">
                {item.title}
              </p>
              <div className="flex items-center justify-between mt-1.5">
                <span
                  className={`text-[10px] uppercase font-medium ${priorityColor(item.priority)}`}
                >
                  {item.priority}
                </span>
                {item.assigned_agent_id && (
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-600">
                    {ROLE_EMOJI[agents.find((a) => a.id === item.assigned_agent_id)?.role ?? "coder"] ?? "🤖"}
                  </span>
                )}
              </div>
            </button>
          ))}
          {items.length === 0 && (
            <p className="text-[10px] text-zinc-400 dark:text-zinc-700 text-center py-3">
              —
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 flex flex-col gap-3 h-full">
      {/* View toggle */}
      <div className="flex items-center justify-end flex-shrink-0">
        <div className="flex items-center gap-1 rounded-lg bg-zinc-100/50 dark:bg-zinc-800/50 p-0.5">
          <button
            onClick={() => onViewModeChange("kanban")}
            className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
              viewMode === "kanban"
                ? "bg-blue-600 text-white"
                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
            }`}
          >
            Board
          </button>
          <button
            onClick={() => onViewModeChange("list")}
            className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
              viewMode === "list"
                ? "bg-blue-600 text-white"
                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
            }`}
          >
            List
          </button>
        </div>
      </div>

      {workItems.length === 0 ? (
        <div className="text-center py-8">
          <Clock className="h-8 w-8 text-zinc-400 dark:text-zinc-700 mx-auto mb-2" />
          <p className="text-sm text-zinc-500">
            Waiting for orchestrator to create work items...
          </p>
          <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-1">
            The project orchestrator will analyze your brief and create tasks
          </p>
        </div>
      ) : viewMode === "kanban" ? (
        <div className="grid grid-cols-6 grid-rows-2 gap-3 flex-1 min-h-0">
          {/* Row 1: Backlog (3 cols) + Assigned (3 cols) */}
          {KANBAN_ROW_1.map((col) => (
            <div key={col.key} className="col-span-3">
              {renderColumn(col)}
            </div>
          ))}
          {/* Row 2: In Progress (2 cols) + Review (2 cols) + Done (2 cols) */}
          {KANBAN_ROW_2.map((col) => (
            <div key={col.key} className="col-span-2">
              {renderColumn(col)}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {workItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setSelectedItem(item)}
              className="w-full flex items-center gap-3 rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-2 hover:border-zinc-400 dark:hover:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 transition-colors cursor-pointer"
            >
              {workItemStatusIcon(item.status)}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-zinc-700 dark:text-zinc-300 truncate">
                  {item.title}
                </p>
                {item.description && (
                  <p className="text-xs text-zinc-400 dark:text-zinc-600 truncate mt-0.5">
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
                <span className="text-xs text-zinc-400 dark:text-zinc-600">
                  {ROLE_EMOJI[agents.find((a) => a.id === item.assigned_agent_id)?.role ?? "coder"]}
                </span>
              )}
              <Badge variant={workItemStatusBadge(item.status)}>
                {item.status.replace(/_/g, " ")}
              </Badge>
            </button>
          ))}
        </div>
      )}

      {/* Work Item Detail Panel */}
      {selectedItem && (
        <WorkItemDetail
          item={selectedItem}
          agent={agents.find((a) => a.id === selectedItem.assigned_agent_id) ?? null}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </div>
  );
});

/* ─── Work Item Detail Panel ─── */

function WorkItemDetail({
  item,
  agent,
  onClose,
}: {
  item: WorkItem;
  agent: Agent | null;
  onClose: () => void;
}) {
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {workItemStatusIcon(item.status)}
              <Badge variant={workItemStatusBadge(item.status)}>
                {item.status.replace(/_/g, " ")}
              </Badge>
              <span className={`text-[10px] uppercase font-semibold ${priorityColor(item.priority)}`}>
                {item.priority}
              </span>
            </div>
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              {item.title}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Description */}
          {item.description && (
            <div>
              <label className="text-[10px] uppercase font-semibold text-zinc-500 tracking-wider">
                Description
              </label>
              <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                {item.description}
              </p>
            </div>
          )}

          {/* Assigned Agent */}
          {agent && (
            <div>
              <label className="text-[10px] uppercase font-semibold text-zinc-500 tracking-wider">
                Assigned Agent
              </label>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-base">{ROLE_EMOJI[agent.role]}</span>
                <div>
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    {agent.name || ROLE_LABEL[agent.role]}
                  </p>
                  <p className="text-[11px] text-zinc-500">{agent.role.replace(/_/g, " ")}</p>
                </div>
              </div>
            </div>
          )}

          {/* Branch / PR */}
          {(item.branch_name || item.pr_url) && (
            <div>
              <label className="text-[10px] uppercase font-semibold text-zinc-500 tracking-wider">
                Git
              </label>
              <div className="mt-1.5 space-y-1.5">
                {item.branch_name && (
                  <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                    <GitBranch className="h-3.5 w-3.5 flex-shrink-0" />
                    <code className="text-xs bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded font-mono">
                      {item.branch_name}
                    </code>
                  </div>
                )}
                {item.pr_url && (
                  <a
                    href={item.pr_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-blue-500 hover:text-blue-400 transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
                    View Pull Request
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Timestamps */}
          <div>
            <label className="text-[10px] uppercase font-semibold text-zinc-500 tracking-wider">
              Timeline
            </label>
            <div className="mt-1.5 space-y-1">
              <TimelineRow label="Created" date={item.created_at} />
              {item.started_at && <TimelineRow label="Started" date={item.started_at} />}
              {item.completed_at && <TimelineRow label="Completed" date={item.completed_at} />}
              {item.updated_at !== item.created_at && (
                <TimelineRow label="Updated" date={item.updated_at} />
              )}
            </div>
          </div>

          {/* Dependencies */}
          {(item.depends_on.length > 0 || item.blocks.length > 0) && (
            <div>
              <label className="text-[10px] uppercase font-semibold text-zinc-500 tracking-wider">
                Dependencies
              </label>
              <div className="mt-1.5 space-y-1 text-xs text-zinc-500">
                {item.depends_on.length > 0 && (
                  <p>Depends on: {item.depends_on.length} item{item.depends_on.length > 1 ? "s" : ""}</p>
                )}
                {item.blocks.length > 0 && (
                  <p>Blocks: {item.blocks.length} item{item.blocks.length > 1 ? "s" : ""}</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function TimelineRow({ label, date }: { label: string; date: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-zinc-500">
      <CalendarDays className="h-3 w-3 flex-shrink-0 text-zinc-400" />
      <span className="text-zinc-600 dark:text-zinc-400 font-medium">{label}:</span>
      <span>{new Date(date).toLocaleString()}</span>
    </div>
  );
}
