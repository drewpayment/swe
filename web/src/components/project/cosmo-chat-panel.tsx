// web/src/components/project/cosmo-chat-panel.tsx
"use client";

import { memo, useRef, useEffect } from "react";
import { ArrowUp } from "lucide-react";
import { Agent, ROLE_LABEL } from "@/lib/types";

export interface ChatPanelMessage {
  from: string;
  content: string;
  time: string;
  role: string;
  agentId?: string;
}

export interface AgentActivity {
  agentRole: string;
  action: string;
  target: string;
  timestamp: string;
}

interface CosmoChatPanelProps {
  messages: ChatPanelMessage[];
  activities: AgentActivity[];
  orchestrator: Agent | null;
  chatInput: string;
  onChatInputChange: (value: string) => void;
  onSendMessage: () => Promise<void>;
  sending: boolean;
  error: string | null;
  projectPhase: string;
}

function activityDotColor(role: string): string {
  switch (role) {
    case "coder":
      return "bg-green-400";
    case "sdet":
      return "bg-blue-400";
    case "architect":
      return "bg-purple-400";
    case "security":
      return "bg-red-400";
    case "sre":
    case "devops":
      return "bg-yellow-400";
    default:
      return "bg-zinc-500";
  }
}

export const CosmoChatPanel = memo(function CosmoChatPanel({
  messages,
  activities,
  orchestrator,
  chatInput,
  onChatInputChange,
  onSendMessage,
  sending,
  error,
  projectPhase,
}: CosmoChatPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isOnline = orchestrator && orchestrator.status !== "terminated" && orchestrator.status !== "complete";
  const isCompleted = (orchestrator?.status === "complete") || (!orchestrator && projectPhase === "complete");
  const statusText = isOnline ? "Orchestrating" : isCompleted ? "Completed" : "Offline";
  const placeholderText = isOnline
    ? "Message Cosmo..."
    : isCompleted
      ? "Cosmo has finished"
      : "Cosmo is offline";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activities]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey && chatInput.trim() && !sending) {
      e.preventDefault();
      onSendMessage();
    }
  }

  return (
    <div className="flex flex-col basis-1/3 min-w-[280px] h-full bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3.5 border-b border-zinc-200 dark:border-zinc-800">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center text-base">
          🚀
        </div>
        <div>
          <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Cosmo</div>
          <div className={`text-[11px] ${isOnline ? "text-green-400" : isCompleted ? "text-blue-400" : "text-zinc-500"}`}>
            {statusText}
          </div>
        </div>
      </div>

      {/* Messages + Activity */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5">
        {messages.map((msg, i) => {
          const isUser = msg.role === "user";
          return (
            <div
              key={i}
              className={`flex ${isUser ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] px-3.5 py-2.5 text-[13px] leading-relaxed ${
                  isUser
                    ? "bg-blue-600 text-white rounded-xl rounded-br-sm"
                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl rounded-bl-sm"
                }`}
              >
                {msg.content}
              </div>
            </div>
          );
        })}

        {/* Activity divider + feed (only if activities exist) */}
        {activities.length > 0 && (
          <>
            <div className="flex items-center gap-2.5 py-1">
              <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-800" />
              <span className="text-[10px] text-zinc-400 dark:text-zinc-600 tracking-wider font-medium">
                Activity
              </span>
              <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-800" />
            </div>
            {activities.map((act, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px] text-zinc-500">
                <span className={`w-1.5 h-1.5 rounded-full ${activityDotColor(act.agentRole)}`} />
                <span>
                  {ROLE_LABEL[act.agentRole as keyof typeof ROLE_LABEL] ?? act.agentRole}{" "}
                  {act.action} &quot;{act.target}&quot;
                </span>
              </div>
            ))}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-2 text-xs text-red-400 bg-red-950/30">
          {error}
        </div>
      )}

      {/* Input */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-zinc-200 dark:border-zinc-800">
        <input
          type="text"
          value={chatInput}
          onChange={(e) => onChatInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholderText}
          disabled={!isOnline || sending}
          className="flex-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg px-3.5 py-2.5 text-[13px] text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 dark:placeholder-zinc-600 border-none outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-700 disabled:opacity-50"
        />
        <button
          onClick={onSendMessage}
          disabled={!isOnline || !chatInput.trim() || sending}
          className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:hover:bg-blue-600"
          aria-label="Send message"
        >
          <ArrowUp className="w-[18px] h-[18px]" />
        </button>
      </div>
    </div>
  );
});
