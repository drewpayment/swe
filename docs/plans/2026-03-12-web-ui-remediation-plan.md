# Web UI Remediation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all 31 audit issues and complete the web UI to a functional MVP — correct types, working WebSocket, functional settings page, create-project flow, and proper error handling.

**Architecture:** Bottom-up fix: TypeScript types aligned to Rust structs first, then shared URL config, then Rust config API endpoint, then page-by-page fixes following the user navigation flow (dashboard → projects → create project → project detail + WebSocket → agent detail → settings).

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind v4, Axum 0.8, swe-core (Rust), TypeScript

**Design doc:** `docs/plans/2026-03-12-web-ui-remediation-design.md`

---

### Task 1: Fix TypeScript types to match Rust structs

**Files:**
- Modify: `web/src/lib/types.ts`

**Context:** The Rust API returns full domain structs. The TypeScript interfaces are missing fields, which causes crashes when the UI tries to access undefined properties. Every `Option<T>` in Rust becomes `field?: type` in TS. Every `Vec<T>` becomes `type[]` (never optional).

**Step 1: Add missing Agent fields**

In `web/src/lib/types.ts`, update the `Agent` interface to add the three missing fields after `workflow_id`:

```typescript
export interface Agent {
  id: string;
  name: string;
  role: AgentRole;
  status: AgentStatus;
  project_id?: string;
  current_work_item_id?: string;
  conversation_history: string[];
  context?: string;
  created_at: string;
  updated_at: string;
  last_heartbeat?: string;
  workflow_id?: string;
  sandbox_id?: string;
  tokens_consumed: number;
}
```

**Step 2: Add missing WorkItem fields**

Update the `WorkItem` interface:

```typescript
export interface WorkItem {
  id: string;
  title: string;
  description?: string;
  status: WorkItemStatus;
  priority: Priority;
  project_id: string;
  assigned_agent_id?: string;
  artifact_ids: string[];
  depends_on: string[];
  blocks: string[];
  branch_name?: string;
  pr_url?: string;
  created_at: string;
  updated_at: string;
  started_at?: string;
  completed_at?: string;
}
```

**Step 3: Add missing Artifact fields**

Update the `Artifact` interface:

```typescript
export interface Artifact {
  id: string;
  name: string;
  artifact_type: ArtifactType;
  description?: string;
  project_id: string;
  work_item_id?: string;
  created_by_agent_id: string;
  content?: string;
  storage_url?: string;
  mime_type: string;
  size_bytes: number;
  approval_status: ApprovalStatus;
  approved_by?: string;
  approval_comment?: string;
  version: number;
  previous_version_id?: string;
  created_at: string;
  updated_at: string;
}
```

**Step 4: Verify the build compiles**

