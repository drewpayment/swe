"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FolderKanban, Bot, FileText, Plus } from "lucide-react";
import Link from "next/link";

const mockProjects = [
  {
    id: "auth-service",
    name: "Auth Service",
    description: "JWT authentication microservice with PostgreSQL",
    phase: "building" as const,
    status: "active",
    agentCount: 3,
    artifactCount: 2,
    workItemCount: 5,
    createdAt: "2 hours ago",
  },
  {
    id: "payment-gateway",
    name: "Payment Gateway",
    description: "Stripe integration service for order processing",
    phase: "designing" as const,
    status: "active",
    agentCount: 2,
    artifactCount: 1,
    workItemCount: 3,
    createdAt: "30 minutes ago",
  },
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

export default function ProjectsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Projects</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Manage your engineering projects
          </p>
        </div>
        <Button size="sm">
          <Plus className="mr-2 h-4 w-4" />
          New Project
        </Button>
      </div>

      <div className="space-y-4">
        {mockProjects.map((project) => (
          <Link key={project.id} href={`/projects/${project.id}`}>
            <Card className="cursor-pointer hover:border-zinc-700 transition-colors">
              <CardContent>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-zinc-800 mt-0.5">
                      <FolderKanban className="h-6 w-6 text-zinc-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white text-lg">{project.name}</h3>
                      <p className="text-sm text-zinc-400 mt-0.5">{project.description}</p>
                      <p className="text-xs text-zinc-500 mt-2">Created {project.createdAt}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge variant={phaseVariant[project.phase]}>
                      {project.phase}
                    </Badge>
                    <div className="flex items-center gap-3 text-sm text-zinc-500">
                      <span className="flex items-center gap-1">
                        <Bot className="h-3.5 w-3.5" />
                        {project.agentCount}
                      </span>
                      <span className="flex items-center gap-1">
                        <FileText className="h-3.5 w-3.5" />
                        {project.artifactCount}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
