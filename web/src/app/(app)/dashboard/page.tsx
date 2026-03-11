"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FolderKanban,
  Bot,
  FileText,
  Activity,
  Plus,
  Zap,
} from "lucide-react";

// Mock data for MVP display
const mockProjects = [
  {
    id: "1",
    name: "Auth Service",
    phase: "building" as const,
    status: "active" as const,
    agentCount: 3,
    artifactCount: 2,
    updatedAt: "2 minutes ago",
  },
  {
    id: "2",
    name: "Payment Gateway",
    phase: "designing" as const,
    status: "active" as const,
    agentCount: 2,
    artifactCount: 1,
    updatedAt: "15 minutes ago",
  },
];

const mockActivity = [
  { time: "2m ago", event: "Coder opened PR #12", project: "Auth Service", icon: "💻" },
  { time: "5m ago", event: "SDET started test generation", project: "Auth Service", icon: "🧪" },
  { time: "12m ago", event: "Drew approved BDR", project: "Auth Service", icon: "✅" },
  { time: "15m ago", event: "Architect delivered BDR", project: "Payment Gateway", icon: "📐" },
  { time: "30m ago", event: "Project created", project: "Payment Gateway", icon: "🎯" },
];

const phaseVariant = {
  planning: "info" as const,
  designing: "info" as const,
  building: "warning" as const,
  testing: "warning" as const,
  deploying: "warning" as const,
  complete: "success" as const,
  archived: "default" as const,
};

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Overview of your SWE platform
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" size="sm">
            <Zap className="mr-2 h-4 w-4" />
            swe run
          </Button>
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" />
            New Project
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-900/50">
              <FolderKanban className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">2</p>
              <p className="text-xs text-zinc-400">Active Projects</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-900/50">
              <Bot className="h-5 w-5 text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">5</p>
              <p className="text-xs text-zinc-400">Running Agents</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-900/50">
              <FileText className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">3</p>
              <p className="text-xs text-zinc-400">Artifacts</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-900/50">
              <Activity className="h-5 w-5 text-yellow-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">Healthy</p>
              <p className="text-xs text-zinc-400">Platform Status</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Projects */}
        <div className="col-span-2 space-y-4">
          <h2 className="text-lg font-semibold text-white">Projects</h2>
          {mockProjects.map((project) => (
            <Card key={project.id} className="cursor-pointer hover:border-zinc-700 transition-colors">
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-800">
                      <FolderKanban className="h-5 w-5 text-zinc-400" />
                    </div>
                    <div>
                      <h3 className="font-medium text-white">{project.name}</h3>
                      <p className="text-xs text-zinc-500">Updated {project.updatedAt}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={phaseVariant[project.phase]}>
                      {project.phase}
                    </Badge>
                    <div className="flex items-center gap-1 text-xs text-zinc-500">
                      <Bot className="h-3 w-3" />
                      {project.agentCount}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-zinc-500">
                      <FileText className="h-3 w-3" />
                      {project.artifactCount}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Activity Feed */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-white">Recent Activity</h2>
          <Card>
            <CardContent className="space-y-4">
              {mockActivity.map((item, i) => (
                <div key={i} className="flex gap-3">
                  <span className="text-base">{item.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-300 truncate">{item.event}</p>
                    <p className="text-xs text-zinc-500">
                      {item.project} · {item.time}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
