# Cosmo + OpenCode Integration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the SWE platform so agents produce real code in git repos, orchestrated by "Cosmo" who communicates with users via an inbox/notification system.

**Architecture:** Cosmo (orchestrator) uses LLM for planning and management. Specialist agents delegate coding to OpenCode servers (one per project) that write files, run tests, and create git commits in real repositories. A notification system lets Cosmo proactively communicate with the user.

**Tech Stack:** Go, Temporal, PostgreSQL, OpenCode CLI, Next.js/React, WebSocket

**Spec:** `docs/plans/2026-03-14-cosmo-opencode-integration-design.md`

---

## Chunk 1: Database Migration + Go Types

Foundation layer — schema changes and domain types that everything else depends on.

### Task 1: Create migration file

**Files:**
- Create: `migrations/003_cosmo_opencode.sql`

- [ ] **Step 1: Write the migration**

```sql
-- migrations/003_cosmo_opencode.sql
-- Cosmo + OpenCode integration: notifications, project repo fields

-- Add repo fields to projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS working_directory TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS repo_source TEXT NOT NULL DEFAULT 'none'
  CHECK (repo_source IN ('local', 'remote', 'none'));

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
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

CREATE INDEX IF NOT EXISTS idx_notifications_project ON notifications(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(read, created_at DESC) WHERE read = FALSE;
```

- [ ] **Step 2: Apply migration locally**

Run: `docker compose exec postgres psql -U swe -d swe -f /dev/stdin < migrations/003_cosmo_opencode.sql`
Expected: Tables and columns created without errors.

- [ ] **Step 3: Commit**

```bash
git add migrations/003_cosmo_opencode.sql
git commit -m "feat: add migration for notifications and project repo fields"
```

### Task 2: Add notification types to Go core

**Files:**
- Modify: `internal/core/types.go`

- [ ] **Step 1: Add NotificationType and Notification struct**

Add after the `ChatMessage` struct (around line 230):

```go
// NotificationType represents the kind of notification.
type NotificationType string

const (
	NotifActionNeeded    NotificationType = "action_needed"
	NotifStatusUpdate    NotificationType = "status_update"
	NotifApprovalRequest NotificationType = "approval_request"
	NotifInfo            NotificationType = "info"
)

// Notification is a message from Cosmo to the human.
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

- [ ] **Step 2: Add repo fields to Project struct**

Add to the existing `Project` struct (after `RepoURL`):

```go
WorkingDirectory *string `json:"working_directory,omitempty" db:"working_directory"`
RepoSource       string  `json:"repo_source" db:"repo_source"`
```

- [ ] **Step 3: Add WorkingDirectory to CreateProjectRequest**

Add to the existing `CreateProjectRequest` struct:

```go
WorkingDirectory *string `json:"working_directory,omitempty"`
```

- [ ] **Step 4: Build and verify**

Run: `go build ./...`
Expected: Clean build, no errors.

- [ ] **Step 5: Commit**

```bash
git add internal/core/types.go
git commit -m "feat: add Notification type and project repo fields to core types"
```

### Task 3: Add notification DB functions

**Files:**
- Create: `internal/db/notifications.go`

- [ ] **Step 1: Create the notifications DB file**

```go
package db

import (
	"context"
	"fmt"

	"github.com/drewpayment/swe/internal/core"
	"github.com/jackc/pgx/v5"
)

func (p *Pool) InsertNotification(ctx context.Context, projectID string, agentID *string, ntype core.NotificationType, priority, title, body string, actionURL *string) (*core.Notification, error) {
	row := p.pool.QueryRow(ctx,
		`INSERT INTO notifications (project_id, agent_id, type, priority, title, body, action_url)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 RETURNING id, project_id, agent_id, type, priority, title, body, read, action_url, created_at`,
		projectID, agentID, ntype, priority, title, body, actionURL,
	)
	return scanNotification(row)
}

func (p *Pool) ListNotifications(ctx context.Context, projectID *string, unreadOnly bool, limit, offset int) ([]core.Notification, int, error) {
	where := "WHERE 1=1"
	args := []any{}
	argIdx := 1

	if projectID != nil {
		where += fmt.Sprintf(" AND project_id = $%d", argIdx)
		args = append(args, *projectID)
		argIdx++
	}
	if unreadOnly {
		where += " AND read = FALSE"
	}

	// Count total
	var total int
	countQuery := "SELECT COUNT(*) FROM notifications " + where
	if err := p.pool.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("counting notifications: %w", err)
	}

	query := fmt.Sprintf("SELECT id, project_id, agent_id, type, priority, title, body, read, action_url, created_at FROM notifications %s ORDER BY created_at DESC LIMIT $%d OFFSET $%d", where, argIdx, argIdx+1)
	args = append(args, limit, offset)

	rows, err := p.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("listing notifications: %w", err)
	}
	defer rows.Close()

	return scanNotifications(rows, total)
}

