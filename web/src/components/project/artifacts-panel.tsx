"use client";

import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Artifact } from "@/lib/types";
import { FileText, GitPullRequest } from "lucide-react";

interface ArtifactsPanelProps {
  artifacts: Artifact[];
}

export const ArtifactsPanel = memo(function ArtifactsPanel({ artifacts }: ArtifactsPanelProps) {
  if (artifacts.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Artifacts
          <span className="ml-2 text-xs font-normal text-zinc-500">
            {artifacts.length}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {artifacts.map((artifact) => (
            <div
              key={artifact.id}
              className="flex items-center justify-between rounded-lg border border-zinc-800 px-4 py-3 hover:border-zinc-700 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                {artifact.artifact_type === "pull_request" ? (
                  <GitPullRequest className="h-4 w-4 text-purple-400" />
                ) : (
                  <FileText className="h-4 w-4 text-zinc-400" />
                )}
                <span className="text-sm text-zinc-300">
                  {artifact.name}
                </span>
              </div>
              <Badge
                variant={
                  artifact.approval_status === "approved"
                    ? "success"
                    : artifact.approval_status === "rejected"
                      ? "error"
                      : "default"
                }
              >
                {artifact.approval_status}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
});
