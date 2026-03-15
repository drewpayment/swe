"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROLE_EMOJI } from "@/lib/types";
import type { Agent, Notification } from "@/lib/types";
import { Send, Loader2, Inbox, CheckCheck } from "lucide-react";

export interface InboxReplyState {
  input: string;
  sending: boolean;
  error: string | null;
}

interface InboxPanelProps {
  notifications: Notification[];
  agents: Agent[];
  loading: boolean;
  onMarkRead: (notifId: string) => Promise<void>;
  onMarkAllRead: () => Promise<void>;
  onReply: () => Promise<void>;
  replyState: InboxReplyState;
  onReplyInputChange: (value: string) => void;
}

export function InboxPanel({
  notifications,
  agents,
  loading,
  onMarkRead,
  onMarkAllRead,
  onReply,
  replyState,
  onReplyInputChange,
}: InboxPanelProps) {
  const hasActiveOrchestrator = agents.some(
    (a) =>
      a.role === "project_orchestrator" &&
      a.status !== "terminated" &&
      a.status !== "complete"
  );

  return (
    <Card role="tabpanel" id="tabpanel-inbox" aria-labelledby="tab-inbox">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            Notifications
            {notifications.length > 0 && (
              <span className="ml-2 text-xs font-normal text-zinc-500">
                {notifications.filter((n) => !n.read).length} unread
              </span>
            )}
          </CardTitle>
          {notifications.some((n) => !n.read) && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-zinc-400 hover:text-white"
              onClick={onMarkAllRead}
            >
              <CheckCheck className="h-3.5 w-3.5 mr-1" />
              Mark all read
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading && notifications.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 text-zinc-400 animate-spin" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-8">
            <Inbox className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
            <p className="text-sm text-zinc-500">
              No notifications yet. Cosmo will keep you posted!
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((notif) => {
              const agent = notif.agent_id
                ? agents.find((a) => a.id === notif.agent_id)
                : null;
              return (
                <div
                  key={notif.id}
                  onClick={() => !notif.read && onMarkRead(notif.id)}
                  className={`flex items-start gap-3 rounded-lg border px-4 py-3 transition-colors cursor-pointer ${
                    notif.read
                      ? "border-zinc-800 hover:border-zinc-700"
                      : "border-l-blue-500 border-l-2 border-zinc-800 bg-blue-950/20 hover:bg-blue-950/30"
                  }`}
                >
                  <div className="flex-shrink-0 mt-0.5">
                    <div className="h-7 w-7 rounded-full bg-zinc-800 flex items-center justify-center text-sm">
                      {agent
                        ? ROLE_EMOJI[agent.role] ?? "\uD83E\uDD16"
                        : "\uD83D\uDE80"}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm leading-snug ${
                        notif.read
                          ? "text-zinc-400"
                          : "text-zinc-200 font-medium"
                      }`}
                    >
                      {notif.title}
                    </p>
                    {notif.body && (
                      <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">
                        {notif.body}
                      </p>
                    )}
                    <span className="text-[10px] text-zinc-600 mt-1 block">
                      {new Date(notif.created_at).toLocaleString()}
                    </span>
                  </div>
                  {!notif.read && (
                    <div className="flex-shrink-0 mt-1.5">
                      <span className="h-2 w-2 rounded-full bg-blue-500 block" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {/* Reply to Cosmo input */}
        <div className="mt-4 flex gap-2">
          <Input
            type="text"
            value={replyState.input}
            onChange={(e) => onReplyInputChange(e.target.value)}
            placeholder="Reply to Cosmo..."
            aria-label="Reply to Cosmo"
            className="flex-1 px-4 py-2 placeholder:text-zinc-600"
            disabled={!hasActiveOrchestrator}
            onKeyDown={(e) => {
              if (e.key === "Enter") onReply();
            }}
          />
          <Button
            size="sm"
            onClick={onReply}
            aria-label="Send reply"
            disabled={
              replyState.sending ||
              !replyState.input.trim() ||
              !hasActiveOrchestrator
            }
          >
            {replyState.sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        {replyState.error && (
          <p className="text-xs text-red-400 mt-1">{replyState.error}</p>
        )}
      </CardContent>
    </Card>
  );
}
