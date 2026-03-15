# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Test Commands

### Go (project root)
```bash
go build ./cmd/api/               # Build API server
go build ./cmd/worker/            # Build Temporal worker
go build ./cmd/cli/               # Build CLI tool
go build ./...                    # Build all packages
go test ./...                     # Run all tests
go test ./internal/core/...       # Run tests for single package
go test -run TestName ./...       # Run a single test by name
go vet ./...                      # Vet
```

### Binaries produced
- `swe-api` (from `cmd/api`) — REST server, port 8080
- `swe-worker` (from `cmd/worker`) — Temporal worker
- `swe` (from `cmd/cli`) — CLI tool

### Web UI (web/)
```bash
cd web
bun install                          # Install deps (bun.lock)
bun run dev                          # Dev server on :3000
bun run build                        # Production build
bun run lint                         # ESLint
```

Note: Docker build uses Node.js (not Bun) for `next build` due to Bun segfault in Docker. The web Dockerfile uses `oven/bun` for `bun install` then `node:22-bookworm-slim` for build/runtime.

### Docker (full stack)
```bash
docker compose up -d                 # Start all services
docker compose up -d --build swe-api # Rebuild + restart single service
docker compose logs -f swe-api       # Tail logs
docker compose down                  # Stop everything
```

### Database
```bash
psql postgres://swe:swe@localhost:5432/swe -f migrations/001_initial_schema.sql  # Run migrations manually
docker compose up swe-migrate                                                     # Run migrations via Docker
```

### LiteLLM setup
Copy `config/litellm.example.yaml` to `config/litellm.yaml` and add API keys before starting Docker.

## Architecture

**Go project** with 3 binaries + a **Next.js** web UI, orchestrated by **Temporal**.

### Package structure
```
cmd/
  api/          → API server binary
  worker/       → Temporal worker binary
  cli/          → CLI binary
internal/
  core/         → Domain types, errors, response wrapper
  config/       → TOML config loading
  db/           → pgx database queries
  api/          → HTTP server, routes, handlers, WebSocket
  temporal/     → Temporal worker, workflows, activities
    workflows/  → Project, Agent, Orchestrator, Sandbox workflows
    activities/ → LLM, Container, Artifact, Tool activities
  sandbox/      → K8s Job management
```

### Dependencies
- **core**: No external dependencies (pure domain types)
- **config**: BurntSushi/toml
- **db**: jackc/pgx/v5
- **api**: gorilla/websocket, core, config, db
- **temporal**: go.temporal.io/sdk, core, config, db
- **sandbox**: k8s.io/client-go, core

### Docker Compose services
| Service | Port | Purpose |
|---------|------|---------|
| temporal + temporal-db | 7233 | Workflow orchestration (PostgreSQL-backed) |
| temporal-ui | 8233 | Temporal dev dashboard |
| litellm | 4000 | LLM proxy (model routing) |
| postgres | 5432 | App DB (auth, metadata). User: `swe`/`swe` |
| redis | 6379 | WebSocket pub/sub, caching |
| swe-migrate | — | Runs SQL migrations on startup (exits after) |
| swe-api | 8080 | Go API server (depends on swe-migrate) |
| swe-worker | — | Temporal worker (no exposed port) |
| swe-web | 3000 | Next.js UI |

### Web UI
Next.js 16 App Router + React 19 + Tailwind v4 + shadcn/ui. BetterAuth for authentication. Pages: dashboard, projects/[id], projects/[id]/agents/[agentId], settings. API client in `src/lib/api.ts`, WebSocket client in `src/lib/ws.ts`. Configured with `output: "standalone"` for Docker deployment.

## Code Patterns

### Error handling (core)
Sentinel errors: `ErrProjectNotFound`, `ErrAgentNotFound`, `ErrWorkItemNotFound`, `ErrArtifactNotFound`, `ErrInvalidState`, `ErrPermissionDenied`. Wrapped `Error` struct with `ErrorKind` for HTTP status mapping.

