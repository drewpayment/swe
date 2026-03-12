"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ROLE_EMOJI, ROLE_LABEL, PHASE_LABEL } from "@/lib/types";
import type { AgentStatus, Project, Agent, Artifact, WorkItem, ProjectPhase } from "@/lib/types";
import {
  Send,
  FileText,
  GitPullRequest,
  CheckCircle,
  Clock,
  AlertCircle,
  Loader2,
  Bot,
} from "lucide-react";
import Link from "next/link";
import { getProject, listAgents, listArtifacts, listWorkItems, sendMessage } from "@/lib/api";
import { useWebSocket } from "@/lib/ws";

const statusIndicator = (status: AgentStatus) => {
  const colors: Record<AgentStatus, string> = {
    initializing: "bg-yellow-500",
    idle: "bg-gray-500",
    active: "bg-green-500 animate-pulse",
    waiting_for_human: "bg-blue-500 animate-pulse",
    waiting_for_agent: "bg-purple-500",
    complete: "bg-blue-400",
    error: "bg-red-500",
    terminated: "bg-gray-600",
  };
  return colors[status] || "bg-gray-500";
};

const artifactIcon = (type: string) => {
  switch (type) {
    case "pull_request": return <GitPullRequest className="h-4 w-4 text-purple-400" />;
    case "bdr":
    case "test_plan": return <FileText className="h-4 w-4 text-blue-400" />;
    default: return <FileText className="h-4 w-4 text-zinc-400" />;
  }
};

const artifactBadge = (status: string) => {
  switch (status) {
    case "approved": return <Badge variant="success">approved</Badge>;
    case "pending": return <Badge variant="warning">pending</Badge>;
    case "rejected": return <Badge variant="error">rejected</Badge>;
    case "not_required": return <Badge>not required</Badge>;
    default: return <Badge>{status}</Badge>;
  }
};

const phaseVariant: Record<string, "info" | "warning" | "success" | "default"> = {
  planning: "info",
  designing: "info",
  building: "warning",
  testing: "warning",
  deploying: "warning",
  complete: "success",
  archived: "default",
};

