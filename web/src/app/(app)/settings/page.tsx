"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Save, RefreshCw, Loader2, AlertCircle, Check } from "lucide-react";
import { getSettings, updateSettings, checkServiceHealth } from "@/lib/api";
import type { Settings } from "@/lib/types";

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [serviceStatuses, setServiceStatuses] = useState<Record<string, string>>({});
  const [checkingStatus, setCheckingStatus] = useState(false);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      const res = await getSettings();
      if (res.success && res.data) {
        setSettings(res.data);
      } else {
        setError(res.error || "Failed to load settings");
      }
      setLoading(false);
    }
    fetchData();
  }, []);

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    setSaveResult(null);
    const res = await updateSettings(settings);
    setSaving(false);
    if (res.success && res.data) {
      setSettings(res.data);
      setSaveResult({ ok: true, message: "Settings saved" });
      setTimeout(() => setSaveResult(null), 3000);
    } else {
      setSaveResult({ ok: false, message: res.error || "Failed to save settings" });
    }
  }

  async function handleRefreshStatus() {
    setCheckingStatus(true);
    const res = await checkServiceHealth();
    if (res.success && res.data) {
      setServiceStatuses(res.data);
    } else {
      setServiceStatuses({ "SWE API": "offline" });
    }
    setCheckingStatus(false);
  }

  function updateLlm(field: string, value: string) {
    if (!settings) return;
    setSettings({
      ...settings,
      llm: { ...settings.llm, [field]: value },
    });
  }

  function updateRoleModel(role: string, model: string) {
    if (!settings) return;
    const role_models = { ...settings.llm.role_models };
    if (model) {
      role_models[role] = model;
    } else {
      delete role_models[role];
    }
    setSettings({
      ...settings,
      llm: { ...settings.llm, role_models },
    });
  }

  function updateK8s(field: string, value: string) {
    if (!settings) return;
    setSettings({
      ...settings,
      kubernetes: { ...settings.kubernetes, [field]: value },
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 text-zinc-400 animate-spin" />
      </div>
    );
  }

  if (error || !settings) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertCircle className="h-10 w-10 text-yellow-400" />
        <p className="text-sm text-zinc-400">{error || "Failed to load settings"}</p>
      </div>
    );
  }

  const inputClass =
    "w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none";

  const roles = [
    { key: "orchestrator", label: "Orchestrator" },
    { key: "architect", label: "Architect" },
    { key: "sdet", label: "SDET" },
    { key: "coder", label: "Coder" },
  ];

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
              value={settings.llm.proxy_url}
              onChange={(e) => updateLlm("proxy_url", e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Default Model
            </label>
            <select
              value={settings.llm.default_model}
              onChange={(e) => updateLlm("default_model", e.target.value)}
              className={inputClass}
            >
              <option value="gpt-4o">gpt-4o</option>
              <option value="claude-sonnet-4">claude-sonnet-4</option>
              <option value="gemini-2.5-pro">gemini-2.5-pro</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Model Overrides per Role
            </label>
            <div className="space-y-2">
              {roles.map((r) => (
                <div key={r.key} className="flex items-center gap-3">
                  <span className="text-sm text-zinc-400 w-32">{r.label}</span>
                  <select
                    value={settings.llm.role_models[r.key] || ""}
                    onChange={(e) => updateRoleModel(r.key, e.target.value)}
                    className={"flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"}
                  >
                    <option value="">Use default</option>
                    <option value="gpt-4o">gpt-4o</option>
                    <option value="claude-sonnet-4">claude-sonnet-4</option>
                    <option value="gemini-2.5-pro">gemini-2.5-pro</option>
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
              value={settings.kubernetes.sandbox_namespace}
              onChange={(e) => updateK8s("sandbox_namespace", e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Default CPU Limit
              </label>
              <input
                type="text"
                value={settings.kubernetes.default_cpu_limit}
                onChange={(e) => updateK8s("default_cpu_limit", e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Default Memory Limit
              </label>
              <input
                type="text"
                value={settings.kubernetes.default_memory_limit}
                onChange={(e) => updateK8s("default_memory_limit", e.target.value)}
                className={inputClass}
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
            {["SWE API", "PostgreSQL", "Temporal Server", "LiteLLM Proxy", "Redis"].map(
              (service) => {
                const status = serviceStatuses[service];
                return (
                  <div key={service} className="flex items-center justify-between">
                    <span className="text-sm text-zinc-300">{service}</span>
                    <Badge variant={status === "healthy" ? "success" : status === "unhealthy" ? "error" : "default"}>
                      {status ?? "unknown"}
                    </Badge>
                  </div>
                );
              }
            )}
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="mt-4"
            onClick={handleRefreshStatus}
            disabled={checkingStatus}
          >
            {checkingStatus ? (
              <Loader2 className="mr-2 h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-3 w-3" />
            )}
            Refresh Status
          </Button>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex items-center justify-end gap-3">
        {saveResult && (
          <span className={`text-sm ${saveResult.ok ? "text-green-400" : "text-red-400"}`}>
            {saveResult.ok && <Check className="inline h-3 w-3 mr-1" />}
            {saveResult.message}
          </span>
        )}
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save Settings
        </Button>
      </div>
    </div>
  );
}
