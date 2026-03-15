"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ROLE_EMOJI, ROLE_LABEL, PHASE_LABEL } from "@/lib/types";
import type {
  AgentRole,
  AgentStatus,
  ChatMessage,
  Notification,
  Project,
  Agent,
  Artifact,
  WorkItem,
  ProjectPhase,
  WorkItemStatus,
} from "@/lib/types";
import {
  Send,
  FileText,
  GitPullRequest,
  CheckCircle,
  Clock,
  AlertCircle,
  Loader2,
  Bot,
  Plus,
  Trash2,
  RefreshCw,
  Circle,
  ArrowRight,
  Search,
  Pause,
  Play,
  User,
  Zap,
  Inbox,
  CheckCheck,
} from "lucide-react";
import Link from "next/link";
import {
  getProject,
  listAgents,
  listArtifacts,
  listWorkItems,
  sendMessage,
  createAgent,
  deleteAgent,
  cleanupStaleAgents,
  listChatMessages,
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/api";
import { useWebSocket } from "@/lib/ws";

/* ─── Status helpers ─── */

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

const workItemStatusIcon = (status: WorkItemStatus) => {
  switch (status) {
    case "complete":
      return <CheckCircle className="h-4 w-4 text-emerald-400" />;
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

const workItemStatusBadge = (status: WorkItemStatus) => {
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

const phaseVariant: Record<string, "info" | "warning" | "success" | "default"> = {
  planning: "info",
  designing: "info",
  building: "warning",
  testing: "warning",
  deploying: "warning",
  complete: "success",
  archived: "default",
};

const SPAWNABLE_ROLES: { role: AgentRole; label: string }[] = [
  { role: "architect", label: "Architect" },
  { role: "coder", label: "Coder" },
  { role: "sdet", label: "SDET" },
  { role: "security", label: "Security" },
  { role: "sre", label: "SRE" },
  { role: "devops", label: "DevOps" },
];

/* ─── Kanban columns ─── */
const KANBAN_COLUMNS: { key: WorkItemStatus; label: string; color: string }[] = [
  { key: "pending", label: "Backlog", color: "border-zinc-700" },
  { key: "assigned", label: "Assigned", color: "border-yellow-700" },
  { key: "in_progress", label: "In Progress", color: "border-blue-700" },
  { key: "in_review", label: "Review", color: "border-purple-700" },
  { key: "complete", label: "Done", color: "border-emerald-700" },
];

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
  const [chatMessages, setChatMessages] = useState<
    { from: string; content: string; time: string; role: string }[]
  >([]);
  const [targetAgentId, setTargetAgentId] = useState<string>("");
  const [spawning, setSpawning] = useState(false);
  const [showSpawnMenu, setShowSpawnMenu] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
  const [activeTab, setActiveTab] = useState<"board" | "inbox" | "chat">("board");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [inboxReplyInput, setInboxReplyInput] = useState("");
  const [inboxReplySending, setInboxReplySending] = useState(false);
  const [inboxReplyError, setInboxReplyError] = useState<string | null>(null);
  const markReadCooldownRef = useRef<number>(0);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const { connected, events } = useWebSocket();

  const projectId = typeof id === "string" ? id : Array.isArray(id) ? id[0] : "";

  const activeAgents = agents.filter(
    (a) => a.status !== "terminated" && a.status !== "complete"
  );
  const staleAgents = agents.filter(
    (a) => a.status === "terminated" || a.status === "complete"
  );

  const refreshAll = useCallback(async () => {
    if (!projectId) return;
    const [projRes, agentRes, artifactRes, workRes] = await Promise.all([
      getProject(projectId),
      listAgents(projectId),
      listArtifacts(projectId),
      listWorkItems(projectId),
    ]);
    if (projRes.success && projRes.data) setProject(projRes.data);
    if (agentRes.success && agentRes.data) setAgents(agentRes.data);
    if (artifactRes.success && artifactRes.data) setArtifacts(artifactRes.data);
    if (workRes.success && workRes.data) setWorkItems(workRes.data);
  }, [projectId]);

  useEffect(() => {
    async function fetchData() {
      if (!projectId) return;
      setLoading(true);
      setError(null);
      try {
        await refreshAll();

        const msgRes = await listChatMessages(projectId);
        if (msgRes.success && msgRes.data) {
          setChatMessages(
            msgRes.data.map((m: ChatMessage) => ({
              from:
                m.role === "user"
                  ? "You"
                  : m.role === "system"
                    ? "System"
                    : "Agent",
              content: m.content,
              time: new Date(m.created_at).toLocaleTimeString(),
              role: m.role,
            }))
          );
        }

        // Set default target agent
        const agentRes = await listAgents(projectId);
        if (agentRes.success && agentRes.data) {
          const active = agentRes.data.filter(
            (a) => a.status !== "terminated" && a.status !== "complete"
          );
          const orch = active.find((a) => a.role === "project_orchestrator");
          if ((orch || active[0]) && !targetAgentId) {
            setTargetAgentId((orch || active[0]).id);
          }
        }
      } catch {
        setError("Failed to connect to the API");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [projectId]);

  // WebSocket event handling
  useEffect(() => {
    if (events.length === 0) return;
    const latest = events[events.length - 1];
    if (latest.project_id !== projectId) return;

    if (latest.type === "chat_message") {
      setChatMessages((prev) => [
        ...prev,
        {
          from: String(latest.agent_name || "Agent"),
          content: String(latest.content || ""),
          time: new Date().toLocaleTimeString(),
          role: "assistant",
        },
      ]);
    }

    const refreshTypes = [
      "agent_status",
      "artifact_created",
      "phase_change",
      "work_item_update",
    ];
    if (refreshTypes.includes(latest.type)) {
      refreshAll();
    }
  }, [events, projectId, refreshAll]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Periodic refresh every 15s for autonomous updates
  useEffect(() => {
    const interval = setInterval(refreshAll, 15000);
    return () => clearInterval(interval);
  }, [refreshAll]);

  // Fetch notifications for inbox tab (respects cooldown after mark-read)
  const fetchNotifications = useCallback(async () => {
    if (!projectId) return;
    if (Date.now() < markReadCooldownRef.current) return;
    const res = await listNotifications(projectId);
    if (res.success && res.data) setNotifications(res.data);
  }, [projectId]);

  useEffect(() => {
    if (activeTab === "inbox") {
      setNotificationsLoading(true);
      fetchNotifications().finally(() => setNotificationsLoading(false));
      const interval = setInterval(fetchNotifications, 15000);
      return () => clearInterval(interval);
    }
  }, [activeTab, fetchNotifications]);

  async function handleMarkRead(notifId: string) {
    // Optimistically update local state immediately
    setNotifications((prev) =>
      prev.map((n) => (n.id === notifId ? { ...n, read: true } : n))
    );
    // Set cooldown to prevent poll from overwriting optimistic update
    markReadCooldownRef.current = Date.now() + 3000;
    await markNotificationRead(notifId);
  }

  async function handleMarkAllRead() {
    // Optimistically update local state immediately
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    markReadCooldownRef.current = Date.now() + 3000;
    await markAllNotificationsRead(projectId);
  }

  async function handleInboxReply() {
    if (!inboxReplyInput.trim() || inboxReplySending) return;
    const orchestrator = agents.find((a) => a.role === "project_orchestrator" && a.status !== "terminated" && a.status !== "complete");
    if (!orchestrator) {
      setInboxReplyError("No active orchestrator agent to reply to");
      return;
    }
    setInboxReplySending(true);
    setInboxReplyError(null);
    const msg = inboxReplyInput.trim();
    const res = await sendMessage(orchestrator.id, msg);
    setInboxReplySending(false);
    if (res.success) {
      setChatMessages((prev) => [
        ...prev,
        {
          from: "You \u2192 Cosmo",
          content: msg,
          time: new Date().toLocaleTimeString(),
          role: "user",
        },
      ]);
      setInboxReplyInput("");
    } else {
      setInboxReplyError(res.error || "Failed to send reply");
    }
  }

  async function handleSpawnAgent(role: AgentRole, label: string) {
    setSpawning(true);
    setShowSpawnMenu(false);
    const res = await createAgent({ name: label, role, project_id: projectId });
    if (res.success) await refreshAll();
    setSpawning(false);
  }

  async function handleCleanup() {
    setCleaning(true);
    await cleanupStaleAgents(projectId);
    await refreshAll();
    setCleaning(false);
  }

  async function handleDeleteAgent(agentId: string) {
    await deleteAgent(agentId);
    await refreshAll();
    if (targetAgentId === agentId) {
      const active = agents.filter(
        (a) => a.status !== "terminated" && a.status !== "complete" && a.id !== agentId
      );
      setTargetAgentId(active[0]?.id || "");
    }
  }

  async function handleSendChat() {
    if (!chatInput.trim() || chatSending) return;
    if (!targetAgentId) {
      setChatError("No agents available to message");
      return;
    }
    setChatSending(true);
    setChatError(null);
    const msg = chatInput.trim();
    const res = await sendMessage(targetAgentId, msg);
    setChatSending(false);
    if (res.success) {
      const agent = activeAgents.find((a) => a.id === targetAgentId);
      setChatMessages((prev) => [
        ...prev,
        {
          from: "You → " + (agent ? ROLE_LABEL[agent.role] ?? agent.name : "Agent"),
          content: msg,
          time: new Date().toLocaleTimeString(),
          role: "user",
        },
      ]);
      setChatInput("");
    } else {
      setChatError(res.error || "Failed to send message");
    }
  }

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

  const completedCount = workItems.filter((w) => w.status === "complete").length;
  const totalCount = workItems.length;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">{project.name}</h1>
          <p className="text-sm text-zinc-400 mt-1">
            {project.description || "No description"}
          </p>
          {totalCount > 0 && (
            <div className="flex items-center gap-3 mt-2">
              <div className="flex-1 max-w-xs h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <span className="text-xs text-zinc-500">
                {completedCount}/{totalCount} items ({progressPct}%)
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Badge
            variant={phaseVariant[project.phase] ?? "default"}
            className="text-sm px-3 py-1"
          >
            Phase: {PHASE_LABEL[project.phase as ProjectPhase] ?? project.phase}
          </Badge>
          {project.repo_source === "remote" && project.repo_url ? (
            <Badge variant="default" className="text-xs px-2 py-0.5 bg-zinc-800 text-zinc-300 border-zinc-700">
              {"\uD83D\uDD17"} {project.repo_url}
            </Badge>
          ) : project.repo_source === "local" && project.working_directory ? (
            <Badge variant="default" className="text-xs px-2 py-0.5 bg-zinc-800 text-zinc-300 border-zinc-700">
              {"\uD83D\uDCC1"} {project.working_directory}
            </Badge>
          ) : (
            <Badge variant="warning" className="text-xs px-2 py-0.5">
              {"\u26A0\uFE0F"} No repo
            </Badge>
          )}
          <span className="flex items-center" title={connected ? "Live updates connected" : "Disconnected"}>
            <span className={`h-2 w-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`} />
            <span className="sr-only">{connected ? "Connected" : "Disconnected"}</span>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Agents Sidebar */}
        <div className="col-span-3 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
              Agents ({activeAgents.length})
            </h2>
            <div className="relative">
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0"
                onClick={() => setShowSpawnMenu(!showSpawnMenu)}
                disabled={spawning}
                title="Add agent"
                aria-label="Add agent"
                aria-expanded={showSpawnMenu}
              >
                {spawning ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
              </Button>
              {showSpawnMenu && (
                <div className="absolute right-0 top-8 z-10 w-40 rounded-lg border border-zinc-700 bg-zinc-900 shadow-lg py-1">
                  {SPAWNABLE_ROLES.map((r) => (
                    <button
                      key={r.role}
                      className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
                      onClick={() => handleSpawnAgent(r.role, r.label)}
                    >
                      {ROLE_EMOJI[r.role]} {r.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {activeAgents.length === 0 && staleAgents.length === 0 ? (
            <Card className="p-3">
              <div className="flex flex-col items-center py-4">
                <Bot className="h-8 w-8 text-zinc-600 mb-2" />
                <p className="text-xs text-zinc-500">No agents assigned</p>
              </div>
            </Card>
          ) : (
            <div className="space-y-2">
              {activeAgents.map((agent) => (
                <Link
                  key={agent.id}
                  href={`/projects/${projectId}/agents/${agent.id}`}
                >
                  <Card className="p-3 cursor-pointer hover:border-zinc-600 transition-colors group">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <span className="text-lg">
                          {ROLE_EMOJI[agent.role] ?? "🤖"}
                        </span>
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-zinc-900 ${statusIndicator(agent.status)}`}
                          title={agent.status.replace(/_/g, " ")}
                        >
                          <span className="sr-only">{agent.status.replace(/_/g, " ")}</span>
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">
                          {ROLE_LABEL[agent.role] ?? agent.role}
                        </p>
                        <p className="text-xs text-zinc-500 capitalize">
                          {agent.status.replace(/_/g, " ")}
                        </p>
                      </div>
                      {agent.status === "active" && (
                        <Zap className="h-3 w-3 text-green-400 animate-pulse" />
                      )}
                    </div>
                    {/* Show current work item if assigned */}
                    {agent.current_work_item_id && (
                      <div className="mt-2 pl-8">
                        <p className="text-xs text-zinc-600 truncate">
                          Working on:{" "}
                          {workItems.find(
                            (w) => w.id === agent.current_work_item_id
                          )?.title ?? "..."}
                        </p>
                      </div>
                    )}
                  </Card>
                </Link>
              ))}

              {staleAgents.length > 0 && (
                <div className="pt-2 border-t border-zinc-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-zinc-600">
                      {staleAgents.length} inactive
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-5 px-1.5 text-xs text-zinc-600 hover:text-zinc-400"
                      onClick={handleCleanup}
                      disabled={cleaning}
                      aria-label="Clean up inactive agents"
                    >
                      <RefreshCw
                        className={`h-3 w-3 ${cleaning ? "animate-spin" : ""}`}
                      />
                    </Button>
                  </div>
                  {staleAgents.map((agent) => (
                    <div
                      key={agent.id}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg opacity-50"
                    >
                      <span className="text-sm">
                        {ROLE_EMOJI[agent.role] ?? "🤖"}
                      </span>
                      <span className="text-xs text-zinc-500 flex-1 truncate">
                        {ROLE_LABEL[agent.role] ?? agent.role}
                      </span>
                      <button
                        className="text-zinc-600 hover:text-red-400 transition-colors"
                        onClick={() => handleDeleteAgent(agent.id)}
                        aria-label={`Delete agent ${ROLE_LABEL[agent.role] ?? agent.role}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Main Content */}
        <div className="col-span-9 space-y-6">
          {/* Tab Switcher */}
          <div role="tablist" className="flex gap-1 border-b border-zinc-800 pb-0">
            {(["board", "inbox", "chat"] as const).map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab
                    ? "border-blue-500 text-white"
                    : "border-transparent text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {tab === "board" && "Board"}
                {tab === "inbox" && (
                  <span className="flex items-center gap-1.5">
                    <Inbox className="h-3.5 w-3.5" />
                    Inbox
                    {notifications.filter((n) => !n.read).length > 0 && (
                      <span className="ml-1 inline-flex items-center justify-center h-4 min-w-[16px] rounded-full bg-blue-600 text-[10px] text-white px-1">
                        {notifications.filter((n) => !n.read).length}
                      </span>
                    )}
                  </span>
                )}
                {tab === "chat" && "Chat"}
              </button>
            ))}
          </div>

          {/* Board Tab */}
          {activeTab === "board" && (
          <>
          {/* Work Items — Kanban */}
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
                    onClick={() => setViewMode("kanban")}
                  >
                    Board
                  </Button>
                  <Button
                    size="sm"
                    variant={viewMode === "list" ? "primary" : "ghost"}
                    className="h-6 px-2 text-xs"
                    onClick={() => setViewMode("list")}
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
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {KANBAN_COLUMNS.map((col) => {
                    const items = workItems.filter((w) => w.status === col.key);
                    return (
                      <div
                        key={col.key}
                        className={`flex-1 min-w-[160px] rounded-lg border ${col.color} bg-zinc-900/50 p-2`}
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
                              className="rounded-md border border-zinc-800 bg-zinc-900 p-2 hover:border-zinc-700 transition-colors"
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

          {/* Artifacts */}
          {artifacts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Artifacts
                  <span className="ml-2 text-xs font-normal text-zinc-500">
                    {artifacts.length}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {artifacts.map((artifact) => (
                    <div
                      key={artifact.id}
                      className="flex items-center justify-between rounded-lg border border-zinc-800 px-4 py-3 hover:border-zinc-700 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        {artifact.artifact_type === "pull_request" ? (
                          <GitPullRequest className="h-4 w-4 text-purple-400" />
                        ) : (
                          <FileText className="h-4 w-4 text-zinc-400" />
                        )}
                        <span className="text-sm text-zinc-300">
                          {artifact.name}
                        </span>
                      </div>
                      <Badge
                        variant={
                          artifact.approval_status === "approved"
                            ? "success"
                            : artifact.approval_status === "rejected"
                              ? "error"
                              : "default"
                        }
                      >
                        {artifact.approval_status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          </>
          )}

          {/* Inbox Tab */}
          {activeTab === "inbox" && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    Notifications
                    {notifications.length > 0 && (
                      <span className="ml-2 text-xs font-normal text-zinc-500">
                        {notifications.filter((n) => !n.read).length} unread
                      </span>
                    )}
                  </CardTitle>
                  {notifications.some((n) => !n.read) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-zinc-400 hover:text-white"
                      onClick={handleMarkAllRead}
                    >
                      <CheckCheck className="h-3.5 w-3.5 mr-1" />
                      Mark all read
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {notificationsLoading && notifications.length === 0 ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 text-zinc-400 animate-spin" />
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="text-center py-8">
                    <Inbox className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
                    <p className="text-sm text-zinc-500">
                      No notifications yet. Cosmo will keep you posted!
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {notifications.map((notif) => {
                      const agent = notif.agent_id
                        ? agents.find((a) => a.id === notif.agent_id)
                        : null;
                      return (
                        <div
                          key={notif.id}
                          onClick={() => !notif.read && handleMarkRead(notif.id)}
                          className={`flex items-start gap-3 rounded-lg border px-4 py-3 transition-colors cursor-pointer ${
                            notif.read
                              ? "border-zinc-800 hover:border-zinc-700"
                              : "border-l-blue-500 border-l-2 border-zinc-800 bg-blue-950/20 hover:bg-blue-950/30"
                          }`}
                        >
                          <div className="flex-shrink-0 mt-0.5">
                            <div className="h-7 w-7 rounded-full bg-zinc-800 flex items-center justify-center text-sm">
                              {agent
                                ? ROLE_EMOJI[agent.role] ?? "\uD83E\uDD16"
                                : "\uD83D\uDE80"}
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p
                              className={`text-sm leading-snug ${
                                notif.read
                                  ? "text-zinc-400"
                                  : "text-zinc-200 font-medium"
                              }`}
                            >
                              {notif.title}
                            </p>
                            {notif.body && (
                              <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">
                                {notif.body}
                              </p>
                            )}
                            <span className="text-[10px] text-zinc-600 mt-1 block">
                              {new Date(notif.created_at).toLocaleString()}
                            </span>
                          </div>
                          {!notif.read && (
                            <div className="flex-shrink-0 mt-1.5">
                              <span className="h-2 w-2 rounded-full bg-blue-500 block" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {/* Reply to Cosmo input */}
                <div className="mt-4 flex gap-2">
                  <input
                    type="text"
                    value={inboxReplyInput}
                    onChange={(e) => setInboxReplyInput(e.target.value)}
                    placeholder="Reply to Cosmo..."
                    aria-label="Reply to Cosmo"
                    className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-blue-500 focus:outline-none"
                    disabled={!agents.some((a) => a.role === "project_orchestrator" && a.status !== "terminated" && a.status !== "complete")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleInboxReply();
                    }}
                  />
                  <Button
                    size="sm"
                    onClick={handleInboxReply}
                    aria-label="Send reply"
                    disabled={
                      inboxReplySending ||
                      !inboxReplyInput.trim() ||
                      !agents.some((a) => a.role === "project_orchestrator" && a.status !== "terminated" && a.status !== "complete")
                    }
                  >
                    {inboxReplySending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {inboxReplyError && (
                  <p className="text-xs text-red-400 mt-1">{inboxReplyError}</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Chat Tab */}
          {activeTab === "chat" && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Activity Feed</CardTitle>
                {activeAgents.length > 1 && (
                  <select
                    value={targetAgentId}
                    onChange={(e) => setTargetAgentId(e.target.value)}
                    className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-white focus:border-blue-500 focus:outline-none"
                  >
                    {activeAgents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {ROLE_EMOJI[a.role]} {ROLE_LABEL[a.role] ?? a.role}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 mb-4 max-h-80 overflow-y-auto">
                {chatMessages.length === 0 ? (
                  <div className="text-center py-6">
                    <Bot className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
                    <p className="text-sm text-zinc-500">
                      {activeAgents.length === 0
                        ? "No active agents — the orchestrator will start working shortly"
                        : "Agents are working autonomously. You can send a message to interact."}
                    </p>
                  </div>
                ) : (
                  chatMessages.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}
                    >
                      {msg.role !== "user" && (
                        <div className="flex-shrink-0 mt-0.5">
                          <div className="h-6 w-6 rounded-full bg-zinc-800 flex items-center justify-center">
                            <Bot className="h-3.5 w-3.5 text-zinc-400" />
                          </div>
                        </div>
                      )}
                      <div
                        className={`max-w-[80%] rounded-lg px-3 py-2 ${
                          msg.role === "user"
                            ? "bg-blue-600/20 border border-blue-800/50"
                            : "bg-zinc-800/50 border border-zinc-800"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-medium text-zinc-400">
                            {msg.from}
                          </span>
                          <span className="text-[10px] text-zinc-600">
                            {msg.time}
                          </span>
                        </div>
                        <p className="text-sm text-zinc-300 whitespace-pre-wrap break-words leading-relaxed">
                          {msg.content}
                        </p>
                      </div>
                      {msg.role === "user" && (
                        <div className="flex-shrink-0 mt-0.5">
                          <div className="h-6 w-6 rounded-full bg-blue-900 flex items-center justify-center">
                            <User className="h-3.5 w-3.5 text-blue-400" />
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
                <div ref={chatEndRef} />
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder={
                    activeAgents.length === 0
                      ? "Waiting for agents..."
                      : "Send a message to interact with agents..."
                  }
                  aria-label="Send message to agent"
                  className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-blue-500 focus:outline-none"
                  disabled={activeAgents.length === 0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSendChat();
                  }}
                />
                <Button
                  size="sm"
                  onClick={handleSendChat}
                  aria-label="Send message"
                  disabled={
                    chatSending || !chatInput.trim() || activeAgents.length === 0
                  }
                >
                  {chatSending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {chatError && (
                <p className="text-xs text-red-400 mt-1">{chatError}</p>
              )}
            </CardContent>
          </Card>
          )}
        </div>
      </div>
    </div>
  );
}
