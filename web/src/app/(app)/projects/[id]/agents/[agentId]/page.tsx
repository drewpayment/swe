"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ROLE_EMOJI, ROLE_LABEL } from "@/lib/types";
import { ArrowLeft, Cpu, Clock, Zap, Loader2, AlertCircle } from "lucide-react";
import Link from "next/link";
import type { Agent, AgentStatus, WorkItem } from "@/lib/types";
import { getAgent, listWorkItems } from "@/lib/api";

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

const statusBadgeVariant = (status: AgentStatus) => {
  switch (status) {
    case "active": return "success" as const;
    case "idle": return "default" as const;
    case "error": return "error" as const;
    case "initializing": return "warning" as const;
    case "waiting_for_human":
    case "waiting_for_agent": return "info" as const;
    case "complete": return "info" as const;
    default: return "default" as const;
  }
};

export default function AgentDetailPage() {
  const { id, agentId } = useParams();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const projectId = typeof id === "string" ? id : Array.isArray(id) ? id[0] : "";
  const agId = typeof agentId === "string" ? agentId : Array.isArray(agentId) ? agentId[0] : "";

  useEffect(() => {
    async function fetchData() {
      if (!agId) return;
      setLoading(true);
      setError(null);
      try {
        const [agentRes, workRes] = await Promise.all([
          getAgent(agId),
          listWorkItems(projectId),
        ]);

        if (agentRes.success && agentRes.data) {
          setAgent(agentRes.data);
        } else {
          setError(agentRes.error || "Failed to load agent");
        }

        if (workRes.success && workRes.data) {
          // Filter to work items assigned to this agent
          setWorkItems(workRes.data.filter((w) => w.assigned_agent_id === agId));
        }
      } catch {
        setError("Failed to connect to the API");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [agId, projectId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 text-zinc-400 animate-spin" />
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertCircle className="h-10 w-10 text-red-400" />
        <p className="text-sm text-zinc-400">{error || "Agent not found"}</p>
        <Link href={`/projects/${projectId}`} className="text-sm text-blue-400 hover:underline">
          Back to project
        </Link>
      </div>
    );
  }

  const currentWorkItem = workItems.find((w) => w.id === agent.current_work_item_id);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href={`/projects/${projectId}`}
          className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300 mb-3"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to project
        </Link>
        <div className="flex items-center gap-4">
          <span className="text-3xl">{ROLE_EMOJI[agent.role] ?? "🤖"}</span>
          <div>
            <h1 className="text-2xl font-bold text-white">
              {ROLE_LABEL[agent.role] ?? agent.role}
            </h1>
            <p className="text-sm text-zinc-400">{agent.name}</p>
          </div>
          <Badge variant={statusBadgeVariant(agent.status)} className="ml-4">
            {agent.status}
          </Badge>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="flex items-center gap-3">
            <Cpu className="h-5 w-5 text-blue-400" />
            <div>
              <p className="text-lg font-bold text-white">{agent.status}</p>
              <p className="text-xs text-zinc-400">Status</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3">
            <Zap className="h-5 w-5 text-yellow-400" />
            <div>
              <p className="text-lg font-bold text-white">
                {agent.tokens_consumed.toLocaleString()}
              </p>
              <p className="text-xs text-zinc-400">Tokens Used</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3">
            <Clock className="h-5 w-5 text-green-400" />
            <div>
              <p className="text-lg font-bold text-white">{timeAgo(agent.created_at)}</p>
              <p className="text-xs text-zinc-400">Started</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3">
            <Clock className="h-5 w-5 text-purple-400" />
            <div>
              <p className="text-lg font-bold text-white">
                {agent.last_heartbeat ? timeAgo(agent.last_heartbeat) : "N/A"}
              </p>
              <p className="text-xs text-zinc-400">Last Heartbeat</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Current Task */}
      {currentWorkItem ? (
        <Card className="border-blue-800/50 bg-blue-950/20">
          <CardContent>
            <p className="text-xs text-blue-400 font-medium mb-1">CURRENT TASK</p>
            <p className="text-sm text-white">{currentWorkItem.title}</p>
            {currentWorkItem.description && (
              <p className="text-xs text-zinc-400 mt-1">{currentWorkItem.description}</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="border-zinc-800">
          <CardContent>
            <p className="text-xs text-zinc-500 font-medium mb-1">CURRENT TASK</p>
            <p className="text-sm text-zinc-400">No active task assigned</p>
          </CardContent>
        </Card>
      )}

      {/* Work Items */}
      {workItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Assigned Work Items</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {workItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-lg border border-zinc-800 px-4 py-3"
              >
                <div>
                  <p className="text-sm text-zinc-300">{item.title}</p>
                  {item.description && (
                    <p className="text-xs text-zinc-500 mt-0.5">{item.description}</p>
                  )}
                </div>
                <Badge variant={
                  item.status === "complete" ? "success" :
                  item.status === "in_progress" ? "warning" : "default"
                }>
                  {item.status.replace(/_/g, " ")}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Agent Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-zinc-500">Agent ID</p>
              <p className="text-zinc-300 font-mono text-xs">{agent.id}</p>
            </div>
            <div>
              <p className="text-zinc-500">Role</p>
              <p className="text-zinc-300">{ROLE_LABEL[agent.role] ?? agent.role}</p>
            </div>
            <div>
              <p className="text-zinc-500">Project ID</p>
              <p className="text-zinc-300 font-mono text-xs">{agent.project_id || "N/A"}</p>
            </div>
            <div>
              <p className="text-zinc-500">Workflow ID</p>
              <p className="text-zinc-300 font-mono text-xs">{agent.workflow_id || "N/A"}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
