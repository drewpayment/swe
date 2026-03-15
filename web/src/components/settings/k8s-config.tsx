"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Settings } from "@/lib/types";

interface K8sConfigSectionProps {
  settings: Settings;
  onUpdate: (settings: Settings) => void;
}

export function K8sConfigSection({ settings, onUpdate }: K8sConfigSectionProps) {
  function updateK8s(field: string, value: string) {
    onUpdate({
      ...settings,
      kubernetes: { ...settings.kubernetes, [field]: value },
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kubernetes</CardTitle>
        <CardDescription>Sandbox execution environment</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">
            Sandbox Namespace
          </label>
          <Input
            type="text"
            value={settings.kubernetes.sandbox_namespace}
            onChange={(e) => updateK8s("sandbox_namespace", e.target.value)}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Default CPU Limit
            </label>
            <Input
              type="text"
              value={settings.kubernetes.default_cpu_limit}
              onChange={(e) => updateK8s("default_cpu_limit", e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Default Memory Limit
            </label>
            <Input
              type="text"
              value={settings.kubernetes.default_memory_limit}
              onChange={(e) => updateK8s("default_memory_limit", e.target.value)}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
