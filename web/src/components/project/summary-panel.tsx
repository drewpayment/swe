// web/src/components/project/summary-panel.tsx
"use client";

import { memo, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { ROLE_EMOJI, ROLE_LABEL } from "@/lib/types";
import type { Project, Agent, Artifact, WorkItem } from "@/lib/types";
import {
  CheckCircle,
  Folder,
  ExternalLink,
  GitPullRequest,
  FileText,
  Clock,
  Users,
  ListChecks,
} from "lucide-react";

interface SummaryPanelProps {
  project: Project;
  agents: Agent[];
  artifacts: Artifact[];
  workItems: WorkItem[];
}

function formatDuration(startIso: string, endIso?: string): string {
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  const diff = Math.max(0, end - start);
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours < 24) return `${hours}h ${remMins}m`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return `${days}d ${remHours}h`;
}

function approvalBadgeVariant(status: string): "success" | "error" | "default" {
  if (status === "approved") return "success";
  if (status === "rejected") return "error";
  return "default";
}

export const SummaryPanel = memo(function SummaryPanel({
  project,
  agents,
  artifacts,
  workItems,
}: SummaryPanelProps) {
  const isComplete = project.phase === "complete";

  const activeAgentCount = useMemo(
    () => agents.filter((a) => a.status !== "terminated" && a.status !== "complete").length,
    [agents]
  );

  const completedItems = useMemo(
    () => workItems.filter((w) => w.status === "complete"),
    [workItems]
  );

  const completionEndTime = useMemo(() => {
    const times = workItems
      .map((w) => w.completed_at)
      .filter((t): t is string => !!t)
      .map((t) => new Date(t).getTime());
    if (times.length > 0) return new Date(Math.max(...times)).toISOString();
    return project.updated_at;
  }, [workItems, project.updated_at]);

  const sortedWorkItems = useMemo(() => {
    return [...workItems].sort((a, b) => {
      if (a.completed_at && b.completed_at) {
        return new Date(a.completed_at).getTime() - new Date(b.completed_at).getTime();
      }
      if (a.completed_at) return -1;
      if (b.completed_at) return 1;
      return 0;
    });
  }, [workItems]);

  return (
    <div className="p-5 space-y-5 overflow-y-auto h-full">
      {/* Completion banner */}
      {isComplete && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900">
          <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-green-800 dark:text-green-300">
              Project Complete
            </p>
            <p className="text-xs text-green-600 dark:text-green-500">
              Completed in {formatDuration(project.created_at, completionEndTime)}
            </p>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-zinc-500 mb-1">
            <ListChecks className="h-3.5 w-3.5" />
            <span className="text-[10px] uppercase font-semibold tracking-wider">Items</span>
          </div>
          <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
            {completedItems.length}/{workItems.length}
          </p>
          {workItems.length > 0 && (
            <p className="text-[10px] text-zinc-500">
              {Math.round((completedItems.length / workItems.length) * 100)}% complete
            </p>
          )}
        </div>

        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-zinc-500 mb-1">
            <Users className="h-3.5 w-3.5" />
            <span className="text-[10px] uppercase font-semibold tracking-wider">Agents</span>
          </div>
          <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
            {activeAgentCount}
          </p>
          <p className="text-[10px] text-zinc-500">
            {isComplete ? "finished" : "active"}
          </p>
        </div>

        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-zinc-500 mb-1">
            <Clock className="h-3.5 w-3.5" />
            <span className="text-[10px] uppercase font-semibold tracking-wider">Duration</span>
          </div>
          <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
            {formatDuration(project.created_at, isComplete ? completionEndTime : undefined)}
          </p>
          <p className="text-[10px] text-zinc-500">
            {isComplete ? "total" : "elapsed"}
          </p>
        </div>
      </div>

      {/* Output location */}
      <div>
        <h4 className="text-[10px] uppercase font-semibold text-zinc-500 tracking-wider mb-2">
          Output Location
        </h4>
        {project.repo_source === "local" && project.working_directory ? (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800">
            <Folder className="h-4 w-4 text-zinc-400 flex-shrink-0" />
            <code className="text-sm text-zinc-700 dark:text-zinc-300 font-mono truncate">
              {project.working_directory}
            </code>
          </div>
        ) : project.repo_source === "remote" && project.repo_url ? (
          <a
            href={project.repo_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
          >
            <ExternalLink className="h-4 w-4 text-blue-500 flex-shrink-0" />
            <span className="text-sm text-blue-500 truncate">{project.repo_url}</span>
          </a>
        ) : (
          <p className="text-sm text-zinc-400 dark:text-zinc-600">No repository configured</p>
        )}
      </div>

      {/* Artifacts */}
      <div>
        <h4 className="text-[10px] uppercase font-semibold text-zinc-500 tracking-wider mb-2">
          Artifacts
        </h4>
        {artifacts.length === 0 ? (
          <p className="text-sm text-zinc-400 dark:text-zinc-600">No artifacts produced yet</p>
        ) : (
          <div className="space-y-1.5">
            {artifacts.map((artifact) => (
              <div
                key={artifact.id}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
              >
                {artifact.artifact_type === "pull_request" ? (
                  <GitPullRequest className="h-4 w-4 text-purple-400 flex-shrink-0" />
                ) : (
                  <FileText className="h-4 w-4 text-zinc-400 flex-shrink-0" />
                )}
                <span className="text-sm text-zinc-700 dark:text-zinc-300 truncate flex-1">
                  {artifact.name}
                </span>
                <Badge variant={approvalBadgeVariant(artifact.approval_status)}>
                  {artifact.approval_status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Work summary (complete mode only) */}
      {isComplete && sortedWorkItems.length > 0 && (
        <div>
          <h4 className="text-[10px] uppercase font-semibold text-zinc-500 tracking-wider mb-2">
            Work Summary
          </h4>
          <div className="space-y-1.5">
            {sortedWorkItems.map((item) => {
              const agent = agents.find((a) => a.id === item.assigned_agent_id);
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
                >
                  <CheckCircle className="h-3.5 w-3.5 text-green-400 flex-shrink-0" />
                  <span className="text-sm text-zinc-700 dark:text-zinc-300 truncate flex-1">
                    {item.title}
                  </span>
                  {agent && (
                    <span className="text-xs text-zinc-500 flex items-center gap-1 flex-shrink-0">
                      <span>{ROLE_EMOJI[agent.role]}</span>
                      <span>{ROLE_LABEL[agent.role]}</span>
                    </span>
                  )}
                  {item.completed_at && (
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-600 flex-shrink-0">
                      {new Date(item.completed_at).toLocaleTimeString()}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});
