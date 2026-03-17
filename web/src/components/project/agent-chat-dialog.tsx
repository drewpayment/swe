"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Agent, ROLE_EMOJI, ROLE_LABEL } from "@/lib/types";
import type { ChatMessage } from "@/lib/types";
import { listAgentChatMessages } from "@/lib/api";

interface AgentChatDialogProps {
  agent: Agent;
  onClose: () => void;
}

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
    case "complete":
      return "bg-blue-400";
    default:
      return "bg-zinc-500";
  }
}

export function AgentChatDialog({ agent, onClose }: AgentChatDialogProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchMessages() {
      setLoading(true);
      const res = await listAgentChatMessages(agent.id);
      if (res.success && res.data) {
        setMessages(res.data);
      }
      setLoading(false);
    }
    fetchMessages();
  }, [agent.id]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Dialog */}
      <div className="fixed inset-4 lg:inset-y-8 lg:inset-x-[15%] z-50 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col animate-slide-in-right overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="relative w-9 h-9 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-base">
              <span>{ROLE_EMOJI[agent.role]}</span>
              <span
                className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-zinc-900 ${statusDotColor(agent.status)}`}
              />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {agent.name || ROLE_LABEL[agent.role]}
              </h3>
              <p className="text-[11px] text-zinc-500">
                {agent.role.replace(/_/g, " ")} — {agent.status.replace(/_/g, " ")}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-5 w-5 border-2 border-zinc-300 dark:border-zinc-700 border-t-blue-500 rounded-full animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <p className="text-center text-sm text-zinc-400 dark:text-zinc-600 py-12">
              No messages yet
            </p>
          ) : (
            messages.map((msg) => {
              const isUser = msg.role === "user";
              return (
                <div
                  key={msg.id}
                  className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] px-3.5 py-2.5 text-[13px] leading-relaxed ${
                      isUser
                        ? "bg-blue-600 text-white rounded-xl rounded-br-sm"
                        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl rounded-bl-sm"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    <p className={`text-[10px] mt-1 ${isUser ? "text-blue-200" : "text-zinc-400 dark:text-zinc-600"}`}>
                      {new Date(msg.created_at).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
