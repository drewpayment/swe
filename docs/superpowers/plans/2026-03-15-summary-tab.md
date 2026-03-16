# Summary Tab Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent Summary tab to the board panel showing project stats, artifacts, output location, and a completion view when done.

**Architecture:** Create a new `SummaryPanel` component, integrate it as a third tab in the existing board panel, add a `useEffect` to auto-select it when project is complete, and tweak `CosmoChatPanel` offline messaging. All frontend, no new APIs.

**Tech Stack:** Next.js 16, React 19, Tailwind v4, Lucide icons

**Spec:** `docs/superpowers/specs/2026-03-15-summary-tab-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `web/src/components/project/summary-panel.tsx` | Summary tab content — stats, output location, artifacts, completion banner, work summary |
| Modify | `web/src/app/(app)/projects/[id]/page.tsx` | Add Summary tab, auto-select logic, pass props |
| Modify | `web/src/components/project/cosmo-chat-panel.tsx` | Add `projectPhase` prop, distinguish "Completed" vs "Offline" |

---

## Task 1: Create SummaryPanel component

**Files:**
- Create: `web/src/components/project/summary-panel.tsx`

- [ ] **Step 1: Create the component file**

```tsx
// web/src/components/project/summary-panel.tsx
"use client";

import { memo, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { ROLE_EMOJI, ROLE_LABEL } from "@/lib/types";
import type { Project, Agent, Artifact, WorkItem, ProjectPhase } from "@/lib/types";
import {
  CheckCircle,
  Folder,
  ExternalLink,
  GitPullRequest,
  FileText,
  Clock,
  Users,
  ListChecks,
  PackageCheck,
} from "lucide-react";

interface SummaryPanelProps {
  project: Project;
  agents: Agent[];
  artifacts: Artifact[];
  workItems: WorkItem[];
}

function formatDuration(startIso: string, endIso?: string): string {
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  const diff = Math.max(0, end - start);
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours < 24) return `${hours}h ${remMins}m`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return `${days}d ${remHours}h`;
}

function approvalBadgeVariant(status: string): "success" | "error" | "default" {
  if (status === "approved") return "success";
  if (status === "rejected") return "error";
  return "default";
}