func (p *Pool) UnreadNotificationCount(ctx context.Context, projectID *string) (int, error) {
	query := "SELECT COUNT(*) FROM notifications WHERE read = FALSE"
	args := []any{}
	if projectID != nil {
		query += " AND project_id = $1"
		args = append(args, *projectID)
	}
	var count int
	err := p.pool.QueryRow(ctx, query, args...).Scan(&count)
	return count, err
}

func (p *Pool) MarkNotificationRead(ctx context.Context, id string) error {
	_, err := p.pool.Exec(ctx, "UPDATE notifications SET read = TRUE WHERE id = $1", id)
	return err
}

func (p *Pool) MarkAllNotificationsRead(ctx context.Context, projectID *string) error {
	if projectID != nil {
		_, err := p.pool.Exec(ctx, "UPDATE notifications SET read = TRUE WHERE project_id = $1 AND read = FALSE", *projectID)
		return err
	}
	_, err := p.pool.Exec(ctx, "UPDATE notifications SET read = TRUE WHERE read = FALSE")
	return err
}

func scanNotification(row pgx.Row) (*core.Notification, error) {
	var n core.Notification
	err := row.Scan(&n.ID, &n.ProjectID, &n.AgentID, &n.Type, &n.Priority, &n.Title, &n.Body, &n.Read, &n.ActionURL, &n.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("scanning notification: %w", err)
	}
	return &n, nil
}

func scanNotifications(rows pgx.Rows, total int) ([]core.Notification, int, error) {
	var notifications []core.Notification
	for rows.Next() {
		var n core.Notification
		if err := rows.Scan(&n.ID, &n.ProjectID, &n.AgentID, &n.Type, &n.Priority, &n.Title, &n.Body, &n.Read, &n.ActionURL, &n.CreatedAt); err != nil {
			return nil, 0, fmt.Errorf("scanning notification row: %w", err)
		}
		notifications = append(notifications, n)
	}
	return notifications, total, nil
}
```

- [ ] **Step 2: Update project DB to handle new fields**

Modify `internal/db/projects.go` — update `InsertProject` to accept and store `working_directory` and `repo_source`. Update `scanProject` to read the new columns.

Note: Check the existing SELECT column list in `scanProject` and add `working_directory, repo_source` to all project queries.

- [ ] **Step 3: Build and verify**

Run: `go build ./...`
Expected: Clean build.

- [ ] **Step 4: Commit**

```bash
git add internal/db/notifications.go internal/db/projects.go
git commit -m "feat: add notification DB functions and project repo field support"
```

---

## Chunk 2: Notification API + WebSocket

REST endpoints and real-time push for the notification system.

### Task 4: Add notification API routes and handlers

**Files:**
- Modify: `internal/api/server.go`

- [ ] **Step 1: Register notification routes**

Add to the route registration block (after the messages section):

```go
// Notifications
s.mux.HandleFunc("GET /api/v1/notifications", s.listNotifications)
s.mux.HandleFunc("GET /api/v1/notifications/unread-count", s.unreadNotificationCount)
s.mux.HandleFunc("PATCH /api/v1/notifications/{id}/read", s.markNotificationRead)
s.mux.HandleFunc("POST /api/v1/notifications/mark-all-read", s.markAllNotificationsRead)
```

- [ ] **Step 2: Implement notification handlers**

Add handler methods to `server.go`:

```go
func (s *Server) listNotifications(w http.ResponseWriter, r *http.Request) {
	var projectID *string
	if pid := r.URL.Query().Get("project_id"); pid != "" {
		projectID = &pid
	}
	unreadOnly := r.URL.Query().Get("unread_only") == "true"

	limit := 50
	offset := 0
	if l := r.URL.Query().Get("limit"); l != "" {
		fmt.Sscanf(l, "%d", &limit)
		if limit > 200 { limit = 200 }
	}
	if o := r.URL.Query().Get("offset"); o != "" {
		fmt.Sscanf(o, "%d", &offset)
	}

	notifications, total, err := s.db.ListNotifications(r.Context(), projectID, unreadOnly, limit, offset)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"data":    notifications,
		"total":   total,
	})
}

