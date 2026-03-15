"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Save, Loader2, AlertCircle, Check } from "lucide-react";
import { getSettings, updateSettings } from "@/lib/api";
import type { Settings } from "@/lib/types";
import { LLMConfigSection } from "@/components/settings/llm-config";
import { K8sConfigSection } from "@/components/settings/k8s-config";
import { PlatformStatusSection } from "@/components/settings/platform-status";

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{error || "Failed to load settings"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Settings</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
          Configure your SWE platform
        </p>
      </div>

      <LLMConfigSection settings={settings} onUpdate={setSettings} />

      <K8sConfigSection settings={settings} onUpdate={setSettings} />

      <PlatformStatusSection />

      {/* Save */}
      <div className="flex items-center justify-end gap-3">
        {saveResult && (
          <span className={`text-sm ${saveResult.ok ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
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
