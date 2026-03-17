"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { ROLE_EMOJI, ROLE_LABEL } from "@/lib/types";
import type { Agent, WorkItem, WorkItemStatus, ChatMessage } from "@/lib/types";
import { listAgentChatMessages } from "@/lib/api";
import {
  CheckCircle,
  Play,
  Search,
  Pause,
  Circle,
  User,
  X,
  GitBranch,
  ExternalLink,
  CalendarDays,
  MessageSquare,
} from "lucide-react";

export const workItemStatusIcon = (status: WorkItemStatus) => {
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

export const workItemStatusBadge = (status: WorkItemStatus): "success" | "warning" | "error" | "info" | "default" => {
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

export const priorityColor = (p: string) => {
  switch (p) {
    case "critical": return "text-red-400";
    case "high": return "text-orange-400";
    case "normal": return "text-zinc-400";
    case "low": return "text-zinc-600";
    default: return "text-zinc-500";
  }
};

interface WorkItemDetailProps {
  item: WorkItem;
  agent: Agent | null;
  onClose: () => void;
}

export function WorkItemDetail({ item, agent, onClose }: WorkItemDetailProps) {
  const [agentMessages, setAgentMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  useEffect(() => {
    if (!item.assigned_agent_id) return;
    async function fetchMessages() {
      setMessagesLoading(true);
      const res = await listAgentChatMessages(item.assigned_agent_id!);
      if (res.success && res.data) {
        setAgentMessages(res.data);
      }
      setMessagesLoading(false);
    }
    fetchMessages();
  }, [item.assigned_agent_id]);

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col animate-slide-in-right">
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

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {item.description && (
            <div>
              <label className="text-[10px] uppercase font-semibold text-zinc-500 tracking-wider">Description</label>
              <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">{item.description}</p>
            </div>
          )}

          {agent && (
            <div>
              <label className="text-[10px] uppercase font-semibold text-zinc-500 tracking-wider">Assigned Agent</label>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-base">{ROLE_EMOJI[agent.role]}</span>
                <div>
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{agent.name || ROLE_LABEL[agent.role]}</p>
                  <p className="text-[11px] text-zinc-500">{agent.role.replace(/_/g, " ")}</p>
                </div>
              </div>
            </div>
          )}

          {(item.branch_name || item.pr_url) && (
            <div>
              <label className="text-[10px] uppercase font-semibold text-zinc-500 tracking-wider">Git</label>
              <div className="mt-1.5 space-y-1.5">
                {item.branch_name && (
                  <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                    <GitBranch className="h-3.5 w-3.5 flex-shrink-0" />
                    <code className="text-xs bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded font-mono">{item.branch_name}</code>
                  </div>
                )}
                {item.pr_url && (
                  <a href={item.pr_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-blue-500 hover:text-blue-400 transition-colors">
                    <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
                    View Pull Request
                  </a>
                )}
              </div>
            </div>
          )}

          <div>
            <label className="text-[10px] uppercase font-semibold text-zinc-500 tracking-wider">Timeline</label>
            <div className="mt-1.5 space-y-1">
              <TimelineRow label="Created" date={item.created_at} />
              {item.started_at && <TimelineRow label="Started" date={item.started_at} />}
              {item.completed_at && <TimelineRow label="Completed" date={item.completed_at} />}
              {item.updated_at !== item.created_at && <TimelineRow label="Updated" date={item.updated_at} />}
            </div>
          </div>

          {(item.depends_on.length > 0 || item.blocks.length > 0) && (
            <div>
              <label className="text-[10px] uppercase font-semibold text-zinc-500 tracking-wider">Dependencies</label>
              <div className="mt-1.5 space-y-1 text-xs text-zinc-500">
                {item.depends_on.length > 0 && <p>Depends on: {item.depends_on.length} item{item.depends_on.length > 1 ? "s" : ""}</p>}
                {item.blocks.length > 0 && <p>Blocks: {item.blocks.length} item{item.blocks.length > 1 ? "s" : ""}</p>}
              </div>
            </div>
          )}

          {item.assigned_agent_id && (
            <div>
              <label className="text-[10px] uppercase font-semibold text-zinc-500 tracking-wider flex items-center gap-1.5">
                <MessageSquare className="h-3 w-3" />
                Agent Messages
              </label>
              <div className="mt-2 space-y-2">
                {messagesLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <div className="h-4 w-4 border-2 border-zinc-300 dark:border-zinc-700 border-t-blue-500 rounded-full animate-spin" />
                  </div>
                ) : agentMessages.length === 0 ? (
                  <p className="text-xs text-zinc-400 dark:text-zinc-600 py-2">No messages</p>
                ) : (
                  agentMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`px-3 py-2 rounded-lg text-xs leading-relaxed ${
                        msg.role === "user"
                          ? "bg-blue-600/10 text-blue-300 border border-blue-800/30"
                          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                      }`}
                    >
                      <p className="whitespace-pre-wrap line-clamp-4">{msg.content}</p>
                      <p className="text-[10px] text-zinc-400 dark:text-zinc-600 mt-1">{new Date(msg.created_at).toLocaleTimeString()}</p>
                    </div>
                  ))
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