func (s *Server) unreadNotificationCount(w http.ResponseWriter, r *http.Request) {
	var projectID *string
	if pid := r.URL.Query().Get("project_id"); pid != "" {
		projectID = &pid
	}
	count, err := s.db.UnreadNotificationCount(r.Context(), projectID)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, core.SuccessResponse(map[string]int{"count": count}))
}

func (s *Server) markNotificationRead(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := s.db.MarkNotificationRead(r.Context(), id); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, core.SuccessResponse(map[string]string{"marked": id}))
}

func (s *Server) markAllNotificationsRead(w http.ResponseWriter, r *http.Request) {
	var projectID *string
	if pid := r.URL.Query().Get("project_id"); pid != "" {
		projectID = &pid
	}
	if err := s.db.MarkAllNotificationsRead(r.Context(), projectID); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, core.SuccessResponse(map[string]string{"status": "done"}))
}
```

- [ ] **Step 3: Build and verify**

Run: `go build ./...`
Expected: Clean build.

- [ ] **Step 4: Test via curl**

Run: `curl -s http://localhost:8080/api/v1/notifications/unread-count | python3 -m json.tool`
Expected: `{"success": true, "data": {"count": 0}}`

- [ ] **Step 5: Commit**

```bash
git add internal/api/server.go
git commit -m "feat: add notification REST API endpoints"
```

### Task 5: Add CreateNotification Temporal activity

**Files:**
- Modify: `internal/temporal/activities/activities.go`
- Modify: `internal/temporal/worker.go`

- [ ] **Step 1: Add CreateNotification activity**

Add to `activities.go`:

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

func (a *Activities) CreateNotification(ctx context.Context, input CreateNotificationInput) error {
	notif, err := a.pool.InsertNotification(ctx, input.ProjectID, input.AgentID, core.NotificationType(input.Type), input.Priority, input.Title, input.Body, input.ActionURL)
	if err != nil {
		return fmt.Errorf("creating notification: %w", err)
	}

	// Broadcast via internal HTTP endpoint (same pattern as BroadcastChat)
	payload, _ := json.Marshal(map[string]any{
		"type":         "notification_created",
		"notification": notif,
		"project_id":   input.ProjectID,
	})
	http.Post(a.cfg.API.InternalURL()+"/api/v1/internal/broadcast", "application/json", bytes.NewReader(payload))
	return nil
}
```

- [ ] **Step 2: Register activity in worker.go**

Add `act.CreateNotification` to the activity registrations.

- [ ] **Step 3: Build and verify**

Run: `go build ./...`

- [ ] **Step 4: Commit**

```bash
git add internal/temporal/activities/activities.go internal/temporal/worker.go
git commit -m "feat: add CreateNotification Temporal activity with WebSocket broadcast"
```

### Task 6: Update project creation to handle repo fields

**Files:**
- Modify: `internal/api/server.go` (createProject handler)
- Modify: `internal/db/projects.go`

- [ ] **Step 1: Update createProject handler**

In the `createProject` handler, after creating the project, add repo source detection:

```go
// Determine repo source
repoSource := "none"
var workingDir *string
if req.RepoURL != nil && *req.RepoURL != "" {
	repoSource = "remote"
	// Clone will be handled by Cosmo on first agent activity
} else if req.WorkingDirectory != nil && *req.WorkingDirectory != "" {
	repoSource = "local"
	workingDir = req.WorkingDirectory
}
// Update project with repo info
s.db.UpdateProjectRepoInfo(r.Context(), project.ID, repoSource, workingDir)
```

- [ ] **Step 2: Add UpdateProjectRepoInfo to db/projects.go**

```go
func (p *Pool) UpdateProjectRepoInfo(ctx context.Context, id, repoSource string, workingDir *string) error {
	_, err := p.pool.Exec(ctx,
		"UPDATE projects SET repo_source = $1, working_directory = $2, updated_at = NOW() WHERE id = $3",
		repoSource, workingDir, id)
	return err
}
```

- [ ] **Step 3: Build and verify**

Run: `go build ./...`

- [ ] **Step 4: Commit**

```bash
git add internal/api/server.go internal/db/projects.go
git commit -m "feat: handle repo source and working directory in project creation"
```

---

## Chunk 3: Cosmo Identity + Web Notification UI

Rename the orchestrator to Cosmo and add the notification bell to the web UI.

### Task 7: Rename Project Orchestrator to Cosmo in web UI

**Files:**
- Modify: `web/src/lib/types.ts`

- [ ] **Step 1: Update ROLE_LABEL and ROLE_EMOJI**

```typescript
// Change in ROLE_EMOJI:
project_orchestrator: "🚀",  // was "🎯"