export const SummaryPanel = memo(function SummaryPanel({
  project,
  agents,
  artifacts,
  workItems,
}: SummaryPanelProps) {
  const isComplete = project.phase === "complete";

  const activeAgentCount = useMemo(
    () => agents.filter((a) => a.status !== "terminated" && a.status !== "complete").length,
    [agents]
  );

  const completedItems = useMemo(
    () => workItems.filter((w) => w.status === "complete"),
    [workItems]
  );

  const completionEndTime = useMemo(() => {
    const times = workItems
      .map((w) => w.completed_at)
      .filter((t): t is string => !!t)
      .map((t) => new Date(t).getTime());
    if (times.length > 0) return new Date(Math.max(...times)).toISOString();
    return project.updated_at;
  }, [workItems, project.updated_at]);

  const sortedWorkItems = useMemo(() => {
    return [...workItems].sort((a, b) => {
      if (a.completed_at && b.completed_at) {
        return new Date(a.completed_at).getTime() - new Date(b.completed_at).getTime();
      }
      if (a.completed_at) return -1;
      if (b.completed_at) return 1;
      return 0;
    });
  }, [workItems]);

  return (
    <div className="p-5 space-y-5 overflow-y-auto h-full">
      {/* Completion banner */}
      {isComplete && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900">
          <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-green-800 dark:text-green-300">
              Project Complete
            </p>
            <p className="text-xs text-green-600 dark:text-green-500">
              Completed in {formatDuration(project.created_at, completionEndTime)}
            </p>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-zinc-500 mb-1">
            <ListChecks className="h-3.5 w-3.5" />
            <span className="text-[10px] uppercase font-semibold tracking-wider">Items</span>
          </div>
          <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
            {completedItems.length}/{workItems.length}
          </p>
          {workItems.length > 0 && (
            <p className="text-[10px] text-zinc-500">
              {Math.round((completedItems.length / workItems.length) * 100)}% complete
            </p>
          )}
        </div>

        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-zinc-500 mb-1">
            <Users className="h-3.5 w-3.5" />
            <span className="text-[10px] uppercase font-semibold tracking-wider">Agents</span>
          </div>
          <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
            {activeAgentCount}
          </p>
          <p className="text-[10px] text-zinc-500">
            {isComplete ? "finished" : "active"}
          </p>
        </div>

        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-zinc-500 mb-1">
            <Clock className="h-3.5 w-3.5" />
            <span className="text-[10px] uppercase font-semibold tracking-wider">Duration</span>
          </div>
          <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
            {formatDuration(project.created_at, isComplete ? completionEndTime : undefined)}
          </p>
          <p className="text-[10px] text-zinc-500">
            {isComplete ? "total" : "elapsed"}
          </p>
        </div>
      </div>

      {/* Output location */}
      <div>
        <h4 className="text-[10px] uppercase font-semibold text-zinc-500 tracking-wider mb-2">
          Output Location
        </h4>
        {project.repo_source === "local" && project.working_directory ? (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800">
            <Folder className="h-4 w-4 text-zinc-400 flex-shrink-0" />
            <code className="text-sm text-zinc-700 dark:text-zinc-300 font-mono truncate">
              {project.working_directory}
            </code>
          </div>
        ) : project.repo_source === "remote" && project.repo_url ? (
          <a
            href={project.repo_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
          >
            <ExternalLink className="h-4 w-4 text-blue-500 flex-shrink-0" />
            <span className="text-sm text-blue-500 truncate">{project.repo_url}</span>
          </a>
        ) : (
          <p className="text-sm text-zinc-400 dark:text-zinc-600">No repository configured</p>
        )}
      </div>

      {/* Artifacts */}
      <div>
        <h4 className="text-[10px] uppercase font-semibold text-zinc-500 tracking-wider mb-2">
          Artifacts
        </h4>
        {artifacts.length === 0 ? (
          <p className="text-sm text-zinc-400 dark:text-zinc-600">No artifacts produced yet</p>
        ) : (
          <div className="space-y-1.5">
            {artifacts.map((artifact) => (
              <div
                key={artifact.id}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
              >
                {artifact.artifact_type === "pull_request" ? (
                  <GitPullRequest className="h-4 w-4 text-purple-400 flex-shrink-0" />
                ) : (
                  <FileText className="h-4 w-4 text-zinc-400 flex-shrink-0" />
                )}
                <span className="text-sm text-zinc-700 dark:text-zinc-300 truncate flex-1">
                  {artifact.name}
                </span>
                <Badge variant={approvalBadgeVariant(artifact.approval_status)}>
                  {artifact.approval_status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Work summary (complete mode only) */}
      {isComplete && sortedWorkItems.length > 0 && (
        <div>
          <h4 className="text-[10px] uppercase font-semibold text-zinc-500 tracking-wider mb-2">
            Work Summary
          </h4>
          <div className="space-y-1.5">
            {sortedWorkItems.map((item) => {
              const agent = agents.find((a) => a.id === item.assigned_agent_id);
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
                >
                  <CheckCircle className="h-3.5 w-3.5 text-green-400 flex-shrink-0" />
                  <span className="text-sm text-zinc-700 dark:text-zinc-300 truncate flex-1">
                    {item.title}
                  </span>
                  {agent && (
                    <span className="text-xs text-zinc-500 flex items-center gap-1 flex-shrink-0">
                      <span>{ROLE_EMOJI[agent.role]}</span>
                      <span>{ROLE_LABEL[agent.role]}</span>
                    </span>
                  )}
                  {item.completed_at && (
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-600 flex-shrink-0">
                      {new Date(item.completed_at).toLocaleTimeString()}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});
```

- [ ] **Step 2: Verify it builds**

Run: `cd web && bun run build 2>&1 | tail -5`
Expected: Build succeeds (component not yet imported anywhere)

- [ ] **Step 3: Commit**

```bash
git add web/src/components/project/summary-panel.tsx
git commit -m "feat: add SummaryPanel component with stats, artifacts, and completion view"
```

---

## Task 2: Update CosmoChatPanel offline messaging

**Files:**
- Modify: `web/src/components/project/cosmo-chat-panel.tsx`

- [ ] **Step 1: Add `projectPhase` prop to the interface**

Add `projectPhase: string;` to `CosmoChatPanelProps`:

```tsx
interface CosmoChatPanelProps {
  messages: ChatPanelMessage[];
  activities: AgentActivity[];
  orchestrator: Agent | null;
  projectPhase: string;
  chatInput: string;
  onChatInputChange: (value: string) => void;
  onSendMessage: () => Promise<void>;
  sending: boolean;
  error: string | null;
}
```

- [ ] **Step 2: Update the destructured props**

Add `projectPhase` to the destructured props in the function signature.

- [ ] **Step 3: Replace the `isOnline` and status logic**

Replace:
```tsx
const isOnline = orchestrator && orchestrator.status !== "terminated" && orchestrator.status !== "complete";
```

With:
```tsx
const isOnline = orchestrator && orchestrator.status !== "terminated" && orchestrator.status !== "complete";
const isCompleted = (orchestrator?.status === "complete") || (!orchestrator && projectPhase === "complete");
const statusText = isOnline ? "Orchestrating" : isCompleted ? "Completed" : "Offline";
const placeholderText = isOnline
  ? "Message Cosmo..."
  : isCompleted
    ? "Cosmo has finished"
    : "Cosmo is offline";
```

- [ ] **Step 4: Update the header status display**

Replace:
```tsx
<div className={`text-[11px] ${isOnline ? "text-green-400" : "text-zinc-500"}`}>
  {isOnline ? "Orchestrating" : "Offline"}
</div>
```

With:
```tsx
<div className={`text-[11px] ${isOnline ? "text-green-400" : isCompleted ? "text-blue-400" : "text-zinc-500"}`}>
  {statusText}
</div>
```

- [ ] **Step 5: Update the input placeholder**

Replace `placeholder={isOnline ? "Message Cosmo..." : "Cosmo is offline"}` with `placeholder={placeholderText}`.

- [ ] **Step 6: Verify it builds**

Run: `cd web && bun run build 2>&1 | tail -5`
Expected: Build may fail because page.tsx doesn't pass `projectPhase` yet — that's fine, we'll fix it in Task 3.

- [ ] **Step 7: Commit**

```bash
git add web/src/components/project/cosmo-chat-panel.tsx
git commit -m "feat: distinguish Completed vs Offline status in CosmoChatPanel"
```

---

## Task 3: Integrate Summary tab into page

**Files:**
- Modify: `web/src/app/(app)/projects/[id]/page.tsx`

- [ ] **Step 1: Add imports**

Add at the top with the other project component imports:
```tsx
import { SummaryPanel } from "@/components/project/summary-panel";
```

- [ ] **Step 2: Update boardTab state type**

Replace:
```tsx
const [boardTab, setBoardTab] = useState<"board" | "inbox">("board");
```

With:
```tsx
const [boardTab, setBoardTab] = useState<"board" | "inbox" | "summary">("board");
const initialTabApplied = useRef(false);
```

(Add `useRef` to the existing import from "react" if not already there.)

- [ ] **Step 3: Add auto-select useEffect**

After the `boardTab` state, add:
```tsx
useEffect(() => {
  if (project && project.phase === "complete" && !initialTabApplied.current) {
    initialTabApplied.current = true;
    setBoardTab("summary");
  }
}, [project]);
```

- [ ] **Step 4: Add Summary tab button**

In the tab buttons section (after the Inbox button), add the Summary tab:

```tsx
<button
  onClick={() => setBoardTab("summary")}
  className={`text-[13px] font-medium pb-0.5 transition-colors relative ${
    boardTab === "summary"
      ? "text-zinc-900 dark:text-zinc-100 border-b-2 border-blue-500"
      : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-400"
  }`}
>
  Summary
  {project.phase === "complete" && boardTab !== "summary" && (
    <span className="absolute -top-1 -right-3 w-2 h-2 rounded-full bg-green-500" />
  )}
</button>
```

- [ ] **Step 5: Add Summary tab content**

After the inbox tab content block, add:

```tsx
{boardTab === "summary" && project && (
  <div className="animate-tab-enter h-full">
    <SummaryPanel
      project={project}
      agents={agents}
      artifacts={artifacts}
      workItems={workItems}
    />
  </div>
)}
```

- [ ] **Step 6: Pass `projectPhase` to CosmoChatPanel**

Find the `<CosmoChatPanel` JSX and add the new prop:
```tsx
projectPhase={project?.phase ?? ""}
```

- [ ] **Step 7: Verify it builds**

Run: `cd web && bun run build 2>&1 | tail -10`
Expected: Build succeeds with no errors

- [ ] **Step 8: Run lint**

Run: `cd web && bun run lint 2>&1 | tail -10`
Expected: No new lint errors

- [ ] **Step 9: Commit**

```bash
git add web/src/app/\(app\)/projects/\[id\]/page.tsx
git commit -m "feat: integrate Summary tab with auto-select on project completion"
```

---

## Summary

| Task | File | What it does |
|------|------|-------------|
| 1 | summary-panel.tsx | New component — stats, output location, artifacts, completion banner, work summary |
| 2 | cosmo-chat-panel.tsx | Distinguish "Completed" vs "Offline" status with new `projectPhase` prop |
| 3 | page.tsx | Add Summary tab, auto-select on complete, pass new props |
