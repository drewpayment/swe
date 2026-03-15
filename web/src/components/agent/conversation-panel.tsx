"use client";

import { useRef } from "react";
import { Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { ChatMessage } from "@/lib/types";

interface ConversationPanelProps {
  messages: ChatMessage[];
  agentName: string;
  chatInput: string;
  chatSending: boolean;
  onChatInputChange: (value: string) => void;
  onSend: () => void;
}

export function ConversationPanel({
  messages,
  agentName,
  chatInput,
  chatSending,
  onChatInputChange,
  onSend,
}: ConversationPanelProps) {
  const chatEndRef = useRef<HTMLDivElement>(null);

  return (
    <div>
      <div className="space-y-3 mb-4 max-h-80 overflow-y-auto">
        {messages.length === 0 ? (
          <p className="text-sm text-zinc-500 text-center py-4">No messages yet</p>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`flex flex-col gap-0.5 ${msg.role === "user" ? "items-end" : "items-start"}`}>
              <span className="text-[10px] text-zinc-400 dark:text-zinc-600">
                {msg.role === "user" ? "You" : agentName} · {new Date(msg.created_at).toLocaleTimeString()}
              </span>
              <div className={`rounded-lg px-3 py-2 text-sm max-w-[80%] ${
                msg.role === "user"
                  ? "bg-blue-100/20 dark:bg-blue-600/20 text-blue-800 dark:text-blue-100"
                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
              }`}>
                {msg.content}
              </div>
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
          placeholder="Send a message..."
          className="flex-1 px-4 py-2"
          onKeyDown={(e) => { if (e.key === "Enter") onSend(); }}
        />
        <button
          onClick={onSend}
          disabled={chatSending || !chatInput.trim()}
          className="rounded-lg bg-blue-600 px-3 py-2 text-white disabled:opacity-50 hover:bg-blue-700 transition-colors"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