// Change in ROLE_LABEL:
project_orchestrator: "Cosmo",  // was "Project Orchestrator"
```

- [ ] **Step 2: Build and verify**

Run: `cd web && bun run build`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/types.ts
git commit -m "feat: rename Project Orchestrator to Cosmo with rocket emoji"
```

### Task 8: Add notification types and API client functions

**Files:**
- Modify: `web/src/lib/types.ts`
- Modify: `web/src/lib/api.ts`

- [ ] **Step 1: Add Notification type**

Add to `types.ts`:

```typescript
export type NotificationType = "action_needed" | "status_update" | "approval_request" | "info";

export interface Notification {
  id: string;
  project_id: string;
  agent_id?: string;
  type: NotificationType;
  priority: "low" | "normal" | "high" | "critical";
  title: string;
  body: string;
  read: boolean;
  action_url?: string;
  created_at: string;
}
```

- [ ] **Step 2: Add API functions**

Add to `api.ts`:

```typescript
export async function listNotifications(projectId?: string, unreadOnly?: boolean): Promise<ApiResponse<Notification[]>> {
  const params = new URLSearchParams();
  if (projectId) params.set("project_id", projectId);
  if (unreadOnly) params.set("unread_only", "true");
  return fetchApi(`/api/v1/notifications?${params}`);
}

export async function getUnreadCount(): Promise<ApiResponse<{ count: number }>> {
  return fetchApi("/api/v1/notifications/unread-count");
}

export async function markNotificationRead(id: string): Promise<ApiResponse<{ marked: string }>> {
  return fetchApi(`/api/v1/notifications/${id}/read`, { method: "PATCH" });
}

export async function markAllNotificationsRead(projectId?: string): Promise<ApiResponse<{ status: string }>> {
  const params = projectId ? `?project_id=${projectId}` : "";
  return fetchApi(`/api/v1/notifications/mark-all-read${params}`, { method: "POST" });
}
```

- [ ] **Step 3: Add repo fields to web Project interface**

Also in `types.ts`, add to the `Project` interface:

```typescript
working_directory?: string;
repo_source: "local" | "remote" | "none";
```

And update `createProject` in `api.ts` to accept `working_directory`:

```typescript
export async function createProject(data: {
  name: string;
  description?: string;
  repo_url?: string;
  working_directory?: string;
  initial_prompt?: string;
}): Promise<ApiResponse<Project>> {
```

- [ ] **Step 4: Build and verify**

