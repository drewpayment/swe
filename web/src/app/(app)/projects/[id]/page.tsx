"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ROLE_EMOJI, ROLE_LABEL } from "@/lib/types";
import type { AgentRole, AgentStatus } from "@/lib/types";
import {
  Send,
  FileText,
  GitPullRequest,
  CheckCircle,
  Clock,
  AlertCircle,
} from "lucide-react";

// Mock data
const mockAgents = [
  { id: "1", name: "orchestrator", role: "project_orchestrator" as AgentRole, status: "active" as AgentStatus },
  { id: "2", name: "architect-1", role: "architect" as AgentRole, status: "idle" as AgentStatus },
  { id: "3", name: "coder-1", role: "coder" as AgentRole, status: "active" as AgentStatus },
  { id: "4", name: "sdet-1", role: "sdet" as AgentRole, status: "active" as AgentStatus },
];

const mockTimeline = [
  { time: "10:03", event: "Architect delivered BDR", type: "artifact" },
  { time: "10:15", event: "Drew approved BDR", type: "approval" },
  { time: "10:16", event: "Coder started implementation", type: "agent" },
  { time: "10:42", event: "Coder opened PR #12", type: "code" },
  { time: "10:45", event: "SDET started test generation", type: "agent" },
  { time: "10:58", event: "SDET created test plan", type: "artifact" },
];

const mockArtifacts = [
  { id: "a1", name: "BDR-auth-service.md", type: "bdr", status: "approved" },
  { id: "a2", name: "api-spec.yaml", type: "api_spec", status: "draft" },
  { id: "a3", name: "PR #12", type: "pull_request", status: "open" },
  { id: "a4", name: "test-plan.md", type: "test_plan", status: "pending" },
];

const mockChat = [
  { from: "user", content: "What's the coder working on right now?" },
  { from: "orchestrator", content: "The coder is implementing the JWT middleware. About 60% through the auth endpoints. Should be done in ~15 minutes." },
  { from: "user", content: "And the SDET?" },
  { from: "orchestrator", content: "SDET just finished the test plan and is generating acceptance criteria for the auth endpoints. Will start writing tests once the coder's PR is ready for review." },
];

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

const artifactIcon = (type: string) => {
  switch (type) {
    case "pull_request": return <GitPullRequest className="h-4 w-4 text-purple-400" />;
    case "bdr":
    case "test_plan": return <FileText className="h-4 w-4 text-blue-400" />;
    default: return <FileText className="h-4 w-4 text-zinc-400" />;
  }
};

const artifactBadge = (status: string) => {
  switch (status) {
    case "approved": return <Badge variant="success">approved</Badge>;
    case "open": return <Badge variant="info">open</Badge>;
    case "pending": return <Badge variant="warning">pending</Badge>;
    default: return <Badge>{status}</Badge>;
  }
};

const timelineIcon = (type: string) => {
  switch (type) {
    case "approval": return <CheckCircle className="h-4 w-4 text-green-500" />;
    case "artifact": return <FileText className="h-4 w-4 text-blue-400" />;
    case "code": return <GitPullRequest className="h-4 w-4 text-purple-400" />;
    case "agent": return <Clock className="h-4 w-4 text-yellow-400" />;
    default: return <AlertCircle className="h-4 w-4 text-zinc-400" />;
  }
};

export default function ProjectDetailPage() {
  const { id } = useParams();
  const [chatInput, setChatInput] = useState("");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Auth Service</h1>
          <p className="text-sm text-zinc-400 mt-1">
            JWT authentication microservice with PostgreSQL
          </p>
        </div>
        <Badge variant="warning" className="text-sm px-3 py-1">
          Phase: Building
        </Badge>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Agents Sidebar */}
        <div className="col-span-3 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
            Agents
          </h2>
          <div className="space-y-2">
            {mockAgents.map((agent) => (
              <Card key={agent.id} className="p-3 cursor-pointer hover:border-zinc-700 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-lg">{ROLE_EMOJI[agent.role]}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {ROLE_LABEL[agent.role]}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${statusIndicator(agent.status)}`} />
                      <span className="text-xs text-zinc-500">{agent.status}</span>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <div className="col-span-9 space-y-6">
          {/* Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Timeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {mockTimeline.map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  {timelineIcon(item.type)}
                  <div className="flex-1">
                    <p className="text-sm text-zinc-300">{item.event}</p>
                  </div>
                  <span className="text-xs text-zinc-500 tabular-nums">{item.time}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Artifacts */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Artifacts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {mockArtifacts.map((artifact) => (
                  <div
                    key={artifact.id}
                    className="flex items-center justify-between rounded-lg border border-zinc-800 px-4 py-3 hover:border-zinc-700 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      {artifactIcon(artifact.type)}
                      <span className="text-sm text-zinc-300">{artifact.name}</span>
                    </div>
                    {artifactBadge(artifact.status)}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Chat */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">💬 Chat</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 mb-4 max-h-64 overflow-y-auto">
                {mockChat.map((msg, i) => (
                  <div key={i} className={`flex ${msg.from === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`rounded-lg px-4 py-2 max-w-[80%] ${
                        msg.from === "user"
                          ? "bg-blue-600 text-white"
                          : "bg-zinc-800 text-zinc-300"
                      }`}
                    >
                      {msg.from !== "user" && (
                        <p className="text-xs text-zinc-500 mb-1">🎯 Orchestrator</p>
                      )}
                      <p className="text-sm">{msg.content}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Message the orchestrator..."
                  className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && chatInput.trim()) {
                      setChatInput("");
                    }
                  }}
                />
                <Button size="sm">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
