# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Test Commands

### Rust (workspace root)
```bash
cargo build                          # Build all crates (debug)
cargo build --release                # Build all crates (release)
cargo build -p swe-api               # Build single crate
cargo test                           # Run all tests
cargo test -p swe-core               # Run tests for single crate
cargo test -- test_name              # Run a single test by name
cargo clippy                         # Lint
```

### Binaries produced
- `swe-api` (from `swe-api` crate) — REST/gRPC server, port 8080
- `swe-worker` (from `swe-temporal` crate) — Temporal worker
- `swe` (from `swe-cli` crate) — CLI tool

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
docker compose up -d                 # Start all 9 services
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

**Rust workspace** with 5 crates + a **Next.js** web UI, orchestrated by **Temporal**.

### Crate dependency graph
```
swe-cli ──→ swe-core
swe-api ──→ swe-core, swe-temporal
swe-temporal ──→ swe-core
swe-sandbox ──→ swe-core
```

- **swe-core**: Domain types, TOML config, agent roles, error types. Database layer in `src/db/` with query functions for all domain types (projects, agents, work_items, artifacts). Uses SQLx with Postgres.
- **swe-api**: Axum REST server. `AppState` holds the DB pool. Routes in `src/lib.rs`, handlers in `src/rest/` are backed by `swe_core::db` queries. Tonic gRPC definitions exist but are not yet compiled.
- **swe-temporal**: Temporal worker using `temporalio-sdk` 0.1.0-alpha.1. Worker connects to Temporal and registers on `swe-workers` queue. Workflow/activity definitions in `src/workflows/` and `src/activities/` are stubs pending migration to temporalio macros.
- **swe-cli**: Clap-based CLI. `src/api_client.rs` provides HTTP client for the SWE API. Commands (`project`, `status`) make real API calls. Connects to API at `SWE_API_URL` (default `http://localhost:8080`).
- **swe-sandbox**: K8s Job creation/management for agent execution environments.

### Docker Compose services
| Service | Port | Purpose |
|---------|------|---------|
| temporal + temporal-db | 7233 | Workflow orchestration (PostgreSQL-backed) |
| temporal-ui | 8233 | Temporal dev dashboard |
| litellm | 4000 | LLM proxy (model routing) |
| postgres | 5432 | App DB (auth, metadata). User: `swe`/`swe` |
| redis | 6379 | WebSocket pub/sub, caching |
| swe-migrate | — | Runs SQL migrations on startup (exits after) |
| swe-api | 8080 | Rust API server (depends on swe-migrate) |
| swe-worker | — | Temporal worker (no exposed port) |
| swe-web | 3000 | Next.js UI |

### Web UI
Next.js 16 App Router + React 19 + Tailwind v4 + shadcn/ui. BetterAuth for authentication. Pages: dashboard, projects/[id], projects/[id]/agents/[agentId], settings. API client in `src/lib/api.ts`, WebSocket client in `src/lib/ws.ts`. Configured with `output: "standalone"` for Docker deployment.

## Code Patterns

### Error handling (swe-core)
All crates use `swe_core::Error` (thiserror-derived) with `swe_core::Result<T>`. Variants: `Config`, `ProjectNotFound`, `AgentNotFound`, `Workflow`, `Llm`, `Kubernetes`, etc. Helper constructors: `Error::config(msg)`, `Error::internal(msg)`.

### API responses (swe-api)
Standard wrapper: `ApiResponse<T>` with `success: bool`, `data: Option<T>`, `error: Option<String>`. HTTP status mapping: 404 for not found, 403 for permission denied, 400 for invalid state.

### Axum routing
Uses Axum 0.8 path syntax with braces: `/api/v1/projects/{id}` (not `:id`).

### WebSocket events
`StreamEvent` enum with `#[serde(tag = "type", rename_all = "snake_case")]`. Event types: AgentStatus, AgentActivity, ArtifactCreated, PhaseChange, ChatMessage, InteractionRequested, Heartbeat (30s interval).

### Agent roles
`AgentRole` enum in `swe-core/src/roles/mod.rs`. MVP roles: GlobalOrchestrator, ProjectOrchestrator, Architect, Sdet, Coder. Each role defines `display_name()`, `requires_sandbox()`, `default_tools()`.

### Temporal workflows
Trait-based: `SweWorkflow` (async, handles signals/queries) and `SweActivity` with `ActivityOptions` (timeout, retries, backoff). Workflow types: Project, Agent, Orchestrator, Sandbox. State tracked via `WorkflowState` enum.

### Proto definitions
In `proto/swe/v1/`: project.proto, agent.proto, work.proto, events.proto. gRPC compilation not yet enabled (commented out in swe-api).

## Key Config

### Environment variables (used in Docker)
- `RUST_LOG` — tracing filter (default: `info`)
- `DATABASE_URL` — PostgreSQL connection string
- `TEMPORAL_ADDRESS` — Temporal gRPC endpoint
- `LITELLM_URL` — LiteLLM proxy URL
- `REDIS_URL` — Redis connection
- `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_WS_URL` — client-side API/WS endpoints
- `BETTER_AUTH_SECRET` — session signing key

### Rust Dockerfile
Multi-stage build in root `Dockerfile`. Installs `protobuf-compiler` for temporalio-sdk. Uses dependency caching via dummy source files (with `touch` to invalidate). Three runtime targets: `api`, `cli`, `worker` (all Debian bookworm-slim). Use `--no-cache` when dependencies change.