Run: `cd web && bun run build`
Expected: Clean build.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/types.ts web/src/lib/api.ts
git commit -m "feat: add notification types, Project repo fields, and API client functions"
```

### Task 9: Add notification bell to sidebar

**Files:**
- Modify: `web/src/components/sidebar.tsx`

- [ ] **Step 1: Add notification bell with unread count**

Import `getUnreadCount` and `Bell` icon. Add a bell icon at the top of the sidebar (near the SWE logo) that shows the unread count as a badge. Poll every 15 seconds for count updates. The bell should link to a `/notifications` page or open a dropdown — for MVP, link to `/notifications`.

Key elements:
- Bell icon with red badge showing count (hidden when 0)
- Poll `getUnreadCount()` every 15s
- Listen for `notification_created` WebSocket events to increment count in real-time
- Click navigates to notifications page (or later, opens dropdown)

- [ ] **Step 2: Build and verify**

Run: `cd web && bun run build`

- [ ] **Step 3: Commit**

```bash
git add web/src/components/sidebar.tsx
git commit -m "feat: add Cosmo notification bell to sidebar with unread count"
```

### Task 10: Update project creation form with repo options

**Files:**
- Modify: `web/src/app/(app)/projects/new/page.tsx`

- [ ] **Step 1: Add repo source toggle and local directory field**

Add radio buttons for repo source: "Remote Repository", "Local Directory", "I'll add one later". Show the appropriate input field based on selection. Pass `working_directory` in the create request when "Local Directory" is selected.

- [ ] **Step 2: Build and verify**

Run: `cd web && bun run build`

- [ ] **Step 3: Commit**

```bash
git add web/src/app/(app)/projects/new/page.tsx
git commit -m "feat: add repo source selector and local directory field to project creation"
```

### Task 11: Add project inbox tab and repo status to project detail

**Files:**
- Modify: `web/src/app/(app)/projects/[id]/page.tsx`

- [ ] **Step 1: Add repo status indicator**

Near the project header (next to phase badge), add a small badge showing:
- "Connected to github.com/..." for remote repos
- "Local: ~/dev/..." for local repos
- "No repo configured" with warning icon for none

- [ ] **Step 2: Add inbox/notifications tab**

Add a tab switcher above the main content: "Board" | "Inbox". The inbox tab shows notifications for this project using `listNotifications(projectId)`. Each notification shows Cosmo's avatar (🚀), title, body, timestamp, and read/unread styling. Click marks as read.

- [ ] **Step 3: Build and verify**

Run: `cd web && bun run build`

- [ ] **Step 4: Commit**

```bash
git add web/src/app/(app)/projects/[id]/page.tsx
git commit -m "feat: add repo status indicator and Cosmo inbox to project detail"
```

---

## Chunk 4: OpenCode Integration

Wire OpenCode as the coding execution layer for specialist agents.

### Task 12: Install OpenCode and verify

- [ ] **Step 1: Install OpenCode**

Run: `go install github.com/opencode-ai/opencode@latest`
Expected: Binary installed to `~/go/bin/opencode`

- [ ] **Step 2: Verify installation**

Run: `opencode --version`
Expected: Version string printed.

- [ ] **Step 3: Test headless mode**

Create a temp directory, init a git repo, and test `opencode run`:
```bash
mkdir /tmp/test-opencode && cd /tmp/test-opencode && git init
echo '{"provider": "ollama", "model": "qwen2.5:0.5b"}' > opencode.json
opencode run --message "Create a hello.py file that prints hello world" --yes-always
```
Expected: `hello.py` created with `print("hello world")` or similar.

### Task 13: Create OpenCode server manager

**Files:**
- Create: `internal/opencode/manager.go`

- [ ] **Step 1: Create the opencode package**

```go
package opencode

import (
	"context"
	"fmt"
	"net/http"
	"os/exec"
	"sync"
	"time"
)

// Manager handles OpenCode server lifecycle per project.
type Manager struct {
	mu       sync.Mutex
	servers  map[string]*ServerInstance // project ID -> instance
	portBase int
	portMax  int
	usedPorts map[int]string // port -> project ID
}

type ServerInstance struct {
	ProjectID   string
	Port        int
	URL         string
	WorkDir     string
	Cmd         *exec.Cmd
	LastActive  time.Time
	Sessions    map[string]string // agent ID -> session ID
}

func NewManager() *Manager {
	return &Manager{
		servers:   make(map[string]*ServerInstance),
		portBase:  9100,
		portMax:   9199,
		usedPorts: make(map[int]string),
	}
}

func (m *Manager) StartServer(ctx context.Context, projectID, workDir string) (*ServerInstance, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Return existing if running
	if inst, ok := m.servers[projectID]; ok {
		if m.isHealthy(inst) {
			inst.LastActive = time.Now()
			return inst, nil
		}
		// Not healthy, clean up
		m.stopServerLocked(projectID)
	}

	// Allocate port
	port, err := m.allocatePort(projectID)
	if err != nil {
		return nil, err
	}

	// Start opencode serve
	cmd := exec.CommandContext(ctx, "opencode", "serve", "--port", fmt.Sprintf("%d", port))
	cmd.Dir = workDir
	if err := cmd.Start(); err != nil {
		m.freePort(port)
		return nil, fmt.Errorf("starting opencode: %w", err)
	}

	inst := &ServerInstance{
		ProjectID:  projectID,
		Port:       port,
		URL:        fmt.Sprintf("http://localhost:%d", port),
		WorkDir:    workDir,
		Cmd:        cmd,
		LastActive: time.Now(),
		Sessions:   make(map[string]string),
	}
	m.servers[projectID] = inst

	// Wait for health
	if err := m.waitForHealth(inst, 30*time.Second); err != nil {
		m.stopServerLocked(projectID)
		return nil, fmt.Errorf("opencode failed to start: %w", err)
	}

	return inst, nil
}

func (m *Manager) StopServer(projectID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.stopServerLocked(projectID)
}

func (m *Manager) stopServerLocked(projectID string) {
	inst, ok := m.servers[projectID]
	if !ok {
		return
	}
	if inst.Cmd != nil && inst.Cmd.Process != nil {
		inst.Cmd.Process.Kill()
	}
	m.freePort(inst.Port)
	delete(m.servers, projectID)
}

