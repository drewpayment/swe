"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import type { Settings } from "@/lib/types";

const roles = [
  { key: "orchestrator", label: "Orchestrator" },
  { key: "architect", label: "Architect" },
  { key: "sdet", label: "SDET" },
  { key: "coder", label: "Coder" },
];

interface LLMConfigSectionProps {
  settings: Settings;
  onUpdate: (settings: Settings) => void;
}

export function LLMConfigSection({ settings, onUpdate }: LLMConfigSectionProps) {
  const [proxyUrlError, setProxyUrlError] = useState<string | null>(null);

  function updateLlm(field: string, value: string) {
    onUpdate({
      ...settings,
      llm: { ...settings.llm, [field]: value },
    });
  }

  function updateRoleModel(role: string, model: string) {
    const role_models = { ...settings.llm.role_models };
    if (model) {
      role_models[role] = model;
    } else {
      delete role_models[role];
    }
    onUpdate({
      ...settings,
      llm: { ...settings.llm, role_models },
    });
  }

  function validateProxyUrl(value: string) {
    if (!value.trim()) {
      setProxyUrlError(null);
      return;
    }
    try {
      const url = new URL(value);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        setProxyUrlError("URL must start with http:// or https://");
      } else {
        setProxyUrlError(null);
      }
    } catch {
      setProxyUrlError("Please enter a valid URL");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>LLM Provider</CardTitle>
        <CardDescription>Configure the AI model used by agents</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
            LiteLLM Proxy URL
          </label>
          <Input
            type="text"
            value={settings.llm.proxy_url}
            onChange={(e) => updateLlm("proxy_url", e.target.value)}
            onBlur={(e) => validateProxyUrl(e.target.value)}
            aria-describedby={proxyUrlError ? "proxy-url-error" : undefined}
            aria-invalid={proxyUrlError ? true : undefined}
          />
          {proxyUrlError && (
            <p id="proxy-url-error" className="mt-1 text-sm text-red-600 dark:text-red-400">
              {proxyUrlError}
            </p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
            Default Model
          </label>
          <Select
            value={settings.llm.default_model}
            onChange={(e) => updateLlm("default_model", e.target.value)}
          >
            <option value="gpt-4o">gpt-4o</option>
            <option value="claude-sonnet-4">claude-sonnet-4</option>
            <option value="gemini-2.5-pro">gemini-2.5-pro</option>
          </Select>
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
            Model Overrides per Role
          </label>
          <div className="space-y-2">
            {roles.map((r) => (
              <div key={r.key} className="flex items-center gap-3">
                <span className="text-sm text-zinc-600 dark:text-zinc-400 w-32">{r.label}</span>
                <Select
                  value={settings.llm.role_models[r.key] || ""}
                  onChange={(e) => updateRoleModel(r.key, e.target.value)}
                  className="flex-1 py-1.5"
                >
                  <option value="">Use default</option>
                  <option value="gpt-4o">gpt-4o</option>
                  <option value="claude-sonnet-4">claude-sonnet-4</option>
                  <option value="gemini-2.5-pro">gemini-2.5-pro</option>
                </Select>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
