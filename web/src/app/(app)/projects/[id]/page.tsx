"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABEL, PHASE_LABEL, PHASE_VARIANT } from "@/lib/types";
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
  Loader2,
  Inbox,
} from "lucide-react";
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
import { AgentsSidebar } from "@/components/project/agents-sidebar";
import { KanbanBoard } from "@/components/project/kanban-board";
import { ArtifactsPanel } from "@/components/project/artifacts-panel";
import { ChatPanel } from "@/components/project/chat-panel";
import type { ChatMessage as ChatPanelMessage } from "@/components/project/chat-panel";
import { InboxPanel } from "@/components/project/inbox-panel";

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
  const [targetAgentId, setTargetAgentId] = useState<string>("");
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
  const [activeTab, setActiveTab] = useState<"board" | "inbox" | "chat">("board");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [inboxReplyInput, setInboxReplyInput] = useState("");
  const [inboxReplySending, setInboxReplySending] = useState(false);
  const [inboxReplyError, setInboxReplyError] = useState<string | null>(null);
  const markReadCooldownRef = useRef<number>(0);
  const { connected, events } = useWebSocket();

  const projectId = typeof id === "string" ? id : Array.isArray(id) ? id[0] : "";

  const activeAgents = agents.filter(
    (a) => a.status !== "terminated" && a.status !== "complete"
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

  function handleAgentDeleted(agentId: string) {
    if (targetAgentId === agentId) {
      const active = agents.filter(
        (a) => a.status !== "terminated" && a.status !== "complete" && a.id !== agentId
      );
      setTargetAgentId(active[0]?.id || "");
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
      <section aria-label="Project overview">
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
            variant={PHASE_VARIANT[project.phase as ProjectPhase] ?? "default"}
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
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Agents Sidebar */}
        <AgentsSidebar
          agents={agents}
          workItems={workItems}
          projectId={projectId}
          onRefresh={refreshAll}
          onAgentDeleted={handleAgentDeleted}
        />

        {/* Main Content */}
        <section aria-label="Project content" className="lg:col-span-9 space-y-6">
          {/* Tab Switcher */}
          <div role="tablist" className="flex gap-1 border-b border-zinc-800 pb-0">
            {(["board", "inbox", "chat"] as const).map((tab) => (
              <button
                key={tab}
                id={`tab-${tab}`}
                role="tab"
                aria-selected={activeTab === tab}
                aria-controls={`tabpanel-${tab}`}
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
            <div role="tabpanel" id="tabpanel-board" aria-labelledby="tab-board">
              <KanbanBoard
                workItems={workItems}
                agents={agents}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
              />
              <div className="mt-6">
                <ArtifactsPanel artifacts={artifacts} />
              </div>
            </div>
          )}

          {/* Inbox Tab */}
          {activeTab === "inbox" && (
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
          )}

          {/* Chat Tab */}
          {activeTab === "chat" && (
            <ChatPanel
              messages={chatMessages}
              activeAgents={activeAgents}
              targetAgentId={targetAgentId}
              onTargetChange={setTargetAgentId}
              onSendMessage={handleSendChat}
              sending={chatSending}
              error={chatError}
              chatInput={chatInput}
              onChatInputChange={setChatInput}
            />
          )}
        </section>
      </div>
    </div>
  );
}
