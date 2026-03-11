"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Save, RefreshCw } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Configure your SWE platform
        </p>
      </div>

      {/* LLM Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>LLM Provider</CardTitle>
          <CardDescription>Configure the AI model used by agents</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              LiteLLM Proxy URL
            </label>
            <input
              type="text"
              defaultValue="http://localhost:4000"
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Default Model
            </label>
            <select className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none">
              <option value="gpt-4o">gpt-4o</option>
              <option value="claude-sonnet">claude-sonnet-4</option>
              <option value="gemini-pro">gemini-2.5-pro</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Model Overrides per Role
            </label>
            <div className="space-y-2">
              {[
                { role: "Orchestrator", model: "gpt-4o" },
                { role: "Architect", model: "claude-sonnet-4" },
                { role: "SDET", model: "gpt-4o" },
                { role: "Coder", model: "claude-sonnet-4" },
              ].map((item) => (
                <div key={item.role} className="flex items-center gap-3">
                  <span className="text-sm text-zinc-400 w-32">{item.role}</span>
                  <select className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none">
                    <option value="">Use default</option>
                    <option value="gpt-4o">gpt-4o</option>
                    <option value="claude-sonnet">claude-sonnet-4</option>
                    <option value="gemini-pro">gemini-2.5-pro</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Kubernetes */}
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
            <input
              type="text"
              defaultValue="swe-sandboxes"
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Default CPU Limit
              </label>
              <input
                type="text"
                defaultValue="1"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Default Memory Limit
              </label>
              <input
                type="text"
                defaultValue="2Gi"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Platform Status */}
      <Card>
        <CardHeader>
          <CardTitle>Platform Status</CardTitle>
          <CardDescription>Service connectivity</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { name: "SWE API", status: "offline" },
              { name: "Temporal Server", status: "offline" },
              { name: "LiteLLM Proxy", status: "offline" },
              { name: "Kubernetes", status: "offline" },
              { name: "PostgreSQL", status: "offline" },
              { name: "Redis", status: "offline" },
            ].map((service) => (
              <div key={service.name} className="flex items-center justify-between">
                <span className="text-sm text-zinc-300">{service.name}</span>
                <Badge variant={service.status === "healthy" ? "success" : "error"}>
                  {service.status}
                </Badge>
              </div>
            ))}
          </div>
          <Button variant="secondary" size="sm" className="mt-4">
            <RefreshCw className="mr-2 h-3 w-3" />
            Refresh Status
          </Button>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex justify-end">
        <Button>
          <Save className="mr-2 h-4 w-4" />
          Save Settings
        </Button>
      </div>
    </div>
  );
}
