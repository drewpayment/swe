"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { StatCardSkeleton, CardSkeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FolderKanban,
  Bot,
  FileText,
  Activity,
  Plus,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";
import { listProjects, listAgents, listArtifacts, checkHealth } from "@/lib/api";
import type { Project, Agent, Artifact, ProjectPhase } from "@/lib/types";
import { PHASE_VARIANT } from "@/lib/types";
import { timeAgo } from "@/lib/utils";

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
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-7 w-32 rounded-lg bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
            <div className="h-4 w-52 rounded-lg bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="h-6 w-20 rounded-lg bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
            {Array.from({ length: 2 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
          <div className="space-y-4">
            <div className="h-6 w-28 rounded-lg bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
            <CardSkeleton />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Dashboard</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
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
        <Card className="border-yellow-400/50 dark:border-yellow-800/50 bg-yellow-100/20 dark:bg-yellow-950/20">
          <CardContent className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
            <p className="text-sm text-yellow-700 dark:text-yellow-300">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100/50 dark:bg-blue-900/50">
              <FolderKanban className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-zinc-900 dark:text-white">{activeProjects.length}</p>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">Active Projects</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100/50 dark:bg-green-900/50">
              <Bot className="h-5 w-5 text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-zinc-900 dark:text-white">{runningAgents.length}</p>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">Running Agents</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100/50 dark:bg-purple-900/50">
              <FileText className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-zinc-900 dark:text-white">{artifacts.length}</p>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">Artifacts</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-100/50 dark:bg-yellow-900/50">
              <Activity className="h-5 w-5 text-yellow-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-zinc-900 dark:text-white">
                {healthStatus === "healthy" ? "Healthy" : healthStatus ?? "Unknown"}
              </p>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">Platform Status</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Projects */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Projects</h2>
          {projects.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-10">
                <FolderKanban className="h-12 w-12 text-zinc-400 dark:text-zinc-600 mb-4" />
                <p className="text-base font-medium text-zinc-700 dark:text-zinc-300">No projects yet</p>
                <p className="text-sm text-zinc-500 mt-1 text-center max-w-xs">
                  Projects are workspaces where AI agents plan, build, and test your software end-to-end.
                </p>
                <Link href="/projects/new" className="mt-5">
                  <Button size="md">
                    <Plus className="mr-2 h-4 w-4" />
                    Create your first project
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            projects.map((project) => (
              <Link key={project.id} href={`/projects/${project.id}`}>
                <Card className="cursor-pointer hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors">
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
                          <FolderKanban className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
                        </div>
                        <div>
                          <h3 className="font-medium text-zinc-900 dark:text-white">{project.name}</h3>
                          <p className="text-xs text-zinc-500">Updated {timeAgo(project.updated_at ?? project.created_at)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant={PHASE_VARIANT[project.phase as ProjectPhase] ?? "default"}>
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
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Recent Agents</h2>
          <Card>
            <CardContent className="space-y-4">
              {agents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6">
                  <Bot className="h-8 w-8 text-zinc-400 dark:text-zinc-600 mb-2" />
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">No agents running</p>
                </div>
              ) : (
                agents.slice(0, 8).map((agent) => (
                  <div key={agent.id} className="flex gap-3 items-center">
                    <span className="flex-shrink-0 flex items-center">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          agent.status === "active"
                            ? "bg-green-500"
                            : agent.status === "error"
                              ? "bg-red-500"
                              : "bg-zinc-500"
                        }`}
                      />
                      <span className="sr-only">
                        {agent.status === "active"
                          ? "Active"
                          : agent.status === "error"
                            ? "Error"
                            : "Inactive"}
                      </span>
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-700 dark:text-zinc-300 truncate">{agent.name}</p>
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
