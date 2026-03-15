"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FolderKanban, Bot, FileText, Plus, Loader2, AlertCircle } from "lucide-react";
import Link from "next/link";
import { listProjects } from "@/lib/api";
import type { Project, ProjectPhase } from "@/lib/types";
import { PHASE_VARIANT } from "@/lib/types";
import { timeAgo } from "@/lib/utils";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const res = await listProjects();
        if (res.success && res.data) {
          setProjects(res.data);
        } else {
          setError(res.error || "Failed to load projects");
        }
      } catch {
        setError("Failed to connect to the API");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 text-zinc-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Projects</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
            Manage your engineering projects
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

      <div className="space-y-4">
        {projects.length === 0 && !error ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FolderKanban className="h-12 w-12 text-zinc-400 dark:text-zinc-600 mb-4" />
              <p className="text-lg text-zinc-600 dark:text-zinc-400">No projects yet</p>
              <p className="text-sm text-zinc-500 mt-1">
                Create your first project to get started
              </p>
            </CardContent>
          </Card>
        ) : (
          projects.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`}>
              <Card className="cursor-pointer hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors">
                <CardContent>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800 mt-0.5">
                        <FolderKanban className="h-6 w-6 text-zinc-600 dark:text-zinc-400" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-zinc-900 dark:text-white text-lg">{project.name}</h3>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-0.5">
                          {project.description || "No description"}
                        </p>
                        <p className="text-xs text-zinc-500 mt-2">
                          Created {timeAgo(project.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <Badge variant={PHASE_VARIANT[project.phase as ProjectPhase] ?? "default"}>
                        {project.phase}
                      </Badge>
                      <div className="flex items-center gap-3 text-sm text-zinc-500">
                        <span className="flex items-center gap-1">
                          <Bot className="h-3.5 w-3.5" />
                          {project.active_agent_ids?.length ?? 0}
                        </span>
                        <span className="flex items-center gap-1">
                          <FileText className="h-3.5 w-3.5" />
                          {project.artifact_ids?.length ?? 0}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
