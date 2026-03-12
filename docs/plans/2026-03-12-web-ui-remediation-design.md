# Web UI Remediation Design

## Context

After wiring the SWE platform end-to-end (database, API, CLI, Temporal, web UI), a comprehensive audit of the web UI found **31 issues** across type mismatches, crash risks, non-functional UI elements, missing error handling, and unconnected features. This design documents the remediation approach to bring the web UI to a functional MVP.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scope | Fix + complete (functional MVP) | Get existing pages working correctly and finish incomplete features, but skip pure polish |
| Settings persistence | Config file via API (`~/.swe/config.toml`) | swe-core already parses TOML config; CLI and web share the same config |
| WebSocket pages | Project detail only | That's where you watch agents work; dashboard/lists are glance-and-navigate |
| Create project UX | Dedicated page (`/projects/new`) | Form has 4 fields including multi-line initial prompt; needs room |
| TypeScript types | Match Rust structs exactly | Zero cost for extra interface fields; eliminates the class of bugs the audit found |
| Approach | Bottom-up (types → API → pages) | Fix foundation first so page fixes become mechanical |
| Error handling | Inline feedback, no toast library, no global error boundary | Keep it simple; each page owns its errors |

## Approach: Bottom-Up (Types → API → Pages)

Fix the foundation first, then work upward through the stack:

1. TypeScript types aligned to Rust structs
2. Shared URL config + WebSocket URL fix
3. Config API endpoint (Rust + web client)
4. Page-by-page fixes following user navigation flow

---

## Section 1: TypeScript Type Alignment

Make every TypeScript interface an exact mirror of its Rust struct.

### Agent — add missing fields

```typescript
conversation_history: string[];
context?: string;
sandbox_id?: string;
// tokens_consumed already present
```

### WorkItem — add missing fields

```typescript
artifact_ids: string[];
depends_on: string[];
blocks: string[];
started_at?: string;
completed_at?: string;
```

### Artifact — add missing fields

```typescript
work_item_id?: string;
content?: string;
storage_url?: string;
approved_by?: string;
approval_comment?: string;
previous_version_id?: string;
```

### Mapping rules

- Rust `Option<T>` → TS `field?: type`
- Rust `Vec<T>` → TS `type[]` (never optional, empty array default)
- Rust `u64`/`u32` → TS `number`
- Rust `Uuid` → TS `string`
- Rust `DateTime<Utc>` → TS `string`

---

## Section 2: WebSocket & API URL Fixes

### Shared URL config

Extract OrbStack-aware hostname detection from `api.ts` into `web/src/lib/config.ts`:

```typescript
// Shared by api.ts and ws.ts
export function getBaseUrl(): string;
export function getWsUrl(): string;
```

Both `api.ts` and `ws.ts` import from `config.ts` instead of duplicating detection logic.

### WebSocket on project detail

- Import `useWebSocket()` on `/projects/[id]`
- Filter events by `project_id` matching current project
- On relevant events (`agent_status`, `artifact_created`, `phase_change`), re-fetch affected data (don't patch local state)
- Show connection indicator (green/red dot) in project header

---

## Section 3: Config API Endpoint

### Rust backend

**`swe-core` config changes:**
- Add `save()` method to write config struct back to `~/.swe/config.toml`
- Ensure struct covers: LiteLLM proxy URL, default model, per-role model overrides, sandbox namespace, CPU/memory limits

**`swe-api` new endpoint (`src/rest/settings.rs`):**
- `GET /api/v1/settings` — read config from disk, return as JSON
- `PUT /api/v1/settings` — accept JSON, validate, write to config.toml

### Web client

**`api.ts`** — add `getSettings()` and `updateSettings(data)`

**`types.ts`** — add `Settings` interface matching the config struct

---

## Section 4: Page Fixes

### Dashboard (`/dashboard`)

- Responsive grid: `grid-cols-2 md:grid-cols-4`
- Fallback for unknown phase values in badge lookup
- Remove non-functional "swe run" button (no backend)
- "New Project" links to `/projects/new`

### Projects List (`/projects`)

- "New Project" button links to `/projects/new`

### Create Project (`/projects/new`) — new page

- Full-page form: name (required), description (textarea), repo URL, initial prompt (textarea)
- Submit calls `createProject()` with loading state and error display
- On success: redirect to `/projects/[id]`
- Cancel: return to `/projects`

### Project Detail (`/projects/[id]`)

- Wire WebSocket (Section 2)
- Null guards on `project.description`
- Chat: loading state while sending, error display on failure
- Empty states for agents/work items/artifacts when arrays are empty

### Agent Detail (`/projects/[id]/agents/[agentId]`)

- Null guard on `agent.role.replace()`
- Wire or disable Stop/Restart buttons (disable with tooltip if API doesn't support)
- Handle `tokens_consumed` display correctly

### Settings (`/settings`)

- Fetch config on mount via `getSettings()`
- Wire form inputs to state
- Save button calls `updateSettings()` with loading/error/success feedback
- Refresh Status calls `checkHealth()`, shows actual SWE API status
- Other services show "unknown" (can't check from browser)

---

## Section 5: Error Handling Patterns

### Mutations (create, send message, approve, save)

1. Disable submit button + show spinner while in flight
2. On success: navigate away or show brief green success text (auto-clears 3s)
3. On failure: show `ApiResponse.error` in red alert below the action. Don't clear user input.

### Data fetching (list/get)

1. `Loader2` spinner centered in content area
2. On error: yellow alert card (reuse dashboard pattern everywhere)
3. On 404: "not found" message with link back to parent

### Principles

- No toast library — inline feedback near the action
- No global error boundary — each page handles its own errors
- Keep it simple

---

## Work Breakdown

| # | Task | Layer |
|---|------|-------|
| 1 | Fix TypeScript types to match Rust structs | Web types |
| 2 | Extract shared URL config, fix WebSocket URL | Web infra |
| 3 | Add config read/write to swe-core | Rust backend |
| 4 | Add settings API endpoint to swe-api | Rust backend |
| 5 | Add settings API client + Settings type to web | Web API |
| 6 | Fix dashboard page | Web page |
| 7 | Fix projects list page | Web page |
| 8 | Add create project page (`/projects/new`) | Web page |
| 9 | Fix project detail page + wire WebSocket | Web page |
| 10 | Fix agent detail page | Web page |
| 11 | Wire settings page | Web page |

---

## Audit Reference

The 31 issues from the original audit, categorized by what this design addresses:

**Resolved by type alignment (Section 1):** Issues 1-4
**Resolved by WebSocket fix (Section 2):** Issues 5-6
**Resolved by page fixes (Section 4):** Issues 7-24
**Resolved by error patterns (Section 5):** Issues 14-19
**Deferred (polish, not in scope):** Issues 25-31 (pagination, search, breadcrumbs, responsive beyond dashboard, date edge cases, favicons)
