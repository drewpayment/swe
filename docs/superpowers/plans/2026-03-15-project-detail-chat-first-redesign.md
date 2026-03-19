# Project Detail Page — Chat-First Redesign

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the project detail page so Cosmo chat is always visible as the left panel with an inline activity feed, agents are shown as compact avatar circles in the board header, and the sidebar is eliminated.

**Architecture:** Replace the current 3-column (sidebar + tabs) layout with a 2-panel split: persistent Cosmo chat panel (left, ~420px) with woven activity feed, and board/inbox panel (right, fills remaining). Agent display changes from a full sidebar with cards to stacked avatar circles with status dots in the board header. The Chat tab is removed since chat is now always visible.

**Tech Stack:** Next.js 16, React 19, Tailwind v4, Lucide icons, existing shadcn-style components

**Wireframe reference:** `docs/design.pen` — node `bi8Au` ("Project Detail - Chat First")

**Important notes:**
- The orchestrator role is `"project_orchestrator"` (not `"orchestrator"`)
- New components MUST support both light and dark mode via `dark:` variants (see commit `b01e10d`)
- The `ChatPanelMessage` type must be exported from `cosmo-chat-panel.tsx` since the page references it

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/components/project/cosmo-chat-panel.tsx` | Persistent Cosmo chat with activity feed |
| Create | `src/components/project/agent-avatars.tsx` | Compact avatar stack with status dots + spawn |
| Modify | `src/app/(app)/projects/[id]/page.tsx` | New 2-panel layout, remove sidebar/tab state |
| Modify | `src/components/project/kanban-board.tsx` | Remove "Work Items" header (moved to board header) |
| Delete | `src/components/project/chat-panel.tsx` | Replaced by cosmo-chat-panel |
| Keep | `src/components/project/inbox-panel.tsx` | Still used in board tabs |
| Keep | `src/components/project/artifacts-panel.tsx` | Still used under board tab |
| Keep | `src/components/project/agents-sidebar.tsx` | Kept for now (can be removed after migration confirmed) |

---

## Chunk 1: New Components

### Task 1: Create AgentAvatars component

**Files:**
- Create: `web/src/components/project/agent-avatars.tsx`

This component replaces the full agents sidebar with a compact horizontal avatar stack. Each avatar is a circle with an emoji and status dot, overlapping slightly. Includes a "+" spawn button.

- [ ] **Step 1: Create the component file with types**

```tsx
// web/src/components/project/agent-avatars.tsx
"use client";

import { memo, useState, useRef, useEffect } from "react";
import { Plus } from "lucide-react";
import { Agent, AgentRole, ROLE_EMOJI, ROLE_LABEL, STATUS_COLOR } from "@/lib/types";
import { createAgent } from "@/lib/api";

interface AgentAvatarsProps {
  agents: Agent[];
  projectId: string;
  onRefresh: () => Promise<void>;
}

const SPAWNABLE_ROLES: AgentRole[] = [
  "architect",
  "coder",
  "sdet",
  "security",
  "sre",
  "devops",
];

function statusDotColor(status: string): string {
  switch (status) {
    case "active":
      return "bg-green-400";
    case "initializing":
      return "bg-yellow-400";
    case "waiting_for_human":
    case "waiting_for_agent":
      return "bg-blue-400";
    case "error":
      return "bg-red-400";
    case "idle":
    default:
      return "bg-zinc-500";
  }
}