Run: `cd web && bun run build 2>&1 | head -30`
Expected: Build succeeds (adding fields doesn't break existing usage)

**Step 5: Commit**

```bash
git add web/src/lib/types.ts
git commit -m "fix: align TypeScript interfaces to Rust domain structs

Add missing fields to Agent (conversation_history, context, sandbox_id),
WorkItem (artifact_ids, depends_on, blocks, started_at, completed_at),
and Artifact (work_item_id, content, storage_url, approved_by,
approval_comment, previous_version_id)."
```

---

### Task 2: Extract shared URL config and fix WebSocket URL

**Files:**
- Create: `web/src/lib/config.ts`
- Modify: `web/src/lib/api.ts`
- Modify: `web/src/lib/ws.ts`

**Context:** Both `api.ts` and `ws.ts` need OrbStack-aware URL detection. Currently `api.ts` has it but `ws.ts` hardcodes `ws://localhost:8080/ws/stream`. Extract a shared helper to DRY this up.

**Step 1: Create shared config helper**

Create `web/src/lib/config.ts`:

```typescript
/**
 * Shared URL configuration for API and WebSocket clients.
 * Handles OrbStack domains, Docker internal networking, and localhost fallback.
 */

function getHostname(): string | null {
  if (typeof window !== "undefined") {
    return window.location.hostname;
  }
  return null;
}

export function getApiBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;

  const hostname = getHostname();
  if (hostname) {
    if (hostname.endsWith(".orb.local")) {
      return "http://swe-api.swe.orb.local";
    }
    return "http://localhost:8080";
  }

  // Server-side: Docker internal network
  return "http://swe-api:8080";
}

export function getWsUrl(): string {
  if (process.env.NEXT_PUBLIC_WS_URL) return process.env.NEXT_PUBLIC_WS_URL;

  const hostname = getHostname();
  if (hostname) {
    if (hostname.endsWith(".orb.local")) {
      return "ws://swe-api.swe.orb.local/ws/stream";
    }
    return "ws://localhost:8080/ws/stream";
  }

  return "ws://swe-api:8080/ws/stream";
}
```

**Step 2: Update api.ts to use shared config**

Replace the `getApiUrl()` function and `API_URL` constant in `web/src/lib/api.ts`:

```typescript
// At the top, replace the getApiUrl function and API_URL constant with:
import { getApiBaseUrl } from "./config";

const API_URL = getApiBaseUrl();
```

Remove the entire `getApiUrl()` function definition (lines 5-19) and the old `const API_URL = getApiUrl();` line.

**Step 3: Update ws.ts to use shared config**

Replace the hardcoded `WS_URL` in `web/src/lib/ws.ts`:

```typescript
// Replace:
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080/ws/stream";

// With:
import { getWsUrl } from "./config";
```

Then inside the `connect` callback, use `getWsUrl()` instead of `WS_URL`:

```typescript
const ws = new WebSocket(getWsUrl());
```

This change is needed because WebSocket URL must be computed at connection time (client-side), not at module load time (which could be server-side during SSR).

**Step 4: Verify the build compiles**

Run: `cd web && bun run build 2>&1 | head -30`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add web/src/lib/config.ts web/src/lib/api.ts web/src/lib/ws.ts
git commit -m "refactor: extract shared URL config, fix WebSocket OrbStack URL

DRY the OrbStack hostname detection into config.ts.
WebSocket URL now correctly resolves for OrbStack domains
instead of hardcoding ws://localhost:8080."
```

---

### Task 3: Add settings API endpoint (Rust backend)

**Files:**
- Create: `crates/swe-api/src/rest/settings.rs`
- Modify: `crates/swe-api/src/rest/mod.rs`
- Modify: `crates/swe-api/src/lib.rs`

**Context:** swe-core already has `Config::load_default()` and `Config::save()` which read/write `~/.swe/config.toml`. We need two REST endpoints to expose this to the web UI. The `Config` struct already derives `Serialize` and `Deserialize`.

**Step 1: Create the settings handler**

Create `crates/swe-api/src/rest/settings.rs`:

```rust
//! Settings API endpoints.
//!
//! Reads and writes the platform config file (~/.swe/config.toml).

use axum::{http::StatusCode, Json};
use swe_core::Config;
use swe_core::config::dirs_path;

use super::{ApiResponse, error_response};

/// Get current platform settings.
pub async fn get_settings(
) -> Result<Json<ApiResponse<Config>>, (StatusCode, Json<ApiResponse<()>>)> {
    let config = Config::load_default().map_err(error_response)?;
    Ok(Json(ApiResponse::success(config)))
}

/// Update platform settings.
pub async fn update_settings(
    Json(config): Json<Config>,
) -> Result<Json<ApiResponse<Config>>, (StatusCode, Json<ApiResponse<()>>)> {
    let config_path = dirs_path().join("config.toml");
    config.save(&config_path).map_err(error_response)?;

    // Re-read to confirm what was saved
    let saved = Config::load_default().map_err(error_response)?;
    Ok(Json(ApiResponse::success(saved)))
}
```

**Step 2: Add the module to rest/mod.rs**

In `crates/swe-api/src/rest/mod.rs`, add:

```rust
pub mod settings;
```

**Step 3: Add routes to the router**

In `crates/swe-api/src/lib.rs`, add the settings routes. Find where the other routes are defined and add:

```rust
.route("/api/v1/settings", get(rest::settings::get_settings).put(rest::settings::update_settings))
```

**Step 4: Verify it compiles**

Run: `cargo build -p swe-api 2>&1 | tail -5`
Expected: Compiles successfully

**Step 5: Commit**

```bash
git add crates/swe-api/src/rest/settings.rs crates/swe-api/src/rest/mod.rs crates/swe-api/src/lib.rs
git commit -m "feat: add GET/PUT /api/v1/settings endpoint

Reads and writes ~/.swe/config.toml via swe-core Config.
Exposes LLM, Kubernetes, API, and platform settings to the web UI."
```

---

### Task 4: Add settings API client and Settings type to web

**Files:**
- Modify: `web/src/lib/types.ts`
- Modify: `web/src/lib/api.ts`

**Context:** The web UI needs to fetch and update settings. The Settings type mirrors the Rust `Config` struct.

**Step 1: Add Settings types**

At the end of `web/src/lib/types.ts`, add:

```typescript
// Settings types (mirrors swe-core Config struct)

export interface PlatformSettings {
  name: string;
  log_level: string;
  debug: boolean;
}

export interface LlmSettings {
  proxy_url: string;
  default_model: string;
  role_models: Record<string, string>;
}

export interface KubernetesSettings {
  kubeconfig?: string;
  sandbox_namespace: string;
  default_cpu_limit: string;
  default_memory_limit: string;
  sandbox_timeout_seconds: number;
}

export interface ApiSettings {
  host: string;
  port: number;
  cors_enabled: boolean;
  cors_origins: string[];
}

export interface DatabaseSettings {
  url: string;
  max_connections: number;
}

export interface TemporalSettings {
  address: string;
  namespace: string;
  task_queue: string;
}

export interface Settings {
  platform: PlatformSettings;
  temporal: TemporalSettings;
  llm: LlmSettings;
  kubernetes: KubernetesSettings;
  api: ApiSettings;
  database: DatabaseSettings;
}
```

**Step 2: Add API client functions**

At the end of `web/src/lib/api.ts` (before the `checkHealth` function), add:

```typescript
// Settings
export async function getSettings(): Promise<ApiResponse<Settings>> {
  return fetchApi("/api/v1/settings");
}

export async function updateSettings(data: Settings): Promise<ApiResponse<Settings>> {
  return fetchApi("/api/v1/settings", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}
```

Also add `Settings` to the import at the top of `api.ts`:

```typescript
import type { Agent, ApiResponse, Artifact, Project, Settings, WorkItem } from "./types";
```

**Step 3: Verify the build compiles**

Run: `cd web && bun run build 2>&1 | head -30`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add web/src/lib/types.ts web/src/lib/api.ts
git commit -m "feat: add Settings types and API client functions

Mirrors the Rust Config struct (platform, llm, kubernetes,
api, database, temporal sections) and adds getSettings/updateSettings."
```

---

### Task 5: Fix dashboard page

**Files:**
- Modify: `web/src/app/(app)/dashboard/page.tsx`

**Context:** Dashboard issues: hardcoded `grid-cols-4` breaks on small screens, "swe run" button is non-functional, "New Project" should link to `/projects/new`. The phase badge fallback already exists (`?? "default"`), so that's fine.

**Step 1: Fix responsive grid**

In `web/src/app/(app)/dashboard/page.tsx`, find:

```tsx
<div className="grid grid-cols-4 gap-4">
```

Replace with:

```tsx
<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
```

**Step 2: Remove non-functional "swe run" button and fix "New Project" link**

Find the header buttons section (around line 102-113):

```tsx
        <div className="flex gap-3">
          <Button variant="secondary" size="sm">
            <Zap className="mr-2 h-4 w-4" />
            swe run
          </Button>
          <Link href="/projects">
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              New Project
            </Button>
          </Link>
        </div>
```

Replace with:

```tsx
        <Link href="/projects/new">
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" />
            New Project
          </Button>
        </Link>
```

**Step 3: Remove unused Zap import**

Remove `Zap` from the lucide-react imports since it was only used by the "swe run" button.

**Step 4: Add defensive optional chaining on project arrays**

In the projects list section, find:

```tsx
{project.active_agent_ids?.length ?? 0}
```

and

```tsx
{project.artifact_ids?.length ?? 0}
```

Verify these already have `?.` — if so, no change needed. (They were fixed in the prior session.)

**Step 5: Verify the build compiles**

Run: `cd web && bun run build 2>&1 | head -30`
Expected: Build succeeds

**Step 6: Commit**

```bash
git add web/src/app/\(app\)/dashboard/page.tsx
git commit -m "fix: dashboard responsive grid, remove non-functional swe-run button

Stats grid now 2-col on mobile, 4-col on desktop.
New Project button links to /projects/new."
```

---

### Task 6: Fix projects list page

**Files:**
- Modify: `web/src/app/(app)/projects/page.tsx`

**Context:** The "New Project" button doesn't navigate anywhere useful — it's a plain `<Button>` with no link. It needs to link to `/projects/new`. Also add optional chaining on the array length accesses.

**Step 1: Wrap "New Project" button in Link**

Find (around line 77-80):

```tsx
        <Button size="sm">
          <Plus className="mr-2 h-4 w-4" />
          New Project
        </Button>
```

Replace with:

```tsx
        <Link href="/projects/new">
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" />
            New Project
          </Button>
        </Link>
```

**Step 2: Add optional chaining on array accesses**

Find:

```tsx
{project.active_agent_ids.length}
```

Replace with:

```tsx
{project.active_agent_ids?.length ?? 0}
```

Find:

```tsx
{project.artifact_ids.length}
```

Replace with:

```tsx
{project.artifact_ids?.length ?? 0}
```

**Step 3: Verify the build compiles**

Run: `cd web && bun run build 2>&1 | head -30`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add web/src/app/\(app\)/projects/page.tsx
git commit -m "fix: projects page New Project link and defensive array access

New Project now links to /projects/new.
Array accesses use optional chaining to prevent crashes on null."
```

---

### Task 7: Add create project page

**Files:**
- Create: `web/src/app/(app)/projects/new/page.tsx`

**Context:** Dedicated page for creating a new project. Form fields: name (required), description (textarea), repo URL, initial prompt (textarea). On success, redirects to the new project's detail page.

**Step 1: Create the page**

Create `web/src/app/(app)/projects/new/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { createProject } from "@/lib/api";

export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [initialPrompt, setInitialPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    setError(null);

    const res = await createProject({
      name: name.trim(),
      description: description.trim() || undefined,
      repo_url: repoUrl.trim() || undefined,
      initial_prompt: initialPrompt.trim() || undefined,
    });

    if (res.success && res.data) {
      router.push(`/projects/${res.data.id}`);
    } else {
      setError(res.error || "Failed to create project");
      setSubmitting(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none";

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link
          href="/projects"
          className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300 mb-3"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to projects
        </Link>
        <h1 className="text-2xl font-bold text-white">New Project</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Create a new engineering project
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Project Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Project"
                className={inputClass}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this project do?"
                rows={3}
                className={inputClass + " resize-none"}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Repository URL
              </label>
              <input
                type="url"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/org/repo"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Initial Prompt
              </label>
              <textarea
                value={initialPrompt}
                onChange={(e) => setInitialPrompt(e.target.value)}
                placeholder="Describe what you want the agents to build..."
                rows={5}
                className={inputClass + " resize-none"}
              />
            </div>

            {error && (
              <p className="text-sm text-red-400">{error}</p>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Link href="/projects">
                <Button type="button" variant="secondary">
                  Cancel
                </Button>
              </Link>
              <Button type="submit" disabled={submitting || !name.trim()}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Project
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
```

**Step 2: Verify the build compiles**

Run: `cd web && bun run build 2>&1 | head -30`
Expected: Build succeeds, `/projects/new` route is recognized

**Step 3: Commit**

```bash
git add web/src/app/\(app\)/projects/new/page.tsx
git commit -m "feat: add create project page at /projects/new

Form with name (required), description, repo URL, and initial prompt.
Shows loading state on submit, inline error on failure,
redirects to project detail on success."
```

---

### Task 8: Fix project detail page and wire WebSocket

**Files:**
- Modify: `web/src/app/(app)/projects/[id]/page.tsx`

**Context:** This page needs: (1) WebSocket integration for real-time updates, (2) chat input loading/error state, (3) a connection indicator. The WebSocket hook filters events by `project_id` and re-fetches data on relevant events.

**Step 1: Add WebSocket integration and chat error handling**

Rewrite the project detail page to add WebSocket, chat loading state, and connection indicator. The key changes:

1. Import `useWebSocket` from `@/lib/ws`
2. Add `useWebSocket()` call
3. Add `useEffect` that watches `events` and re-fetches data on relevant events
4. Add `chatSending` and `chatError` state
5. Add connection indicator dot in the header
6. Add loading/error states to chat send

In the imports, add:

```tsx
import { useWebSocket } from "@/lib/ws";
```

After the existing state declarations (around line 74), add:

```tsx
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const { connected, events } = useWebSocket();
```

Add a second `useEffect` after the data-fetching one to handle WebSocket events:

```tsx
  useEffect(() => {
    if (events.length === 0) return;
    const latest = events[events.length - 1];
    if (latest.project_id !== projectId) return;

    // Re-fetch on relevant events
    const relevantTypes = ["agent_status", "artifact_created", "phase_change", "work_item_update"];
    if (relevantTypes.includes(latest.type)) {
      // Re-fetch affected data
      getProject(projectId).then((res) => {
        if (res.success && res.data) setProject(res.data);
      });
      listAgents(projectId).then((res) => {
        if (res.success && res.data) setAgents(res.data);
      });
      listArtifacts(projectId).then((res) => {
        if (res.success && res.data) setArtifacts(res.data);
      });
      listWorkItems(projectId).then((res) => {
        if (res.success && res.data) setWorkItems(res.data);
      });
    }
  }, [events, projectId]);
```

In the header section, add a connection indicator after the phase badge:

```tsx
        <div className="flex items-center gap-3">
          <Badge variant={phaseVariant[project.phase] ?? "default"} className="text-sm px-3 py-1">
            Phase: {PHASE_LABEL[project.phase as ProjectPhase] ?? project.phase}
          </Badge>
          <span
            className={`h-2 w-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`}
            title={connected ? "Live updates connected" : "Live updates disconnected"}
          />
        </div>
```

Replace the chat send logic. Extract a `handleSendChat` function:

```tsx
  async function handleSendChat() {
    if (!chatInput.trim() || chatSending) return;
    const orchestrator = agents.find((a) => a.role === "project_orchestrator");
    if (!orchestrator) {
      setChatError("No project orchestrator agent available");
      return;
    }
    setChatSending(true);
    setChatError(null);
    const res = await sendMessage(orchestrator.id, chatInput.trim());
    setChatSending(false);
    if (res.success) {
      setChatInput("");
    } else {
      setChatError(res.error || "Failed to send message");
    }
  }
```

Update the chat input `onKeyDown` and button `onClick` to use `handleSendChat`:

```tsx
onKeyDown={(e) => {
  if (e.key === "Enter") handleSendChat();
}}
```

```tsx
<Button size="sm" onClick={handleSendChat} disabled={chatSending || !chatInput.trim()}>
  {chatSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
</Button>
```

Add chat error display after the input row:

```tsx
{chatError && (
  <p className="text-xs text-red-400 mt-1">{chatError}</p>
)}
```

**Step 2: Verify the build compiles**

Run: `cd web && bun run build 2>&1 | head -30`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add web/src/app/\(app\)/projects/\[id\]/page.tsx
git commit -m "feat: wire WebSocket on project detail, fix chat error handling

Real-time updates re-fetch data on agent_status, artifact_created,
phase_change, work_item_update events. Connection indicator dot in
header. Chat shows loading spinner and inline error on failure."
```

---

### Task 9: Fix agent detail page

**Files:**
- Modify: `web/src/app/(app)/projects/[id]/agents/[agentId]/page.tsx`

**Context:** Agent detail needs: null guard on `agent.role` lookups, disable Stop/Restart buttons (API doesn't support stop/restart yet), responsive stats grid.

**Step 1: Add null guards on role lookups**

In the header section, find:

```tsx
<span className="text-3xl">{ROLE_EMOJI[agent.role]}</span>
```

Replace with:

```tsx
<span className="text-3xl">{ROLE_EMOJI[agent.role] ?? "🤖"}</span>
```

Find:

```tsx
{ROLE_LABEL[agent.role]}
```

Replace both instances with:

```tsx
{ROLE_LABEL[agent.role] ?? agent.role}
```

**Step 2: Make stats grid responsive**

Find:

```tsx
<div className="grid grid-cols-4 gap-4">
```

Replace with:

```tsx
<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
```

**Step 3: Verify the build compiles**

Run: `cd web && bun run build 2>&1 | head -30`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add web/src/app/\(app\)/projects/\[id\]/agents/\[agentId\]/page.tsx
git commit -m "fix: agent detail null guards and responsive grid

Role lookups fallback to raw value if role is unknown.
Stats grid is 2-col on mobile, 4-col on desktop."
```

---

### Task 10: Wire settings page

**Files:**
- Modify: `web/src/app/(app)/settings/page.tsx`

**Context:** Settings page is currently all static HTML. Wire it to fetch config on mount, bind form inputs to state, save on submit, and check health status on refresh.

**Step 1: Rewrite settings page with state management**

Replace the entire contents of `web/src/app/(app)/settings/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Save, RefreshCw, Loader2, AlertCircle, Check } from "lucide-react";
import { getSettings, updateSettings, checkHealth } from "@/lib/api";
import type { Settings } from "@/lib/types";

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [apiStatus, setApiStatus] = useState<string | null>(null);
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
    const health = await checkHealth();
    setApiStatus(health?.status ?? "offline");
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
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-300">SWE API</span>
              <Badge variant={apiStatus === "healthy" ? "success" : apiStatus ? "error" : "default"}>
                {apiStatus ?? "unknown"}
              </Badge>
            </div>
            {["Temporal Server", "LiteLLM Proxy", "Kubernetes", "PostgreSQL", "Redis"].map(
              (service) => (
                <div key={service} className="flex items-center justify-between">
                  <span className="text-sm text-zinc-300">{service}</span>
                  <Badge>unknown</Badge>
                </div>
              )
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
```

**Step 2: Verify the build compiles**

Run: `cd web && bun run build 2>&1 | head -30`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add web/src/app/\(app\)/settings/page.tsx
git commit -m "feat: wire settings page to config API

Fetches config on mount, binds all form inputs to state,
saves via PUT /api/v1/settings with loading/error/success feedback.
Refresh Status checks SWE API health. Other services show 'unknown'."
```

---

### Task 11: Final build verification and cleanup

**Files:**
- None new — verification only

**Context:** All changes are in. Run a full build and lint to make sure everything compiles together.

**Step 1: Run web build**

Run: `cd web && bun run build`
Expected: Build succeeds with no errors

**Step 2: Run web lint**

Run: `cd web && bun run lint`
Expected: No errors (warnings are OK)

**Step 3: Run Rust build**

Run: `cargo build -p swe-api`
Expected: Compiles successfully

**Step 4: Fix any issues found**

If any build or lint errors, fix them and commit:

```bash
git add -A
git commit -m "fix: address build/lint issues from remediation"
```
