# Cosmo + OpenCode Integration Design

**Date:** 2026-03-14
**Status:** Approved
**Author:** Human + Claude

## Problem Statement

The SWE agentic platform has agents that talk about code but never write any. Specialist agents (architect, coder, sdet) call an LLM and describe what they'd do, but produce no files, commits, or tangible output. Agent workflows crash on LLM timeouts and never restart. There's no concept of a working codebase, no way for the orchestrator to proactively communicate with the user, and no escalation path when agents get stuck.

## Goals

1. Agents produce real code in real git repositories
2. The orchestrator ("Cosmo") proactively communicates with the user via an inbox/notification system
3. Projects are tied to actual codebases (local directories or remote repos)
4. Agents are resilient — they recover from crashes and continue working
5. The platform is provider-agnostic — any LLM provider with tool calling is supported

## Architecture Overview

**Cosmo** (the orchestrator) handles project management, task assignment, monitoring, and human communication. **OpenCode** (provider-agnostic coding agent) handles actual code production — file editing, git commits, test execution. **Temporal** provides durable orchestration connecting them.

```
Human <--inbox/chat--> Cosmo (orchestrator)
                          |
                    assigns work items
                          |
              +-----------+-----------+
              |           |           |
          Architect     Coder       SDET
              |           |           |
              +-----+-----+-----+----+
                    |
              OpenCode Server
              (per project)
                    |
              Git Repository
              (local or cloned)
```

## Section 1: Project & Repository Model

### Schema Changes

Migration file: `migrations/003_cosmo_opencode.sql`

Add to `projects` table:

```sql
ALTER TABLE projects ADD COLUMN working_directory TEXT;
ALTER TABLE projects ADD COLUMN repo_source TEXT NOT NULL DEFAULT 'none'
  CHECK (repo_source IN ('local', 'remote', 'none'));
```

- `repo_url` (existing) — remote git URL
- `working_directory` (new) — local filesystem path where repo lives
- `repo_source` (new) — enum: `local`, `remote`, `none`

### Project Creation Flows

1. **User provides `repo_url`** — platform clones to `~/.swe/projects/<project-id>/`, sets `working_directory` automatically, sets `repo_source = 'remote'`
2. **User provides `working_directory`** — platform validates path exists, checks if it's a git repo, sets `repo_source = 'local'`
3. **Neither provided** — sets `repo_source = 'none'`, Cosmo creates an inbox notification asking for a repo

### Default Clone Location

`~/.swe/projects/<project-id>/` — configurable via platform settings.

### Go Type Changes

New fields added to the existing `Project` struct (which already has ID, Name, Description, Phase, Status, RepoURL, ActiveAgentIDs, ArtifactIDs, Decisions, WorkflowID, InitialPrompt, CreatedAt, UpdatedAt):

```go
// Add to existing Project struct:
WorkingDirectory *string `json:"working_directory,omitempty" db:"working_directory"`
RepoSource       string  `json:"repo_source" db:"repo_source"`
```

New field added to the existing `CreateProjectRequest` (which already has Name, Description, RepoURL, InitialPrompt):

```go
// Add to existing CreateProjectRequest:
WorkingDirectory *string `json:"working_directory,omitempty"`
```

## Section 2: OpenCode Server Lifecycle

### One Server Per Active Project

Each project with a configured repository gets its own `opencode serve` instance, managed by the Temporal worker.

### Lifecycle

1. **Lazy start** — when a specialist agent first needs to do coding work, a Temporal activity starts `opencode serve` pointed at the project's `working_directory`
2. **Health tracking** — the project stores the OpenCode server's URL/port. Periodic health check (30s) pings it.
3. **Auto-stop** — no agent activity for 30 minutes triggers server shutdown
4. **Restart on demand** — if an agent needs to work and the server is stopped, it restarts automatically

### Port Management

Each OpenCode server gets a port from a pool (9100-9199). Allocation strategy:

- **In-memory map** in the worker process: `map[string]int` (project ID → port)
- **Redis hash** `swe:opencode:ports` mirrors the map for crash recovery. On worker startup, it reads Redis to reclaim any ports from a previous instance.
- **On allocation**: atomically set in Redis hash (`HSETNX swe:opencode:ports <project-id> <port>`), then update in-memory map
- **On deallocation**: delete from Redis hash and in-memory map
- **Stale port cleanup**: on startup, health-check all ports in Redis. If a port's server is unreachable, free it.
- **Single worker assumption for MVP**: no distributed locking needed. If horizontal scaling is added later, use Redis `HSETNX` for atomic allocation.

### Agent Sessions

Each specialist agent creates an OpenCode session via the HTTP API. Sessions persist conversation context across tasks — the architect can reference previous design decisions in follow-up work.

### OpenCode Invocation Details

**Binary**: `opencode` must be in PATH (installed via `go install` or binary download).

**Starting a server**: `exec.Command("opencode", "serve", "--port", "<port>")` with `cmd.Dir` set to the project's `working_directory`. The worker holds a reference to the `*exec.Cmd` for lifecycle management.

**Configuration**: OpenCode reads `opencode.json` from the working directory. The platform writes a minimal config before starting:
```json
{
    "provider": "<from platform LLM settings>",
    "model": "<from platform LLM settings>"
}
```