func (m *Manager) GetServer(projectID string) (*ServerInstance, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	inst, ok := m.servers[projectID]
	if ok {
		inst.LastActive = time.Now()
	}
	return inst, ok
}

func (m *Manager) allocatePort(projectID string) (int, error) {
	for port := m.portBase; port <= m.portMax; port++ {
		if _, used := m.usedPorts[port]; !used {
			m.usedPorts[port] = projectID
			return port, nil
		}
	}
	return 0, fmt.Errorf("no ports available in range %d-%d", m.portBase, m.portMax)
}

func (m *Manager) freePort(port int) {
	delete(m.usedPorts, port)
}

func (m *Manager) isHealthy(inst *ServerInstance) bool {
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get(inst.URL + "/api/health")
	if err != nil {
		return false
	}
	resp.Body.Close()
	return resp.StatusCode == 200
}

func (m *Manager) waitForHealth(inst *ServerInstance, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if m.isHealthy(inst) {
			return nil
		}
		time.Sleep(500 * time.Millisecond)
	}
	return fmt.Errorf("health check timed out after %s", timeout)
}

// CleanupIdle stops servers that have been idle for the given duration.
func (m *Manager) CleanupIdle(maxIdle time.Duration) {
	m.mu.Lock()
	defer m.mu.Unlock()
	now := time.Now()
	for pid, inst := range m.servers {
		if now.Sub(inst.LastActive) > maxIdle {
			m.stopServerLocked(pid)
		}
	}
}
```

- [ ] **Step 2: Build and verify**

Run: `go build ./...`

- [ ] **Step 3: Commit**

```bash
git add internal/opencode/manager.go
git commit -m "feat: add OpenCode server lifecycle manager"
```

### Task 14: Create OpenCode client for HTTP API

**Files:**
- Create: `internal/opencode/client.go`

- [ ] **Step 1: Create HTTP client for OpenCode server API**

```go
package opencode

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Client communicates with an OpenCode server instance.
type Client struct {
	baseURL    string
	httpClient *http.Client
}

func NewClient(baseURL string) *Client {
	return &Client{
		baseURL:    baseURL,
		httpClient: &http.Client{Timeout: 5 * time.Minute},
	}
}

type CreateSessionResponse struct {
	ID string `json:"id"`
}

type SendMessageResponse struct {
	Content string `json:"content"`
}

func (c *Client) CreateSession(ctx context.Context) (string, error) {
	resp, err := c.post(ctx, "/api/session", nil)
	if err != nil {
		return "", fmt.Errorf("creating session: %w", err)
	}
	var result CreateSessionResponse
	if err := json.Unmarshal(resp, &result); err != nil {
		return "", fmt.Errorf("parsing session response: %w", err)
	}
	return result.ID, nil
}

func (c *Client) SendMessage(ctx context.Context, sessionID, message string) (string, error) {
	body := map[string]string{"message": message}
	resp, err := c.post(ctx, fmt.Sprintf("/api/session/%s/message", sessionID), body)
	if err != nil {
		return "", fmt.Errorf("sending message: %w", err)
	}
	var result SendMessageResponse
	if err := json.Unmarshal(resp, &result); err != nil {
		// If structured parse fails, return raw response
		return string(resp), nil
	}
	return result.Content, nil
}

func (c *Client) Health(ctx context.Context) bool {
	req, err := http.NewRequestWithContext(ctx, "GET", c.baseURL+"/api/health", nil)
	if err != nil {
		return false
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return false
	}
	resp.Body.Close()
	return resp.StatusCode == 200
}

func (c *Client) post(ctx context.Context, path string, body any) ([]byte, error) {
	var buf bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			return nil, err
		}
	}
	req, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+path, &buf)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("opencode API error %d: %s", resp.StatusCode, string(data))
	}
	return data, nil
}
```

- [ ] **Step 2: Build and verify**

Run: `go build ./...`

- [ ] **Step 3: Commit**

```bash
git add internal/opencode/client.go
git commit -m "feat: add OpenCode HTTP API client"
```

### Task 15: Add OpenCode Temporal activities

**Files:**
- Modify: `internal/temporal/activities/activities.go`
- Modify: `internal/temporal/worker.go`

- [ ] **Step 1: Add OpenCode activities**

Add `StartOpenCodeServer` and `ExecuteCodeTask` activities to activities.go. These activities use the OpenCode manager (injected via the Activities struct) to start servers and send messages.

Update the `Activities` struct to include the OpenCode manager:

```go
type Activities struct {
	cfg      config.Config
	pool     *db.Pool
	opencode *opencode.Manager  // NEW
}