### API responses (api)
Standard wrapper: `ApiResponse[T]` with `Success`, `Data`, `Error` fields. HTTP status mapping: 404 for not found, 403 for permission denied, 400 for invalid state.

### HTTP routing
Uses Go 1.22+ stdlib `http.ServeMux` with method-based routing: `"GET /api/v1/projects/{id}"`.

### WebSocket events
JSON objects with `type` field. Event types: agent_status, agent_activity, artifact_created, phase_change, chat_message, interaction_requested, heartbeat (30s interval).

### Agent roles
`AgentRole` type with constants. MVP roles: GlobalOrchestrator, ProjectOrchestrator, Architect, Sdet, Coder. Each role defines `DisplayName()`, `RequiresSandbox()`, `DefaultTools()`.

### Temporal workflows
Go Temporal SDK v1. Workflows: ProjectWorkflow, AgentWorkflow, OrchestratorWorkflow, SandboxWorkflow. Activities: LLMComplete, CreateSandbox, DeleteSandbox, CreateArtifact, ExecuteTool. Task queue: `swe-workers`.

### Proto definitions
In `proto/swe/v1/`: project.proto, agent.proto, work.proto, events.proto. gRPC compilation not yet enabled.

## Key Config

### Environment variables (used in Docker)
- `DATABASE_URL` — PostgreSQL connection string
- `TEMPORAL_ADDRESS` — Temporal gRPC endpoint (host:port)
- `LITELLM_URL` — LiteLLM proxy URL
- `REDIS_URL` — Redis connection
- `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_WS_URL` — client-side API/WS endpoints
- `BETTER_AUTH_SECRET` — session signing key

### Go Dockerfile
Multi-stage build. `golang:1.25-bookworm` builder, `debian:bookworm-slim` runtime. CGO_ENABLED=0 for static binaries. Three runtime targets: `api`, `cli`, `worker`.

## Design Context

### Users
Mixed technical audience — developers, tech leads, and engineering managers using the platform to orchestrate AI agents for software engineering tasks. Devs interact directly with agents and artifacts; managers track progress and outcomes. All users expect a tool that feels as polished as the developer tools they already use.

### Brand Personality
**Bold, fast, powerful.** SWE is a high-performance platform that makes teams feel like they have superpowers. The interface should project confidence and convey that serious work is happening behind the scenes — not a toy, not a chatbot wrapper.

### Aesthetic Direction
- **References**: Linear and Vercel — clean, fast, dark-mode-first developer tools with polished micro-interactions and premium feel
- **Anti-references**: Generic admin panels, Bootstrap templates, basic dashboards — avoid anything that looks templated or low-effort
- **Theme**: Dark + light mode support (currently dark-only — light mode planned)
- **Current stack**: Next.js 16, React 19, Tailwind v4, Inter font, Lucide icons, custom component library (button, card, badge)
- **Color system**: Zinc-based neutrals, blue primary accent, semantic colors (green/success, red/error, yellow/warning, purple/review)

### Emotional Goals
- **Confidence & control**: Users feel in command of powerful AI agents doing real work
- **Trust & reliability**: Users trust the system is working correctly even when they're not watching

### Design Principles
1. **Command, not conversation** — This is a control plane for orchestrating agents, not a chat interface. Every screen should feel like a cockpit: information-dense, status-rich, and action-oriented.
2. **Earn trust through transparency** — Show real-time agent status, clear progress indicators, and honest error states. Never hide what's happening. Status should be glanceable and unambiguous.
3. **Fast by default** — Interactions should feel instant. Favor optimistic UI, smooth transitions, and responsive layouts. Performance is a feature.
4. **Dense but not cluttered** — Pack information efficiently without overwhelming. Use typography hierarchy, color-coding, and spatial grouping to make density feel organized, not chaotic.
5. **Polish the details** — Consistent spacing, aligned elements, thoughtful hover states, and subtle animations separate a premium tool from a prototype. Every pixel should feel intentional.
