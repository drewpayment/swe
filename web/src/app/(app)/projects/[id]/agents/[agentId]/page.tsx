"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ROLE_EMOJI, ROLE_LABEL } from "@/lib/types";
import { ArrowLeft, Cpu, Clock, Zap, Loader2, AlertCircle, Send, MessageSquare, FileCode, GitCommit, Terminal } from "lucide-react";
import Link from "next/link";
import type { Agent, AgentStatus, ChatMessage, WorkItem } from "@/lib/types";
import { getAgent, listWorkItems, listAgentChatMessages, sendMessage } from "@/lib/api";

/** Extract file paths and commit references from conversation messages. */
function extractCodeActivity(messages: ChatMessage[]) {
  const fileSet = new Set<string>();
  const commitSet = new Set<string>();
  const actions: { type: "file" | "commit"; value: string; timestamp: string }[] = [];

  for (const msg of messages) {
    if (msg.role === "user") continue;
    const content = msg.content;

    // Match file paths like src/..., internal/..., web/..., cmd/..., etc.
    const filePaths = content.match(/(?:^|\s|["'`])((?:src|internal|web|cmd|lib|app|config|migrations|crates|pkg|public)\/[\w./-]+)/g);
    if (filePaths) {
      for (const raw of filePaths) {
        const fp = raw.trim().replace(/^["'`]+|["'`]+$/g, "");
        if (!fileSet.has(fp)) {
          fileSet.add(fp);
          actions.push({ type: "file", value: fp, timestamp: msg.created_at });
        }
      }
    }

    // Match "files changed:" lists (comma or newline separated file names)
    const filesChangedMatch = content.match(/files?\s*changed\s*:\s*([^\n]+)/gi);
    if (filesChangedMatch) {
      for (const match of filesChangedMatch) {
        const filesStr = match.replace(/files?\s*changed\s*:\s*/i, "");
        const parts = filesStr.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean);
        for (const part of parts) {
          if (part.includes("/") || part.includes(".")) {
            if (!fileSet.has(part)) {
              fileSet.add(part);
              actions.push({ type: "file", value: part, timestamp: msg.created_at });
            }
          }
        }
      }
    }

    // Match commit SHA references (7-40 hex chars preceded by "commit" or "committed")
    const commitMatches = content.match(/(?:commit(?:ted)?[:\s]+)([a-f0-9]{7,40})/gi);
    if (commitMatches) {
      for (const match of commitMatches) {
        const sha = match.replace(/commit(?:ted)?[:\s]+/i, "").trim();
        if (!commitSet.has(sha)) {
          commitSet.add(sha);
          actions.push({ type: "commit", value: sha, timestamp: msg.created_at });
        }
      }
    }
  }

  return { files: fileSet, commits: commitSet, actions: actions.slice(-20) };
}

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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const projectId = typeof id === "string" ? id : Array.isArray(id) ? id[0] : "";
  const agId = typeof agentId === "string" ? agentId : Array.isArray(agentId) ? agentId[0] : "";

  useEffect(() => {
    async function fetchData() {
      if (!agId) return;
      setLoading(true);
      setError(null);
      try {
        const [agentRes, workRes, messagesRes] = await Promise.all([
          getAgent(agId),
          listWorkItems(projectId),
          listAgentChatMessages(agId),
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

        if (messagesRes.success && messagesRes.data) {
          setMessages(messagesRes.data);
        }
      } catch {
        setError("Failed to connect to the API");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [agId, projectId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSendChat() {
    if (!chatInput.trim() || chatSending) return;
    setChatSending(true);
    const msg = chatInput.trim();
    const res = await sendMessage(agId, msg);
    setChatSending(false);
    if (res.success) {
      setChatInput("");
      // Optimistically add user message
      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(),
        project_id: projectId,
        agent_id: agId,
        role: "user" as const,
        content: msg,
        created_at: new Date().toISOString(),
      }]);
      // Refresh messages after a delay to catch the agent's response
      setTimeout(async () => {
        const res = await listAgentChatMessages(agId);
        if (res.success && res.data) setMessages(res.data);
      }, 3000);
    }
  }

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

      {/* Conversation History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Conversation History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 mb-4 max-h-80 overflow-y-auto">
            {messages.length === 0 ? (
              <p className="text-sm text-zinc-500 text-center py-4">No messages yet</p>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className={`flex flex-col gap-0.5 ${msg.role === "user" ? "items-end" : "items-start"}`}>
                  <span className="text-[10px] text-zinc-600">
                    {msg.role === "user" ? "You" : "Agent"} · {new Date(msg.created_at).toLocaleTimeString()}
                  </span>
                  <div className={`rounded-lg px-3 py-2 text-sm max-w-[80%] ${
                    msg.role === "user"
                      ? "bg-blue-600/20 text-blue-100"
                      : "bg-zinc-800 text-zinc-300"
                  }`}>
                    {msg.content}
                  </div>
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
              placeholder="Send a message..."
              className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
              onKeyDown={(e) => { if (e.key === "Enter") handleSendChat(); }}
            />
            <button
              onClick={handleSendChat}
              disabled={chatSending || !chatInput.trim()}
              className="rounded-lg bg-blue-600 px-3 py-2 text-white disabled:opacity-50 hover:bg-blue-700 transition-colors"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Code Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Terminal className="h-4 w-4" />
            Code Activity
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* OpenCode Session Status */}
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium text-zinc-400">OpenCode Session:</span>
            {agent.status === "active" ? (
              <span className="text-green-400">&#x1F7E2; Session Active</span>
            ) : agent.status === "idle" ? (
              <span className="text-zinc-400">&#x26AA; Session Idle</span>
            ) : (
              <span className="text-zinc-600">&#x26AB; No Session</span>
            )}
          </div>

          {/* Summary stats */}
          {(() => {
            const { files, commits, actions } = extractCodeActivity(messages);
            return (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border border-zinc-800 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <FileCode className="h-4 w-4 text-blue-400" />
                      <span className="text-lg font-bold text-white">{files.size}</span>
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">Files Touched</p>
                  </div>
                  <div className="rounded-lg border border-zinc-800 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <GitCommit className="h-4 w-4 text-green-400" />
                      <span className="text-lg font-bold text-white">{commits.size}</span>
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">Commits Made</p>
                  </div>
                  <div className="rounded-lg border border-zinc-800 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-yellow-400" />
                      <span className="text-lg font-bold text-white truncate text-sm">
                        {currentWorkItem ? currentWorkItem.title : "None"}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">Current Work Item</p>
                  </div>
                </div>

                {/* Recent code actions list */}
                {actions.length > 0 ? (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {actions.map((action, i) => (
                      <div key={`${action.type}-${i}`} className="flex items-center gap-2 text-xs">
                        {action.type === "file" ? (
                          <FileCode className="h-3 w-3 text-blue-400 shrink-0" />
                        ) : (
                          <GitCommit className="h-3 w-3 text-green-400 shrink-0" />
                        )}
                        <span className="font-mono text-zinc-300 truncate">{action.value}</span>
                        <span className="text-zinc-600 ml-auto shrink-0">
                          {new Date(action.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-500 text-center py-2">
                    No code activity detected yet
                  </p>
                )}
              </>
            );
          })()}
        </CardContent>
      </Card>

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
