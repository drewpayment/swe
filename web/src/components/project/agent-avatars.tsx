// web/src/components/project/agent-avatars.tsx
"use client";

import { memo, useState, useRef, useEffect } from "react";
import { Plus } from "lucide-react";
import { Agent, AgentRole, ROLE_EMOJI, ROLE_LABEL } from "@/lib/types";
import { createAgent } from "@/lib/api";

interface AgentAvatarsProps {
  agents: Agent[];
  projectId: string;
  onRefresh: () => Promise<void>;
}

const SPAWNABLE_ROLES: AgentRole[] = [
  "architect",
  "coder",
  "sdet",
  "security",
  "sre",
  "devops",
];

function statusDotColor(status: string): string {
  switch (status) {
    case "active":
      return "bg-green-400";
    case "initializing":
      return "bg-yellow-400";
    case "waiting_for_human":
    case "waiting_for_agent":
      return "bg-blue-400";
    case "error":
      return "bg-red-400";
    case "idle":
    default:
      return "bg-zinc-500";
  }
}

export const AgentAvatars = memo(function AgentAvatars({
  agents,
  projectId,
  onRefresh,
}: AgentAvatarsProps) {
  const [showSpawnMenu, setShowSpawnMenu] = useState(false);
  const [spawning, setSpawning] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const activeAgents = agents.filter(
    (a) => a.status !== "terminated" && a.status !== "complete"
  );

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowSpawnMenu(false);
      }
    }
    if (showSpawnMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showSpawnMenu]);

  async function handleSpawn(role: AgentRole) {
    setSpawning(true);
    setShowSpawnMenu(false);
    try {
      await createAgent({
        project_id: projectId,
        role,
        name: ROLE_LABEL[role],
      });
      await onRefresh();
    } finally {
      setSpawning(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {/* Stacked avatar circles */}
      <div className="flex items-center -space-x-1">
        {activeAgents.map((agent) => (
          <div
            key={agent.id}
            className="relative w-7 h-7 rounded-full bg-zinc-200 dark:bg-zinc-800 border-2 border-white dark:border-zinc-900 flex items-center justify-center text-xs cursor-default"
            title={`${ROLE_LABEL[agent.role]} — ${agent.status}`}
          >
            <span>{ROLE_EMOJI[agent.role]}</span>
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border-[1.5px] border-white dark:border-zinc-900 ${statusDotColor(agent.status)}`}
            />
          </div>
        ))}
      </div>

      {/* Spawn button */}
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setShowSpawnMenu((v) => !v)}
          disabled={spawning}
          className="w-7 h-7 rounded-full bg-zinc-200 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 flex items-center justify-center text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors"
          aria-label="Spawn agent"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>

        {showSpawnMenu && (
          <div className="absolute right-0 top-full mt-2 w-44 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl z-50 py-1">
            {SPAWNABLE_ROLES.map((role) => (
              <button
                key={role}
                onClick={() => handleSpawn(role)}
                className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2"
              >
                <span>{ROLE_EMOJI[role]}</span>
                <span>{ROLE_LABEL[role]}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