func New(cfg config.Config, pool *db.Pool, ocManager *opencode.Manager) *Activities {
	return &Activities{cfg: cfg, pool: pool, opencode: ocManager}
}
```

Add activities:

```go
type StartOpenCodeServerInput struct {
	ProjectID        string `json:"project_id"`
	WorkingDirectory string `json:"working_directory"`
}

type StartOpenCodeServerOutput struct {
	ServerURL string `json:"server_url"`
	Port      int    `json:"port"`
}

func (a *Activities) StartOpenCodeServer(ctx context.Context, input StartOpenCodeServerInput) (*StartOpenCodeServerOutput, error) {
	inst, err := a.opencode.StartServer(ctx, input.ProjectID, input.WorkingDirectory)
	if err != nil {
		return nil, err
	}
	return &StartOpenCodeServerOutput{ServerURL: inst.URL, Port: inst.Port}, nil
}

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

func (a *Activities) ExecuteCodeTask(ctx context.Context, input ExecuteCodeTaskInput) (*ExecuteCodeTaskOutput, error) {
	client := opencode.NewClient(input.ServerURL)
	response, err := client.SendMessage(ctx, input.SessionID, input.TaskPrompt)
	if err != nil {
		return &ExecuteCodeTaskOutput{Success: false, Error: err.Error()}, nil
	}
	return &ExecuteCodeTaskOutput{
		Response: response,
		Success:  true,
	}, nil
}
```

- [ ] **Step 2: Update worker.go to create and inject OpenCode manager**

```go
ocManager := opencode.NewManager()
act := activities.New(cfg, pool, ocManager)
```

Register new activities: `act.StartOpenCodeServer`, `act.ExecuteCodeTask`

- [ ] **Step 3: Build and verify**

Run: `go build ./...`

- [ ] **Step 4: Commit**

```bash
git add internal/temporal/activities/activities.go internal/temporal/worker.go
git commit -m "feat: add OpenCode Temporal activities for server management and code execution"
```

---

## Chunk 5: Revised Agent Workflows

Rewrite Cosmo and specialist agent workflows to use notifications and OpenCode.

### Task 16: Update Cosmo's workflow to use notifications

**Files:**
- Modify: `internal/temporal/workflows/agent.go`

- [ ] **Step 1: Add createNotification helper closure**

In the `AgentWorkflow` function, add a helper alongside `broadcastReply` and `updateStatus`:

```go
createNotification := func(ntype, priority, title, body string) {
	_ = workflow.ExecuteActivity(actCtx, "CreateNotification", activities.CreateNotificationInput{
		ProjectID: projectID,
		AgentID:   &input.AgentID,
		Type:      ntype,
		Priority:  priority,
		Title:     title,
		Body:      body,
	}).Get(ctx, nil)
}
```

- [ ] **Step 2: Use notifications in orchestrator initialization**

Replace the existing orchestrator initialization to:
- Check if repo is configured (query project). If `repo_source == "none"`, create an `action_needed` notification asking for a repo.
- After creating work items, create a `status_update` notification summarizing the plan.
- After spawning agents, notify.

- [ ] **Step 3: Use notifications in heartbeat**

Update `orchestratorHeartbeat` to create notifications for:
- Stalled agents (high priority action_needed)
- All work items complete (status_update)
- Phase advancement (status_update)

- [ ] **Step 4: Update Cosmo's display name in broadcasts**

Change `input.Name` references to use "Cosmo" as the agent name in `BroadcastChat` calls.

- [ ] **Step 5: Build and verify**

Run: `go build ./...`

- [ ] **Step 6: Commit**

```bash
git add internal/temporal/workflows/agent.go
git commit -m "feat: integrate Cosmo notifications into orchestrator workflow"
```

### Task 17: Rewrite specialist agent workflow to use OpenCode

**Files:**
- Modify: `internal/temporal/workflows/agent.go`

- [ ] **Step 1: Update specialist initialization**

When a specialist agent starts (non-orchestrator), instead of just calling LLM:
1. First, add `WorkingDirectory` and `RepoSource` fields to `GetProjectContextOutput` in `activities.go`, and populate them in the `GetProjectContext` activity
2. Check if the project has a `working_directory` via `GetProjectContext`
3. If yes, start/get the OpenCode server via `StartOpenCodeServer` activity
4. Create an OpenCode session via a new `CreateOpenCodeSession` activity (calls `opencode.Client.CreateSession`)
5. Store the session ID in the workflow state
6. If no `working_directory`, fall back to LLM-only mode (backward compatible)

- [ ] **Step 2: Update specialist heartbeat to use OpenCode**

Replace the current `specialistHeartbeat` which just calls LLM with:
1. Check for assigned work items
2. For the current work item, build a prompt with role-specific instructions
3. Call `ExecuteCodeTask` activity to send the task to OpenCode
4. Parse the response for completion signals
5. Update work item status
6. Broadcast results to UI

- [ ] **Step 3: Add fallback for projects without repos**

If no `working_directory` is set, specialist agents fall back to the existing LLM-only behavior (describe what they'd do). This ensures backward compatibility.

- [ ] **Step 4: Add crash resilience**

In the specialist heartbeat, wrap the `ExecuteCodeTask` call in error handling:
- On timeout: set agent status to `idle` (not error), log the timeout, retry on next heartbeat
- On OpenCode connection error: attempt to restart the OpenCode server, then retry
- Never let a single activity failure crash the entire workflow

- [ ] **Step 5: Build and verify**

Run: `go build ./...`

- [ ] **Step 5: Commit**

```bash
git add internal/temporal/workflows/agent.go
git commit -m "feat: integrate OpenCode into specialist agent workflows"
```

---

## Chunk 6: Rebuild, Deploy, and Validate

### Task 18: Rebuild and deploy all services

- [ ] **Step 1: Run migration**

```bash
docker compose exec postgres psql -U swe -d swe -f /dev/stdin < migrations/003_cosmo_opencode.sql
```

- [ ] **Step 2: Rebuild Go services**

```bash
docker compose up -d --build swe-api swe-worker
```

Or if running worker on host:
```bash
go build -o swe-worker ./cmd/worker && ./swe-worker &
docker compose up -d --build swe-api
```

- [ ] **Step 3: Rebuild web UI**

```bash
docker compose up -d --build swe-web
```

- [ ] **Step 4: Verify all services running**

```bash
docker compose ps
curl -s http://localhost:8080/api/v1/notifications/unread-count
```

### Task 19: End-to-end validation

- [ ] **Step 1: Create a project with a local repo via agent-browser**

Navigate to `/projects/new`, select "Local Directory", provide a path to a test repo, create the project.

- [ ] **Step 2: Verify Cosmo creates notifications**

Check `GET /api/v1/notifications` — should have a status_update notification from Cosmo about the project plan.

- [ ] **Step 3: Verify notification bell in sidebar**

Check that the sidebar shows the unread count badge.

- [ ] **Step 4: Verify agents use OpenCode**

Check that specialist agents (coder/architect) are creating OpenCode sessions and producing real file changes in the repo.

- [ ] **Step 5: Verify project inbox**

Navigate to the project detail page and check the inbox tab shows Cosmo's notifications.

- [ ] **Step 6: Commit any final fixes**

```bash
git add internal/ web/src/ migrations/
git commit -m "fix: address end-to-end validation issues"
```

### Task 20: Update agent detail page with code activity

**Files:**
- Modify: `web/src/app/(app)/projects/[id]/agents/[agentId]/page.tsx`

- [ ] **Step 1: Add code activity section**

Below the conversation history, add a "Code Activity" card showing:
- Files changed by this agent (from work item data or future OpenCode session data)
- Recent commits attributed to this agent
- OpenCode session status (active/idle/disconnected)

For MVP, show placeholder data from the agent's conversation history (extract file names mentioned in responses).

- [ ] **Step 2: Build and verify**

Run: `cd web && bun run build`

- [ ] **Step 3: Commit**

```bash
git add web/src/app/(app)/projects/[id]/agents/[agentId]/page.tsx
git commit -m "feat: add code activity section to agent detail page"
```

---

## Implementation Notes

### Deferred to future iteration (not MVP blockers):
- **Redis port tracking** — MVP uses in-memory only. Add Redis persistence when horizontal scaling is needed.
- **`opencode.json` config writing** — MVP assumes OpenCode can use default config or reads from env vars. Add platform-managed config when needed.
- **Docker worker isolation** — MVP runs worker on host for OpenCode access. Containerize when sandbox support is added.
- **Agent detail code diffs** — MVP shows commit/file info from conversation text. Add real git diff integration later.
