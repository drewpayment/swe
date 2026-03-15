"use client";

import { FileCode, GitCommit, Zap } from "lucide-react";
import type { ChatMessage, WorkItem } from "@/lib/types";

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

interface CodeActivityProps {
  messages: ChatMessage[];
  agentStatus: string;
  currentWorkItem?: WorkItem | null;
}

export function CodeActivity({ messages, agentStatus, currentWorkItem }: CodeActivityProps) {
  const { files, commits, actions } = extractCodeActivity(messages);

  return (
    <div className="space-y-4">
      {/* OpenCode Session Status */}
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium text-zinc-400">OpenCode Session:</span>
        {agentStatus === "active" ? (
          <span className="text-green-400">&#x1F7E2; Session Active</span>
        ) : agentStatus === "idle" ? (
          <span className="text-zinc-400">&#x26AA; Session Idle</span>
        ) : (
          <span className="text-zinc-600">&#x26AB; No Session</span>
        )}
      </div>

      {/* Summary stats */}
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
    </div>
  );
}