export default function ProjectDetailPage() {
  const { id } = useParams();
  const [chatInput, setChatInput] = useState("");
  const [project, setProject] = useState<Project | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const { connected, events } = useWebSocket();

  const projectId = typeof id === "string" ? id : Array.isArray(id) ? id[0] : "";

  useEffect(() => {
    async function fetchData() {
      if (!projectId) return;
      setLoading(true);
      setError(null);
      try {
        const [projRes, agentRes, artifactRes, workRes] = await Promise.all([
          getProject(projectId),
          listAgents(projectId),
          listArtifacts(projectId),
          listWorkItems(projectId),
        ]);

        if (projRes.success && projRes.data) {
          setProject(projRes.data);
        } else {
          setError(projRes.error || "Failed to load project");
        }

        if (agentRes.success && agentRes.data) setAgents(agentRes.data);
        if (artifactRes.success && artifactRes.data) setArtifacts(artifactRes.data);
        if (workRes.success && workRes.data) setWorkItems(workRes.data);
      } catch {
        setError("Failed to connect to the API");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [projectId]);

  useEffect(() => {
    if (events.length === 0) return;
    const latest = events[events.length - 1];
    if (latest.project_id !== projectId) return;

    const relevantTypes = ["agent_status", "artifact_created", "phase_change", "work_item_update"];
    if (relevantTypes.includes(latest.type)) {
      getProject(projectId).then((res) => {
        if (res.success && res.data) setProject(res.data);
      });
      listAgents(projectId).then((res) => {
        if (res.success && res.data) setAgents(res.data);
      });
      listArtifacts(projectId).then((res) => {
        if (res.success && res.data) setArtifacts(res.data);
      });
      listWorkItems(projectId).then((res) => {
        if (res.success && res.data) setWorkItems(res.data);
      });
    }
  }, [events, projectId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 text-zinc-400 animate-spin" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertCircle className="h-10 w-10 text-red-400" />
        <p className="text-sm text-zinc-400">{error || "Project not found"}</p>
        <Link href="/projects" className="text-sm text-blue-400 hover:underline">
          Back to projects
        </Link>
      </div>
    );
  }

  async function handleSendChat() {
    if (!chatInput.trim() || chatSending) return;
    const orchestrator = agents.find((a) => a.role === "project_orchestrator");
    if (!orchestrator) {
      setChatError("No project orchestrator agent available");
      return;
    }
    setChatSending(true);
    setChatError(null);
    const res = await sendMessage(orchestrator.id, chatInput.trim());
    setChatSending(false);
    if (res.success) {
      setChatInput("");
    } else {
      setChatError(res.error || "Failed to send message");
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{project.name}</h1>
          <p className="text-sm text-zinc-400 mt-1">
            {project.description || "No description"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={phaseVariant[project.phase] ?? "default"} className="text-sm px-3 py-1">
            Phase: {PHASE_LABEL[project.phase as ProjectPhase] ?? project.phase}
          </Badge>
          <span
            className={`h-2 w-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`}
            title={connected ? "Live updates connected" : "Live updates disconnected"}
          />
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Agents Sidebar */}
        <div className="col-span-3 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
            Agents
          </h2>
          {agents.length === 0 ? (
            <Card className="p-3">
              <div className="flex flex-col items-center py-4">
                <Bot className="h-8 w-8 text-zinc-600 mb-2" />
                <p className="text-xs text-zinc-500">No agents assigned</p>
              </div>
            </Card>
          ) : (
            <div className="space-y-2">
              {agents.map((agent) => (
                <Link key={agent.id} href={`/projects/${projectId}/agents/${agent.id}`}>
                  <Card className="p-3 cursor-pointer hover:border-zinc-700 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{ROLE_EMOJI[agent.role] ?? "🤖"}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">
                          {ROLE_LABEL[agent.role] ?? agent.role}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={`h-1.5 w-1.5 rounded-full ${statusIndicator(agent.status)}`} />
                          <span className="text-xs text-zinc-500">{agent.status}</span>
                        </div>
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Main Content */}
        <div className="col-span-9 space-y-6">
          {/* Work Items */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Work Items</CardTitle>
            </CardHeader>
            <CardContent>
              {workItems.length === 0 ? (
                <p className="text-sm text-zinc-500 text-center py-4">No work items yet</p>
              ) : (
                <div className="space-y-3">
                  {workItems.map((item) => (
                    <div key={item.id} className="flex items-start gap-3">
                      {item.status === "complete" ? (
                        <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                      ) : item.status === "in_progress" ? (
                        <Clock className="h-4 w-4 text-yellow-400 mt-0.5" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-zinc-400 mt-0.5" />
                      )}
                      <div className="flex-1">
                        <p className="text-sm text-zinc-300">{item.title}</p>
                        {item.description && (
                          <p className="text-xs text-zinc-500 mt-0.5">{item.description}</p>
                        )}
                      </div>
                      <Badge variant={
                        item.status === "complete" ? "success" :
                        item.status === "in_progress" ? "warning" :
                        item.status === "blocked" ? "error" : "default"
                      }>
                        {item.status.replace(/_/g, " ")}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Artifacts */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Artifacts</CardTitle>
            </CardHeader>
            <CardContent>
              {artifacts.length === 0 ? (
                <p className="text-sm text-zinc-500 text-center py-4">No artifacts yet</p>
              ) : (
                <div className="space-y-2">
                  {artifacts.map((artifact) => (
                    <div
                      key={artifact.id}
                      className="flex items-center justify-between rounded-lg border border-zinc-800 px-4 py-3 hover:border-zinc-700 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        {artifactIcon(artifact.artifact_type)}
                        <span className="text-sm text-zinc-300">{artifact.name}</span>
                      </div>
                      {artifactBadge(artifact.approval_status)}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Chat */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Chat</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 mb-4 max-h-64 overflow-y-auto">
                <p className="text-sm text-zinc-500 text-center py-4">
                  Send a message to the project orchestrator
                </p>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Message the orchestrator..."
                  className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSendChat();
                  }}
                />
                <Button size="sm" onClick={handleSendChat} disabled={chatSending || !chatInput.trim()}>
                  {chatSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
              {chatError && (
                <p className="text-xs text-red-400 mt-1">{chatError}</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
