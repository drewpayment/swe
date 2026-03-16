"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { PHASE_LABEL, PHASE_VARIANT } from "@/lib/types";
import type {
  ChatMessage,
  Notification,
  Project,
  Agent,
  Artifact,
  WorkItem,
  ProjectPhase,
} from "@/lib/types";
import {
  AlertCircle,
  ExternalLink,
  Folder,
  AlertTriangle,
} from "lucide-react";
import { StatCardSkeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import {
  getProject,
  listAgents,
  listArtifacts,
  listWorkItems,
  sendMessage,
  listChatMessages,
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/api";
import { useWebSocket } from "@/lib/ws";
import { KanbanBoard } from "@/components/project/kanban-board";
import { ArtifactsPanel } from "@/components/project/artifacts-panel";
import { CosmoChatPanel } from "@/components/project/cosmo-chat-panel";
import type { ChatPanelMessage, AgentActivity } from "@/components/project/cosmo-chat-panel";
import { AgentAvatars } from "@/components/project/agent-avatars";
import { InboxPanel } from "@/components/project/inbox-panel";
import { SummaryPanel } from "@/components/project/summary-panel";

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
  const [chatMessages, setChatMessages] = useState<ChatPanelMessage[]>([]);
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
  const [boardTab, setBoardTab] = useState<"board" | "inbox" | "summary">("board");
  const [activities, setActivities] = useState<AgentActivity[]>([]);
  const initialTabApplied = useRef(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [inboxReplyInput, setInboxReplyInput] = useState("");
  const [inboxReplySending, setInboxReplySending] = useState(false);
  const [inboxReplyError, setInboxReplyError] = useState<string | null>(null);
  const markReadCooldownRef = useRef<number>(0);
  const { connected, events } = useWebSocket();

  const projectId = typeof id === "string" ? id : Array.isArray(id) ? id[0] : "";

  const completedCount = useMemo(
    () => workItems.filter((w) => w.status === "complete").length,
    [workItems]
  );
  const totalCount = workItems.length;
  const progressPct = useMemo(
    () => (totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0),
    [completedCount, totalCount]
  );

  const orchestrator = agents.find(
    (a) => a.role === "project_orchestrator" && a.status !== "terminated" && a.status !== "complete"
  ) ?? null;

  // Auto-select Summary tab when project is complete (initial load only)
  useEffect(() => {
    if (project && project.phase === "complete" && !initialTabApplied.current) {
      initialTabApplied.current = true;
      setBoardTab("summary");
    }
  }, [project]);

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

    // Build activity from agent_status and work_item_update events
    if (latest.type === "agent_status" || latest.type === "work_item_update") {
      const agent = agents.find((a) => a.id === latest.agent_id);
      if (agent) {
        const action = latest.type === "agent_status"
          ? (latest.status as string) ?? "updated"
          : (latest.action as string) ?? "updated";
        const target = (latest.work_item_title as string) ?? (latest.name as string) ?? "";
        if (target) {
          setActivities((prev) => [
            ...prev.slice(-19),
            {
              agentRole: agent.role,
              action,
              target,
              timestamp: new Date().toISOString(),
            },
          ]);
        }
      }
    }
  }, [events, projectId, refreshAll, agents]);

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
    if (boardTab === "inbox") {
      setNotificationsLoading(true);
      fetchNotifications().finally(() => setNotificationsLoading(false));
      const interval = setInterval(fetchNotifications, 15000);
      return () => clearInterval(interval);
    }
  }, [boardTab, fetchNotifications]);

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
          from: "You → Cosmo",
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

  async function handleSendChat() {
    if (!chatInput.trim() || chatSending) return;
    const targetId = orchestrator?.id;
    if (!targetId) {
      setChatError("No active orchestrator to message");
      return;
    }
    setChatSending(true);
    setChatError(null);
    const msg = chatInput.trim();
    const res = await sendMessage(targetId, msg);
    setChatSending(false);
    if (res.success) {
      setChatMessages((prev) => [
        ...prev,
        {
          from: "You → Cosmo",
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
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-7 w-48 rounded-lg bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
            <div className="h-4 w-64 rounded-lg bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
          </div>
          <div className="flex items-center gap-3">
            <div className="h-7 w-20 rounded-full bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
            <div className="h-7 w-28 rounded-full bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-3 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <StatCardSkeleton key={i} />
            ))}
          </div>
          <div className="lg:col-span-9 space-y-4">
            <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800 pb-0">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-9 w-16 rounded-t bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-4 pt-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 h-24 animate-pulse" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertCircle className="h-10 w-10 text-red-400" />
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{error || "Project not found"}</p>
        <Link href="/projects" className="text-sm text-blue-400 hover:underline">
          Back to projects
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header */}
      <section aria-label="Project overview">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">{project.name}</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
            {project.description || "No description"}
          </p>
          {totalCount > 0 && (
            <div className="flex items-center gap-3 mt-2">
              <div className="flex-1 max-w-xs h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all duration-500"
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
            variant={PHASE_VARIANT[project.phase as ProjectPhase] ?? "default"}
            className="text-sm px-3 py-1"
          >
            Phase: {PHASE_LABEL[project.phase as ProjectPhase] ?? project.phase}
          </Badge>
          {project.repo_source === "remote" && project.repo_url ? (
            <Badge variant="default" className="text-xs px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-zinc-700">
              <ExternalLink className="h-3 w-3 mr-1 inline-block" aria-hidden="true" /> {project.repo_url}
            </Badge>
          ) : project.repo_source === "local" && project.working_directory ? (
            <Badge variant="default" className="text-xs px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-zinc-700">
              <Folder className="h-3 w-3 mr-1 inline-block" aria-hidden="true" /> {project.working_directory}
            </Badge>
          ) : (
            <Badge variant="warning" className="text-xs px-2 py-0.5">
              <AlertTriangle className="h-3 w-3 mr-1 inline-block" aria-hidden="true" /> No repo
            </Badge>
          )}
          <span className="flex items-center" title={connected ? "Live updates connected" : "Disconnected"}>
            <span className={`h-2 w-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`} />
            <span className="sr-only">{connected ? "Connected" : "Disconnected"}</span>
          </span>
        </div>
      </div>
      </section>

      {/* Two-panel layout: Chat + Board */}
      <div className="flex gap-3 flex-1 min-h-0">
        {/* Left: Cosmo Chat Panel */}
        <CosmoChatPanel
          messages={chatMessages}
          activities={activities}
          orchestrator={orchestrator}
          projectPhase={project?.phase ?? ""}
          chatInput={chatInput}
          onChatInputChange={setChatInput}
          onSendMessage={handleSendChat}
          sending={chatSending}
          error={chatError}
        />

        {/* Right: Board Panel */}
        <div className="basis-2/3 flex-1 flex flex-col bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden min-w-0">
          {/* Board Header: Tabs + Agent Avatars */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setBoardTab("board")}
                className={`text-[13px] font-medium pb-0.5 transition-colors ${
                  boardTab === "board"
                    ? "text-zinc-900 dark:text-zinc-100 border-b-2 border-blue-500"
                    : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-400"
                }`}
              >
                Board
              </button>
              <button
                onClick={() => setBoardTab("inbox")}
                className={`text-[13px] font-medium pb-0.5 transition-colors relative ${
                  boardTab === "inbox"
                    ? "text-zinc-900 dark:text-zinc-100 border-b-2 border-blue-500"
                    : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-400"
                }`}
              >
                Inbox
                {notifications.filter((n) => !n.read).length > 0 && (
                  <span className="absolute -top-1 -right-3 w-2 h-2 rounded-full bg-blue-500" />
                )}
              </button>
              <button
                onClick={() => setBoardTab("summary")}
                className={`text-[13px] font-medium pb-0.5 transition-colors relative ${
                  boardTab === "summary"
                    ? "text-zinc-900 dark:text-zinc-100 border-b-2 border-blue-500"
                    : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-400"
                }`}
              >
                Summary
                {project.phase === "complete" && boardTab !== "summary" && (
                  <span className="absolute -top-1 -right-3 w-2 h-2 rounded-full bg-green-500" />
                )}
              </button>
            </div>

            <AgentAvatars
              agents={agents}
              projectId={projectId}
              onRefresh={refreshAll}
            />
          </div>

          {/* Board Content */}
          <div className="flex-1 overflow-y-auto">
            {boardTab === "board" && (
              <div className="animate-tab-enter">
                <KanbanBoard
                  workItems={workItems}
                  agents={agents}
                  viewMode={viewMode}
                  onViewModeChange={setViewMode}
                />
                <ArtifactsPanel artifacts={artifacts} />
              </div>
            )}

            {boardTab === "inbox" && (
              <div className="animate-tab-enter">
                <InboxPanel
                  notifications={notifications}
                  agents={agents}
                  loading={notificationsLoading}
                  onMarkRead={handleMarkRead}
                  onMarkAllRead={handleMarkAllRead}
                  onReply={handleInboxReply}
                  replyState={{
                    input: inboxReplyInput,
                    sending: inboxReplySending,
                    error: inboxReplyError,
                  }}
                  onReplyInputChange={setInboxReplyInput}
                />
              </div>
            )}

            {boardTab === "summary" && project && (
              <div className="animate-tab-enter">
                <SummaryPanel
                  project={project}
                  agents={agents}
                  artifacts={artifacts}
                  workItems={workItems}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
