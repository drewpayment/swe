"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FolderKanban,
  Bot,
  FileText,
  Activity,
  Plus,

  Loader2,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";
import { listProjects, listAgents, listArtifacts, checkHealth } from "@/lib/api";
import type { Project, Agent, Artifact, ProjectPhase } from "@/lib/types";

const phaseVariant = {
  planning: "info" as const,
  designing: "info" as const,
  building: "warning" as const,
  testing: "warning" as const,
  deploying: "warning" as const,
  complete: "success" as const,
  archived: "default" as const,
};

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [healthStatus, setHealthStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const [projRes, agentRes, artifactRes, health] = await Promise.all([
          listProjects(),
          listAgents(),
          listArtifacts(),
          checkHealth(),
        ]);

        if (projRes.success && projRes.data) setProjects(projRes.data);
        if (agentRes.success && agentRes.data) setAgents(agentRes.data);
        if (artifactRes.success && artifactRes.data) setArtifacts(artifactRes.data);
        setHealthStatus(health?.status ?? null);

        if (!projRes.success && !agentRes.success) {
          setError(projRes.error || "Failed to load data from API");
        }
      } catch {
        setError("Failed to connect to the API");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const activeProjects = projects.filter((p) => p.status === "active");
  const runningAgents = agents.filter((a) => a.status === "active" || a.status === "initializing");

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 text-zinc-400 animate-spin" />
      </div>
    );
  }

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
        <Link href="/projects/new">
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" />
            New Project
          </Button>
        </Link>
      </div>

      {error && (
        <Card className="border-yellow-800/50 bg-yellow-950/20">
          <CardContent className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-yellow-400" />
            <p className="text-sm text-yellow-300">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-900/50">
              <FolderKanban className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{activeProjects.length}</p>
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
              <p className="text-2xl font-bold text-white">{runningAgents.length}</p>
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
              <p className="text-2xl font-bold text-white">{artifacts.length}</p>
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
              <p className="text-2xl font-bold text-white">
                {healthStatus === "healthy" ? "Healthy" : healthStatus ?? "Unknown"}
              </p>
              <p className="text-xs text-zinc-400">Platform Status</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Projects */}
        <div className="col-span-2 space-y-4">
          <h2 className="text-lg font-semibold text-white">Projects</h2>
          {projects.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8">
                <FolderKanban className="h-10 w-10 text-zinc-600 mb-3" />
                <p className="text-sm text-zinc-400">No projects yet</p>
                <p className="text-xs text-zinc-500 mt-1">
                  Create a project to get started
                </p>
              </CardContent>
            </Card>
          ) : (
            projects.map((project) => (
              <Link key={project.id} href={`/projects/${project.id}`}>
                <Card className="cursor-pointer hover:border-zinc-700 transition-colors">
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-800">
                          <FolderKanban className="h-5 w-5 text-zinc-400" />
                        </div>
                        <div>
                          <h3 className="font-medium text-white">{project.name}</h3>
                          <p className="text-xs text-zinc-500">Updated {timeAgo(project.updated_at ?? project.created_at)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant={phaseVariant[project.phase as ProjectPhase] ?? "default"}>
                          {project.phase}
                        </Badge>
                        <div className="flex items-center gap-1 text-xs text-zinc-500">
                          <Bot className="h-3 w-3" />
                          {project.active_agent_ids?.length ?? 0}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-zinc-500">
                          <FileText className="h-3 w-3" />
                          {project.artifact_ids?.length ?? 0}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))
          )}
        </div>

        {/* Recent Agents */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-white">Recent Agents</h2>
          <Card>
            <CardContent className="space-y-4">
              {agents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6">
                  <Bot className="h-8 w-8 text-zinc-600 mb-2" />
                  <p className="text-sm text-zinc-400">No agents running</p>
                </div>
              ) : (
                agents.slice(0, 8).map((agent) => (
                  <div key={agent.id} className="flex gap-3">
                    <span className="text-base">
                      {agent.status === "active" ? "🟢" : agent.status === "error" ? "🔴" : "⚪"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-300 truncate">{agent.name}</p>
                      <p className="text-xs text-zinc-500">
                        {agent.role.replace(/_/g, " ")} · {agent.status}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
