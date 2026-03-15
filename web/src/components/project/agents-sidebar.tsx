"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ROLE_EMOJI, ROLE_LABEL } from "@/lib/types";
import type { AgentRole, AgentStatus, Agent, WorkItem } from "@/lib/types";
import {
  Loader2,
  Bot,
  Plus,
  Trash2,
  RefreshCw,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { createAgent, deleteAgent, cleanupStaleAgents } from "@/lib/api";

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

const SPAWNABLE_ROLES: { role: AgentRole; label: string }[] = [
  { role: "architect", label: "Architect" },
  { role: "coder", label: "Coder" },
  { role: "sdet", label: "SDET" },
  { role: "security", label: "Security" },
  { role: "sre", label: "SRE" },
  { role: "devops", label: "DevOps" },
];

interface AgentsSidebarProps {
  agents: Agent[];
  workItems: WorkItem[];
  projectId: string;
  onRefresh: () => Promise<void>;
  onAgentDeleted: (agentId: string) => void;
}

export const AgentsSidebar = memo(function AgentsSidebar({
  agents,
  workItems,
  projectId,
  onRefresh,
  onAgentDeleted,
}: AgentsSidebarProps) {
  const [spawning, setSpawning] = useState(false);
  const [showSpawnMenu, setShowSpawnMenu] = useState(false);
  const [cleaning, setCleaning] = useState(false);

  const spawnMenuRef = useRef<HTMLDivElement>(null);
  const spawnButtonRef = useRef<HTMLButtonElement>(null);
  const spawnFocusIndexRef = useRef<number>(0);

  const activeAgents = agents.filter(
    (a) => a.status !== "terminated" && a.status !== "complete"
  );
  const staleAgents = agents.filter(
    (a) => a.status === "terminated" || a.status === "complete"
  );

  // Focus first spawn menu item when menu opens; close on click-outside
  useEffect(() => {
    if (showSpawnMenu) {
      spawnFocusIndexRef.current = 0;
      setTimeout(() => {
        if (spawnMenuRef.current) {
          const items = spawnMenuRef.current.querySelectorAll<HTMLElement>('[role="menuitem"]');
          items[0]?.focus();
        }
      }, 50);
    }
  }, [showSpawnMenu]);

  useEffect(() => {
    if (!showSpawnMenu) return;
    function handleClickOutside(e: MouseEvent) {
      if (spawnMenuRef.current && !spawnMenuRef.current.contains(e.target as Node) &&
          spawnButtonRef.current && !spawnButtonRef.current.contains(e.target as Node)) {
        setShowSpawnMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showSpawnMenu]);

  function handleSpawnMenuKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const items = spawnMenuRef.current
      ? Array.from(spawnMenuRef.current.querySelectorAll<HTMLElement>('[role="menuitem"]'))
      : [];

    switch (e.key) {
      case "Escape":
        e.preventDefault();
        setShowSpawnMenu(false);
        spawnButtonRef.current?.focus();
        break;
      case "ArrowDown":
        e.preventDefault();
        spawnFocusIndexRef.current = (spawnFocusIndexRef.current + 1) % items.length;
        items[spawnFocusIndexRef.current]?.focus();
        break;
      case "ArrowUp":
        e.preventDefault();
        spawnFocusIndexRef.current = (spawnFocusIndexRef.current - 1 + items.length) % items.length;
        items[spawnFocusIndexRef.current]?.focus();
        break;
      case "Home":
        e.preventDefault();
        spawnFocusIndexRef.current = 0;
        items[0]?.focus();
        break;
      case "End":
        e.preventDefault();
        spawnFocusIndexRef.current = items.length - 1;
        items[items.length - 1]?.focus();
        break;
    }
  }

  async function handleSpawnAgent(role: AgentRole, label: string) {
    setSpawning(true);
    setShowSpawnMenu(false);
    const res = await createAgent({ name: label, role, project_id: projectId });
    if (res.success) await onRefresh();
    setSpawning(false);
  }

  async function handleCleanup() {
    setCleaning(true);
    await cleanupStaleAgents(projectId);
    await onRefresh();
    setCleaning(false);
  }

  async function handleDeleteAgent(agentId: string) {
    await deleteAgent(agentId);
    await onRefresh();
    onAgentDeleted(agentId);
  }

  return (
    <section aria-label="Agents" className="lg:col-span-3 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
          Agents ({activeAgents.length})
        </h2>
        <div className="relative">
          <Button
            ref={spawnButtonRef}
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={() => setShowSpawnMenu(!showSpawnMenu)}
            disabled={spawning}
            aria-label="Add agent"
            aria-expanded={showSpawnMenu}
            aria-haspopup="menu"
          >
            {spawning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
          </Button>
          {showSpawnMenu && (
            <div
              ref={spawnMenuRef}
              role="menu"
              aria-label="Add agent"
              onKeyDown={handleSpawnMenuKeyDown}
              className="absolute right-0 top-8 z-10 w-40 rounded-lg border border-zinc-700 bg-zinc-900 shadow-lg py-1"
            >
              {SPAWNABLE_ROLES.map((r) => (
                <button
                  key={r.role}
                  role="menuitem"
                  className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 focus:bg-zinc-800 focus:outline-none"
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
                      aria-hidden="true"
                      className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-zinc-900 ${statusIndicator(agent.status)}`}
                    />
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
    </section>
  );
});
