"use client";

import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ROLE_EMOJI, ROLE_LABEL } from "@/lib/types";
import { ArrowLeft, Cpu, Clock, Zap, MessageSquare } from "lucide-react";
import Link from "next/link";
import type { AgentRole } from "@/lib/types";

// Mock data
const mockAgent = {
  id: "3",
  name: "coder-1",
  role: "coder" as AgentRole,
  status: "active",
  project_id: "auth-service",
  tokens_consumed: 15420,
  created_at: "10:16 AM",
  current_task: "Implementing JWT middleware for auth endpoints",
};

const mockActivity = [
  { time: "10:58", action: "Writing auth endpoint tests", type: "execute" },
  { time: "10:55", action: "Generated test fixtures", type: "tool" },
  { time: "10:50", action: "Analyzing API spec for test coverage", type: "plan" },
  { time: "10:42", action: "Opened PR #12 with auth middleware", type: "deliver" },
  { time: "10:38", action: "Implemented /auth/refresh endpoint", type: "execute" },
  { time: "10:30", action: "Implemented /auth/login endpoint", type: "execute" },
  { time: "10:22", action: "Set up JWT signing utilities", type: "execute" },
  { time: "10:18", action: "Planning implementation approach", type: "plan" },
  { time: "10:16", action: "Agent initialized with context", type: "init" },
];

const mockConversation = [
  { from: "orchestrator", content: "Implement the JWT auth endpoints based on the approved API spec. Focus on /auth/login, /auth/refresh, and /auth/logout." },
  { from: "coder-1", content: "Got it. I'll start with the JWT signing utilities, then implement each endpoint. Using RS256 as specified in the API spec." },
  { from: "coder-1", content: "Login and refresh endpoints done. Opening a PR for review." },
  { from: "orchestrator", content: "PR looks good. SDET is starting test generation now." },
];

const activityColor = (type: string) => {
  switch (type) {
    case "plan": return "border-blue-800 bg-blue-900/20";
    case "execute": return "border-green-800 bg-green-900/20";
    case "tool": return "border-purple-800 bg-purple-900/20";
    case "deliver": return "border-yellow-800 bg-yellow-900/20";
    case "init": return "border-zinc-700 bg-zinc-800/50";
    default: return "border-zinc-800";
  }
};

export default function AgentDetailPage() {
  const { id, agentId } = useParams();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href={`/projects/${id}`}
          className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300 mb-3"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to project
        </Link>
        <div className="flex items-center gap-4">
          <span className="text-3xl">{ROLE_EMOJI[mockAgent.role]}</span>
          <div>
            <h1 className="text-2xl font-bold text-white">
              {ROLE_LABEL[mockAgent.role]}
            </h1>
            <p className="text-sm text-zinc-400">{mockAgent.name}</p>
          </div>
          <Badge variant="success" className="ml-4">active</Badge>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="flex items-center gap-3">
            <Cpu className="h-5 w-5 text-blue-400" />
            <div>
              <p className="text-lg font-bold text-white">{mockAgent.status}</p>
              <p className="text-xs text-zinc-400">Status</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3">
            <Zap className="h-5 w-5 text-yellow-400" />
            <div>
              <p className="text-lg font-bold text-white">
                {mockAgent.tokens_consumed.toLocaleString()}
              </p>
              <p className="text-xs text-zinc-400">Tokens Used</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3">
            <Clock className="h-5 w-5 text-green-400" />
            <div>
              <p className="text-lg font-bold text-white">{mockAgent.created_at}</p>
              <p className="text-xs text-zinc-400">Started</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3">
            <MessageSquare className="h-5 w-5 text-purple-400" />
            <div>
              <p className="text-lg font-bold text-white">{mockConversation.length}</p>
              <p className="text-xs text-zinc-400">Messages</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Current Task */}
      <Card className="border-blue-800/50 bg-blue-950/20">
        <CardContent>
          <p className="text-xs text-blue-400 font-medium mb-1">CURRENT TASK</p>
          <p className="text-sm text-white">{mockAgent.current_task}</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-6">
        {/* Activity Stream */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Activity Stream</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-96 overflow-y-auto">
            {mockActivity.map((item, i) => (
              <div
                key={i}
                className={`rounded-lg border px-3 py-2 ${activityColor(item.type)}`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm text-zinc-300">{item.action}</p>
                  <span className="text-xs text-zinc-500 tabular-nums ml-2">{item.time}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Conversation */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Conversation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 max-h-96 overflow-y-auto">
            {mockConversation.map((msg, i) => (
              <div key={i}>
                <p className="text-xs text-zinc-500 mb-1">
                  {msg.from === "orchestrator" ? "🎯 Orchestrator" : `💻 ${msg.from}`}
                </p>
                <p className="text-sm text-zinc-300 bg-zinc-800 rounded-lg px-3 py-2">
                  {msg.content}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
