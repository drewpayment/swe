"use client";

import { memo, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROLE_EMOJI, ROLE_LABEL } from "@/lib/types";
import type { Agent } from "@/lib/types";
import { Send, Loader2, Bot, User } from "lucide-react";

export interface ChatMessage {
  from: string;
  content: string;
  time: string;
  role: string;
}

interface ChatPanelProps {
  messages: ChatMessage[];
  activeAgents: Agent[];
  targetAgentId: string;
  onTargetChange: (agentId: string) => void;
  onSendMessage: () => Promise<void>;
  sending: boolean;
  error: string | null;
  chatInput: string;
  onChatInputChange: (value: string) => void;
}

export const ChatPanel = memo(function ChatPanel({
  messages,
  activeAgents,
  targetAgentId,
  onTargetChange,
  onSendMessage,
  sending,
  error,
  chatInput,
  onChatInputChange,
}: ChatPanelProps) {
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <Card role="tabpanel" id="tabpanel-chat" aria-labelledby="tab-chat">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Activity Feed</CardTitle>
          {activeAgents.length > 1 && (
            <select
              value={targetAgentId}
              onChange={(e) => onTargetChange(e.target.value)}
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
          {messages.length === 0 ? (
            <div className="text-center py-6">
              <Bot className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
              <p className="text-sm text-zinc-500">
                {activeAgents.length === 0
                  ? "No active agents — the orchestrator will start working shortly"
                  : "Agents are working autonomously. You can send a message to interact."}
              </p>
            </div>
          ) : (
            messages.map((msg, i) => (
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
          <Input
            type="text"
            value={chatInput}
            onChange={(e) => onChatInputChange(e.target.value)}
            placeholder={
              activeAgents.length === 0
                ? "Waiting for agents..."
                : "Send a message to interact with agents..."
            }
            aria-label="Send message to agent"
            className="flex-1 px-4 py-2 placeholder:text-zinc-600"
            disabled={activeAgents.length === 0}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSendMessage();
            }}
          />
          <Button
            size="sm"
            onClick={onSendMessage}
            aria-label="Send message"
            disabled={
              sending || !chatInput.trim() || activeAgents.length === 0
            }
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        {error && (
          <p className="text-xs text-red-400 mt-1">{error}</p>
        )}
      </CardContent>
    </Card>
  );
});