export const AgentAvatars = memo(function AgentAvatars({
  agents,
  projectId,
  onRefresh,
}: AgentAvatarsProps) {
  const [showSpawnMenu, setShowSpawnMenu] = useState(false);
  const [spawning, setSpawning] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const activeAgents = agents.filter(
    (a) => a.status !== "terminated" && a.status !== "complete"
  );

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowSpawnMenu(false);
      }
    }
    if (showSpawnMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showSpawnMenu]);

  async function handleSpawn(role: AgentRole) {
    setSpawning(true);
    setShowSpawnMenu(false);
    try {
      await createAgent({
        project_id: projectId,
        role,
        name: ROLE_LABEL[role],
      });
      await onRefresh();
    } finally {
      setSpawning(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {/* Stacked avatar circles */}
      <div className="flex items-center -space-x-1">
        {activeAgents.map((agent) => (
          <div
            key={agent.id}
            className="relative w-7 h-7 rounded-full bg-zinc-200 dark:bg-zinc-800 border-2 border-white dark:border-zinc-900 flex items-center justify-center text-xs cursor-default"
            title={`${ROLE_LABEL[agent.role]} — ${agent.status}`}
          >
            <span>{ROLE_EMOJI[agent.role]}</span>
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border-[1.5px] border-white dark:border-zinc-900 ${statusDotColor(agent.status)}`}
            />
          </div>
        ))}
      </div>

      {/* Spawn button */}
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setShowSpawnMenu((v) => !v)}
          disabled={spawning}
          className="w-7 h-7 rounded-full bg-zinc-200 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 flex items-center justify-center text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors"
          aria-label="Spawn agent"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>

        {showSpawnMenu && (
          <div className="absolute right-0 top-full mt-2 w-44 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl z-50 py-1">
            {SPAWNABLE_ROLES.map((role) => (
              <button
                key={role}
                onClick={() => handleSpawn(role)}
                className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2"
              >
                <span>{ROLE_EMOJI[role]}</span>
                <span>{ROLE_LABEL[role]}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
```

- [ ] **Step 2: Verify it builds**

Run: `cd web && bun run build 2>&1 | head -30`
Expected: No TypeScript errors for this file

- [ ] **Step 3: Commit**

```bash
git add web/src/components/project/agent-avatars.tsx
git commit -m "feat: add AgentAvatars compact component for board header"
```

---

### Task 2: Create CosmoChatPanel component

**Files:**
- Create: `web/src/components/project/cosmo-chat-panel.tsx`

This is the hero component — a persistent chat panel with Cosmo's avatar/status header, message bubbles, inline activity feed, and message input. It replaces both the old ChatPanel and the Chat tab.

- [ ] **Step 1: Create the component file**

```tsx
// web/src/components/project/cosmo-chat-panel.tsx
"use client";

import { memo, useRef, useEffect } from "react";
import { ArrowUp } from "lucide-react";
import { Agent, ROLE_EMOJI, ROLE_LABEL } from "@/lib/types";

export interface ChatPanelMessage {
  from: string;
  content: string;
  time: string;
  role: string;
}

export interface AgentActivity {
  agentRole: string;
  action: string;
  target: string;
  timestamp: string;
}

interface CosmoChatPanelProps {
  messages: ChatPanelMessage[];
  activities: AgentActivity[];
  orchestrator: Agent | null;
  chatInput: string;
  onChatInputChange: (value: string) => void;
  onSendMessage: () => Promise<void>;
  sending: boolean;
  error: string | null;
}

function activityDotColor(role: string): string {
  switch (role) {
    case "coder":
      return "bg-green-400";
    case "sdet":
      return "bg-blue-400";
    case "architect":
      return "bg-purple-400";
    case "security":
      return "bg-red-400";
    case "sre":
    case "devops":
      return "bg-yellow-400";
    default:
      return "bg-zinc-500";
  }
}

export const CosmoChatPanel = memo(function CosmoChatPanel({
  messages,
  activities,
  orchestrator,
  chatInput,
  onChatInputChange,
  onSendMessage,
  sending,
  error,
}: CosmoChatPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isOnline = orchestrator && orchestrator.status !== "terminated" && orchestrator.status !== "complete";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activities]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey && chatInput.trim() && !sending) {
      e.preventDefault();
      onSendMessage();
    }
  }

  return (
    <div className="flex flex-col w-[420px] min-w-[420px] h-full bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3.5 border-b border-zinc-200 dark:border-zinc-800">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center text-base">
          🚀
        </div>
        <div>
          <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Cosmo</div>
          <div className={`text-[11px] ${isOnline ? "text-green-400" : "text-zinc-500"}`}>
            {isOnline ? "Orchestrating" : "Offline"}
          </div>
        </div>
      </div>

      {/* Messages + Activity */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5">
        {messages.map((msg, i) => {
          const isUser = msg.role === "user";
          return (
            <div
              key={i}
              className={`flex ${isUser ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] px-3.5 py-2.5 text-[13px] leading-relaxed ${
                  isUser
                    ? "bg-blue-600 text-white rounded-xl rounded-br-sm"
                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl rounded-bl-sm"
                }`}
              >
                {msg.content}
              </div>
            </div>
          );
        })}

        {/* Activity divider + feed (only if activities exist) */}
        {activities.length > 0 && (
          <>
            <div className="flex items-center gap-2.5 py-1">
              <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-800" />
              <span className="text-[10px] text-zinc-400 dark:text-zinc-600 tracking-wider font-medium">
                Activity
              </span>
              <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-800" />
            </div>
            {activities.map((act, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px] text-zinc-500">
                <span className={`w-1.5 h-1.5 rounded-full ${activityDotColor(act.agentRole)}`} />
                <span>
                  {ROLE_LABEL[act.agentRole as keyof typeof ROLE_LABEL] ?? act.agentRole}{" "}
                  {act.action} &quot;{act.target}&quot;
                </span>
              </div>
            ))}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-2 text-xs text-red-400 bg-red-950/30">
          {error}
        </div>
      )}

      {/* Input */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-zinc-200 dark:border-zinc-800">
        <input
          type="text"
          value={chatInput}
          onChange={(e) => onChatInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isOnline ? "Message Cosmo..." : "Cosmo is offline"}
          disabled={!isOnline || sending}
          className="flex-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg px-3.5 py-2.5 text-[13px] text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 dark:placeholder-zinc-600 border-none outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-700 disabled:opacity-50"
        />
        <button
          onClick={onSendMessage}
          disabled={!isOnline || !chatInput.trim() || sending}
          className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:hover:bg-blue-600"
          aria-label="Send message"
        >
          <ArrowUp className="w-[18px] h-[18px]" />
        </button>
      </div>
    </div>
  );
});
```

- [ ] **Step 2: Verify it builds**

Run: `cd web && bun run build 2>&1 | head -30`
Expected: No TypeScript errors for this file

- [ ] **Step 3: Commit**

```bash
git add web/src/components/project/cosmo-chat-panel.tsx
git commit -m "feat: add CosmoChatPanel with inline activity feed"
```

---

## Chunk 2: Rewire the Page Layout

### Task 3: Update the project detail page layout

**Files:**
- Modify: `web/src/app/(app)/projects/[id]/page.tsx`

This is the main integration task. We replace the 3-column sidebar+tabs layout with the 2-panel chat+board layout.

**Key changes:**
1. Remove `AgentsSidebar` import and usage
2. Remove `activeTab` state (no more Board/Inbox/Chat tabs — Chat is always visible, Board/Inbox remain as tabs in the right panel)
3. Add `AgentAvatars` to the board header
4. Add `CosmoChatPanel` as the left panel
5. Build activity feed from WebSocket events
6. Restructure the layout to match the wireframe

- [ ] **Step 1: Add new imports, remove old ones**

At the top of `page.tsx`, make these import changes:

Replace:
```tsx
import { AgentsSidebar } from "@/components/project/agents-sidebar";
import { ChatPanel } from "@/components/project/chat-panel";
import type { ChatMessage as ChatPanelMessage } from "@/components/project/chat-panel";
```

With:
```tsx
import { CosmoChatPanel } from "@/components/project/cosmo-chat-panel";
import type { ChatPanelMessage, AgentActivity } from "@/components/project/cosmo-chat-panel";
import { AgentAvatars } from "@/components/project/agent-avatars";
```

- [ ] **Step 2: Update state — remove activeTab, add activities**

Replace:
```tsx
const [activeTab, setActiveTab] = useState<"board" | "inbox" | "chat">("board");
```

With:
```tsx
const [boardTab, setBoardTab] = useState<"board" | "inbox">("board");
const [activities, setActivities] = useState<AgentActivity[]>([]);
```

- [ ] **Step 3: Add activity tracking from WebSocket events**

Inside the WebSocket event handler (the `useEffect` that processes `events`), add activity tracking for relevant event types. After the existing event processing switch/if-else block, add:

```tsx
// Build activity from agent_status and work_item_update events
if (latestEvent.type === "agent_status" || latestEvent.type === "work_item_update") {
  const agent = agents.find((a) => a.id === latestEvent.agent_id);
  if (agent) {
    const action = latestEvent.type === "agent_status"
      ? (latestEvent.status as string) ?? "updated"
      : (latestEvent.action as string) ?? "updated";
    const target = (latestEvent.work_item_title as string) ?? (latestEvent.name as string) ?? "";
    if (target) {
      setActivities((prev) => [
        ...prev.slice(-19), // Keep last 20
        {
          agentRole: agent.role,
          action,
          target,
          timestamp: new Date().toISOString(),
        },
      ]);
    }
  }
}
```

- [ ] **Step 4: Find the orchestrator agent for CosmoChatPanel**

Add after existing computed values (near `completedItems`):

```tsx
const orchestrator = agents.find((a) => a.role === "project_orchestrator") ?? null;
```

- [ ] **Step 5: Replace the layout JSX**

Replace the entire main content area (from the `<div className="grid grid-cols-1 lg:grid-cols-12 gap-6">` through to its closing `</div>`) with:

```tsx
{/* Two-panel layout: Chat + Board */}
<div className="flex gap-4 flex-1 min-h-0">
  {/* Left: Cosmo Chat Panel */}
  <CosmoChatPanel
    messages={chatMessages}
    activities={activities}
    orchestrator={orchestrator}
    chatInput={chatInput}
    onChatInputChange={setChatInput}
    onSendMessage={handleSendChat}
    sending={chatSending}
    error={chatError}
  />

  {/* Right: Board Panel */}
  <div className="flex-1 flex flex-col bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden min-w-0">
    {/* Board Header: Tabs + Agent Avatars */}
    <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
      <div className="flex items-center gap-4">
        <button
          onClick={() => setBoardTab("board")}
          className={`text-[13px] font-medium pb-0.5 transition-colors ${
            boardTab === "board"
              ? "text-zinc-900 dark:text-zinc-100 border-b-2 border-blue-500"
              : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-400"
          }`}
        >
          Board
        </button>
        <button
          onClick={() => setBoardTab("inbox")}
          className={`text-[13px] font-medium pb-0.5 transition-colors relative ${
            boardTab === "inbox"
              ? "text-zinc-900 dark:text-zinc-100 border-b-2 border-blue-500"
              : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-400"
          }`}
        >
          Inbox
          {notifications.filter((n) => !n.read).length > 0 && (
            <span className="absolute -top-1 -right-3 w-2 h-2 rounded-full bg-blue-500" />
          )}
        </button>
      </div>

      <AgentAvatars
        agents={agents}
        projectId={id}
        onRefresh={refreshAll}
      />
    </div>

    {/* Board Content */}
    <div className="flex-1 overflow-y-auto">
      {boardTab === "board" && (
        <div className="animate-tab-enter">
          <KanbanBoard
            workItems={workItems}
            agents={agents}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
          />
          <ArtifactsPanel artifacts={artifacts} />
        </div>
      )}

      {boardTab === "inbox" && (
        <div className="animate-tab-enter">
          <InboxPanel
            notifications={notifications}
            agents={agents}
            loading={notificationsLoading}
            onMarkRead={handleMarkRead}
            onMarkAllRead={handleMarkAllRead}
            onReply={handleInboxReply}
            replyState={{
              input: inboxReplyInput,
              sending: inboxReplySending,
              error: inboxReplyError,
            }}
            onReplyInputChange={setInboxReplyInput}
          />
        </div>
      )}
    </div>
  </div>
</div>
```

- [ ] **Step 6: Update the outer page container**

The outer wrapper currently uses `space-y-6`. Change it to use flex column to ensure the two-panel layout fills the available height:

Replace:
```tsx
<div className="space-y-6">
```

With:
```tsx
<div className="flex flex-col h-full gap-4">
```

Make sure the header and progress bar sections remain before the two-panel layout and don't flex-grow. The progress row and header should keep their existing markup. Only the main content area (the two-panel `flex` div) should have `flex-1 min-h-0`.

- [ ] **Step 7: Remove old tab state references**

Search for any remaining references to `activeTab` and the old tab switching UI (the `<div role="tablist">` block). Remove them. Also remove the old `AgentsSidebar` usage from the JSX.

- [ ] **Step 8: Remove old Chat tab notification polling logic**

The page currently has notification polling tied to `activeTab === "inbox"`. Update the condition to use `boardTab === "inbox"` instead.

- [ ] **Step 9: Update the chat send handler**

The current `handleSendChat` targets `targetAgentId`. Update it to always target the orchestrator:

Replace the line that uses `targetAgentId` in `handleSendChat` with:
```tsx
const targetId = orchestrator?.id;
if (!targetId) return;
```

Remove the `targetAgentId` and `setTargetAgentId` state since we no longer need agent selection for chat.

Also remove the `handleAgentDeleted` function entirely — it references `targetAgentId` and was only used by `AgentsSidebar` which is no longer rendered. Remove the `setTargetAgentId` call in the `fetchData` effect too (lines ~124-133 that set default target agent).

Update the sent message display in `handleSendChat` — change the "from" field from using `activeAgents.find(...)` to always show `"You -> Cosmo"`.

- [ ] **Step 10: Verify it builds**

Run: `cd web && bun run build 2>&1 | tail -20`
Expected: Build succeeds with no errors

- [ ] **Step 11: Run dev server and verify visually**

Run: `cd web && bun run dev`
Open: `http://localhost:3000/projects/<id>`

Verify:
- Chat panel visible on the left with Cosmo header
- Board panel on the right with agent avatars in header
- Board/Inbox tabs work
- No sidebar visible
- Messages send correctly
- Activity feed appears when agents do work

- [ ] **Step 12: Commit**

```bash
git add web/src/app/\(app\)/projects/\[id\]/page.tsx
git commit -m "feat: rewire project detail page to chat-first 2-panel layout"
```

---

### Task 4: Clean up KanbanBoard header

**Files:**
- Modify: `web/src/components/project/kanban-board.tsx`

The KanbanBoard currently has its own "Work Items" header with count and Board/List toggle. Since the board header is now in the parent, we should simplify. Keep the Board/List view toggle but move it to be more compact.

- [ ] **Step 1: Simplify the header section**

In `kanban-board.tsx`, the top section has a "Work Items" h2 with count and the view toggle. Replace it with just the view toggle aligned to the right:

Replace the header div that contains "Work Items" text with:
```tsx
<div className="flex items-center justify-end px-4 pt-3 pb-1">
  <div className="flex items-center gap-1 rounded-lg bg-zinc-800/50 p-0.5">
    <button
      onClick={() => onViewModeChange("kanban")}
      className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
        viewMode === "kanban"
          ? "bg-blue-600 text-white"
          : "text-zinc-400 hover:text-zinc-300"
      }`}
    >
      Board
    </button>
    <button
      onClick={() => onViewModeChange("list")}
      className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
        viewMode === "list"
          ? "bg-blue-600 text-white"
          : "text-zinc-400 hover:text-zinc-300"
      }`}
    >
      List
    </button>
  </div>
</div>
```

- [ ] **Step 2: Verify it builds**

Run: `cd web && bun run build 2>&1 | tail -10`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add web/src/components/project/kanban-board.tsx
git commit -m "refactor: simplify kanban board header for new layout"
```

---

## Chunk 3: Cleanup & Polish

### Task 5: Ensure full-height layout from app layout down

**Files:**
- Modify: `web/src/app/(app)/layout.tsx`

The two-panel layout needs the page to fill the viewport height. The app layout's main content area needs `h-full` / `min-h-0` to allow the flex children to fill available space.

- [ ] **Step 1: Check the main content wrapper**

In `layout.tsx`, the current markup is:

```tsx
<main className="flex-1 overflow-y-auto">
  <div className="mx-auto max-w-7xl px-6 py-8 lg:pt-8 pt-16">{children}</div>
</main>
```

Replace it with:

```tsx
<main className="flex-1 flex flex-col min-h-0 overflow-hidden">
  <div className="mx-auto max-w-7xl px-6 py-8 lg:pt-8 pt-16 flex-1 flex flex-col min-h-0">{children}</div>
</main>
```

Both the `<main>` and the inner wrapper need `flex-1 flex flex-col min-h-0` so the project page's two-panel layout can fill the remaining viewport height. The `overflow-y-auto` moves from main to the individual panels (chat panel scrolls messages, board panel scrolls kanban).

- [ ] **Step 2: Verify the layout renders correctly at full height**

Run: `cd web && bun run dev`
Check that the chat panel and board panel stretch to fill the viewport below the header/progress bar.

- [ ] **Step 3: Commit**

```bash
git add web/src/app/\(app\)/layout.tsx
git commit -m "fix: ensure app layout supports full-height flex children"
```

---

### Task 6: Remove dead code

**Files:**
- Modify: `web/src/app/(app)/projects/[id]/page.tsx` — remove unused imports
- Keep: `web/src/components/project/agents-sidebar.tsx` — keep file but remove import from page
- Keep: `web/src/components/project/chat-panel.tsx` — keep file but remove import from page

- [ ] **Step 1: Remove unused imports and state from page.tsx**

Ensure these are removed if still present:
- `import { AgentsSidebar }`
- `import { ChatPanel }`
- `import type { ChatMessage as ChatPanelMessage } from "@/components/project/chat-panel"`
- `useState` for `activeTab`
- `useState` for `targetAgentId`
- The `handleAgentDeleted` function (references removed `targetAgentId`)
- The `setTargetAgentId` call in `fetchData` (lines ~124-133)
- Any references to the old tab switching

- [ ] **Step 2: Verify clean build**

Run: `cd web && bun run build 2>&1 | tail -10`
Expected: Build succeeds with no warnings about unused imports

- [ ] **Step 3: Run lint**

Run: `cd web && bun run lint 2>&1 | tail -20`
Expected: No lint errors

- [ ] **Step 4: Commit**

```bash
git add -u web/src/
git commit -m "chore: remove unused sidebar and chat tab imports"
```

---

## Summary

| Task | Component | What it does |
|------|-----------|-------------|
| 1 | AgentAvatars | Compact avatar circles with status dots + spawn menu |
| 2 | CosmoChatPanel | Persistent chat panel with activity feed |
| 3 | Page layout | Rewire to 2-panel split, remove sidebar/tabs |
| 4 | KanbanBoard | Simplify header for new layout |
| 5 | App layout | Ensure full-height flex layout |
| 6 | Cleanup | Remove dead code and unused imports |
