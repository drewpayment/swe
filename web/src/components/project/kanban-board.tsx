"use client";

import { memo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ROLE_EMOJI } from "@/lib/types";
import type { Agent, WorkItem, WorkItemStatus } from "@/lib/types";
import { Clock } from "lucide-react";
import { WorkItemDetail, workItemStatusIcon, workItemStatusBadge, priorityColor } from "./work-item-detail";

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
        <div className="space-y-1">
          {STATUS_GROUPS.map((group) => {
            const items = workItems.filter((w) => w.status === group.key);
            if (items.length === 0) return null;
            return (
              <div key={group.key}>
                {/* Status group divider */}
                <div className="flex items-center gap-2 px-1 pt-2 pb-1">
                  <span className="text-[10px] uppercase font-semibold text-zinc-500 tracking-wider">
                    {group.label}
                  </span>
                  <span className="text-[10px] text-zinc-600">{items.length}</span>
                  <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-800" />
                </div>
                {items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSelectedItem(item)}
                    className="w-full flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 transition-colors cursor-pointer"
                  >
                    {workItemStatusIcon(item.status)}
                    <div className="flex-1 min-w-0 text-left">
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
                  </button>
                ))}
              </div>
            );
          })}
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

/* Status group order for list view */
const STATUS_GROUPS: { key: WorkItemStatus; label: string }[] = [
  { key: "in_progress", label: "In Progress" },
  { key: "assigned", label: "Assigned" },
  { key: "pending", label: "Backlog" },
  { key: "in_review", label: "Review" },
  { key: "complete", label: "Done" },
  { key: "blocked", label: "Blocked" },
  { key: "cancelled", label: "Cancelled" },
];