**OpenCode HTTP API endpoints used** (see [OpenCode Server Docs](https://opencode.ai/docs/server/)):
- `GET /api/health` — health check
- `POST /api/session` — create a new session, returns `{ "id": "..." }`
- `POST /api/session/{id}/message` — send a message, returns the response
- `GET /api/session/{id}` — get session state including conversation history

### Temporal Activity: `StartOpenCodeServer`

```go
type StartOpenCodeServerInput struct {
    ProjectID        string `json:"project_id"`
    WorkingDirectory string `json:"working_directory"`
}
type StartOpenCodeServerOutput struct {
    ServerURL string `json:"server_url"`
    Port      int    `json:"port"`
}
```

Implementation: allocates a port, writes `opencode.json` config, spawns `opencode serve --port <port>`, waits for health check to pass (up to 30s), returns the URL.

### Temporal Activity: `ExecuteCodeTask`

```go
type ExecuteCodeTaskInput struct {
    ServerURL      string `json:"server_url"`
    SessionID      string `json:"session_id"`
    AgentRole      string `json:"agent_role"`
    TaskPrompt     string `json:"task_prompt"`
    ProjectContext string `json:"project_context"`
}
type ExecuteCodeTaskOutput struct {
    Response     string   `json:"response"`
    FilesChanged []string `json:"files_changed"`
    Commits      []string `json:"commits"`
    Success      bool     `json:"success"`
    Error        string   `json:"error,omitempty"`
}
```

Implementation: sends `POST /api/session/{id}/message` with the task prompt. Parses the response to extract file changes and commits (from OpenCode's structured output). Timeout: 5 minutes per task (coding can take time).

### Responsibility Split

| Cosmo (our orchestrator) | OpenCode |
|---|---|
| Plans the project, creates work items | Writes actual code |
| Assigns tasks to agents | Edits files, runs tests |
| Monitors progress, restarts stalled agents | Creates git commits |
| Communicates with the human via inbox | Manages LSP, understands repo context |
| Uses LLM for thinking/planning | Uses LLM for coding/implementing |

## Section 3: Notification / Inbox System

Cosmo's primary communication channel with the human.

### Schema: `notifications` table

```sql
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK (type IN ('action_needed', 'status_update', 'approval_request', 'info')),
    priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'critical')),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    read BOOLEAN NOT NULL DEFAULT FALSE,
    action_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_project ON notifications(project_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications(read, created_at DESC) WHERE read = FALSE;
```

### Go Types

```go
type NotificationType string
const (
    NotifActionNeeded    NotificationType = "action_needed"
    NotifStatusUpdate    NotificationType = "status_update"
    NotifApprovalRequest NotificationType = "approval_request"
    NotifInfo            NotificationType = "info"
)

type Notification struct {
    ID        string           `json:"id" db:"id"`
    ProjectID string           `json:"project_id" db:"project_id"`
    AgentID   *string          `json:"agent_id,omitempty" db:"agent_id"`
    Type      NotificationType `json:"type" db:"type"`
    Priority  string           `json:"priority" db:"priority"`
    Title     string           `json:"title" db:"title"`
    Body      string           `json:"body" db:"body"`
    Read      bool             `json:"read" db:"read"`
    ActionURL *string          `json:"action_url,omitempty" db:"action_url"`
    CreatedAt time.Time        `json:"created_at" db:"created_at"`
}
```

### API Endpoints

- `GET /api/v1/notifications` — list notifications (query params: `project_id`, `unread_only`, `type`)
- `GET /api/v1/notifications/unread-count` — returns `{ "count": 5 }`
- `PATCH /api/v1/notifications/{id}/read` — mark as read
- `POST /api/v1/notifications/mark-all-read` — mark all read (optional `project_id` filter)

### WebSocket Event

New event type `notification_created`:
```json
{
    "type": "notification_created",
    "notification": { "id": "...", "title": "...", "type": "action_needed", "priority": "high" },
    "project_id": "..."
}
```

### Cosmo's Voice

Notifications are written in Cosmo's personality — friendly, concise, actionable:

- "Hey! The coder just wrapped up the game loop. 2 files changed, looking clean."
- "Heads up — the architect has been idle for 15 minutes on the API design task. Want me to nudge them?"
- "I need a repo to get started! Drop a URL or local path and I'll rally the team."

### Temporal Activity: `CreateNotification`

```go
type CreateNotificationInput struct {
    ProjectID string  `json:"project_id"`
    AgentID   *string `json:"agent_id,omitempty"`
    Type      string  `json:"type"`
    Priority  string  `json:"priority"`
    Title     string  `json:"title"`
    Body      string  `json:"body"`
    ActionURL *string `json:"action_url,omitempty"`
}
```

Note: `AgentID` and `ActionURL` are `*string` (nullable) to match the DB schema. Notifications from Cosmo directly have `AgentID = nil`.

Creates the DB record and broadcasts via WebSocket.

### API Pagination

`GET /api/v1/notifications` supports pagination:
- `limit` (default 50, max 200)
- `offset` (default 0)
- Response includes `total` count for UI pagination

## Section 4: Revised Agent Workflows

### Cosmo's Workflow (project_orchestrator)

Enhanced from current design:

1. **On project creation** — checks if repo is configured. If not, creates `action_needed` notification and waits for human to provide one.
2. **On initial context** — calls LLM to plan, creates work items, spawns specialist agents, assigns work. Creates `status_update` notification summarizing the plan.
3. **On heartbeat (every 2 min):**
   - Checks agent health (are OpenCode sessions responsive?)
   - Checks work item progress
   - If agent stalled: attempts restart, creates notification if restart fails
   - If work items complete: assesses via LLM whether to advance phase
   - Creates notifications for important events
4. **Stalled agent recovery** — if a specialist agent's workflow terminated or OpenCode session is unresponsive, Cosmo restarts the agent and reassigns the work item
5. **Phase advancement** — when milestones reached, Cosmo notifies the human and advances the phase
6. **On user message** — responds with project status, can create/reassign work items, spawn agents per user request

### Specialist Agent Workflow (architect, coder, sdet)

Completely redesigned to use OpenCode:

1. **On start** — creates an OpenCode session for this agent in the project's server
2. **On assigned work item:**
   - Sends task to OpenCode via HTTP API
   - Prompt includes: work item title + description, project context, role-specific instructions
   - Monitors OpenCode execution (poll or stream for response)
   - OpenCode edits files, runs commands, creates git commits
3. **On completion** — extracts results (files changed, commits, test output), updates work item status, broadcasts to UI, notifies Cosmo
4. **On error/stuck:**
   - First: tries to resolve via own LLM reasoning
   - Then: escalates to Cosmo
   - Finally: Cosmo escalates to human via notification
5. **On heartbeat (every 3 min)** — checks for new assigned work items, continues current work
6. **On user message** — responds with current work context, can forward instructions to OpenCode session

### Escalation Chain

```
OpenCode <-> Specialist Agent <-> Cosmo <-> Human
```

Each layer tries to resolve before escalating. The human only gets pulled in when it actually matters.

### Crash Resilience

- **Temporal retries** — workflow crashes are retried automatically
- **OpenCode session persistence** — sessions survive across workflow restarts (server-side state)
- **Cosmo monitors** — detects terminated agents, respawns them
- **Graceful LLM degradation** — on timeout, agent enters `waiting` state and retries on next heartbeat instead of crashing

## Section 5: UI Changes

### Sidebar

- **Cosmo notification bell** — top of sidebar, bell icon with unread count badge
- Click opens dropdown panel showing recent notifications across all projects
- Each notification clickable — navigates to relevant page

### Project Creation (`/projects/new`)

- **Repo source toggle** — radio buttons: "Remote Repository", "Local Directory", "I'll add one later"
- Remote: existing URL field
- Local: file path input with placeholder `~/dev/my-project`
- Later: Cosmo will prompt via inbox

### Project Detail (`/projects/[id]`)

- **Project inbox tab** — notifications filtered to this project, read/unread styling, Cosmo's avatar
- **Repo status indicator** — badge near header: "Connected to github.com/user/repo", "Local: ~/dev/snake-game", or "No repo configured"
- **Agent cards enhanced** — last activity timestamp, OpenCode session status, files changed count
- **Work item cards enhanced** — git branch name, commit count, PR link if exists

### Agent Detail (`/projects/[id]/agents/[agentId]`)

- **Code activity section** — recent file changes and commits from this agent's OpenCode session (actual diffs and file names, not just chat)
- **Session status** — whether OpenCode session is active, what it's currently doing

### Cosmo's Identity

- **Display name:** "Cosmo" (not "Project Orchestrator")
- **Avatar:** rocket emoji or custom astronaut icon
- **Consistent presence** in inbox, chat, agent list, and notifications
- **Update `ROLE_LABEL`** in `web/src/lib/types.ts`: change `project_orchestrator: "Project Orchestrator"` to `project_orchestrator: "Cosmo"`
- **Update `ROLE_EMOJI`**: change `project_orchestrator: "🎯"` to `project_orchestrator: "🚀"`

## Dependencies

- **OpenCode** — installed on the host or available in PATH. Version >= latest stable. Install: `go install github.com/opencode-ai/opencode@latest` or download binary.
- **Git** — available on the host for repo operations
- **New DB migration** — `migrations/003_cosmo_opencode.sql` containing: `notifications` table, `working_directory` + `repo_source` columns on `projects`

## Docker Considerations

The current architecture runs the worker inside Docker (`swe-worker` service). For the MVP:

- **OpenCode runs on the host, not in Docker.** The worker container cannot easily spawn host processes.
- **Option A (recommended for MVP):** Run the Temporal worker on the host (not in Docker) so it can spawn OpenCode processes and access local repos. The other services (Temporal, PostgreSQL, Redis, LiteLLM) stay in Docker.
- **Option B (future):** Mount the host filesystem into the worker container and install OpenCode in the container image. More complex but keeps everything containerized.

The `swe-worker` service in `docker-compose.yml` should be commented out or made optional when running the worker on the host.

## Out of Scope

- Email/Slack notification delivery (future enhancement)
- PR creation on remote repos (future — agents commit locally, human pushes)
- Sandbox/Docker isolation for OpenCode (future — MVP runs on host)
- Multi-tenant support (single user for now)
- `user_id` column on notifications (add when multi-tenant is implemented)
