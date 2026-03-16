# SWE — Enterprise Agentic Platform

An enterprise agentic platform built in **Rust** on **Temporal** that orchestrates specialized AI agents across the full software engineering lifecycle.

## Vision

SWE provides a fleet of AI agents — architects, coders, testers, security reviewers, SREs — that collaborate on software projects with human oversight. Think of it as your engineering team's AI co-workers: deterministic, stateful, replayable, and always available.

## Core Principles

- **LLM-agnostic** — Bring your own model via LiteLLM proxy
- **Temporal-native** — All state in Temporal workflows. Replay, pause, resume everything.
- **Conversational-first** — `swe chat` is the front door. Zero learning curve.
- **Cloud-native** — Containerized, K8s-native, same topology dev and prod

## Quick Start

```bash
# Install the CLI
cargo install --path crates/swe-cli

# Initialize config
swe config init

# Start the chat (the front door)
swe chat

# Or kick off a project with one command
swe run "Build a REST API for user management with JWT auth"
```

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Clients: Web UI │ CLI │ Slack │ Teams           │
└──────────┬──────────────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────┐
│  Next.js BFF (BetterAuth, WebSockets, SSR)      │
└──────────┬──────────────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────┐
│  SWE Core API (Rust, gRPC + REST)               │
└──────────┬──────────────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────┐
│  Temporal Server (orchestration, state, replay)  │
└──────────┬──────────────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────┐
│  SWE Worker (Rust Temporal worker)               │
└──────────┬──────────┬───────────────────────────┘
           │          │
     ┌─────▼───┐  ┌──▼──────────────────┐
     │ LiteLLM │  │ Agent Sandboxes      │
     │ (proxy) │  │ (K8s Jobs)           │
     └─────────┘  └─────────────────────┘
```

## Agent Types

| Agent | Role | MVP |
|-------|------|-----|
| 🎯 Orchestrator | Project coordinator, human interface | ✅ |
| 📐 Architect | System design, BDRs, ADRs | ✅ |
| 🧪 SDET | Test plans, UAT, acceptance criteria | ✅ |
| 💻 Coder | Implementation, bug fixes | ✅ |
| 🔒 Security | Threat modeling, audits | Post-MVP |
| 🚨 SRE | Monitoring, incident response | Post-MVP |
| 🔧 DevOps | CI/CD, IaC | Post-MVP |
| ☁️ Platform | K8s, networking, cloud | Post-MVP |

## Project Structure

```
swe/
├── crates/
│   ├── swe-core/        # Domain types, config, roles
│   ├── swe-temporal/    # Temporal workflows & activities
│   ├── swe-api/         # REST + gRPC API server
│   ├── swe-cli/         # CLI binary (swe)
│   └── swe-sandbox/     # K8s sandbox management
├── proto/               # Protobuf definitions
├── web/                 # Next.js web UI
├── sandbox-images/      # Docker images for agent roles
└── docker-compose.yml   # Local dev stack
```

## Development

### Prerequisites

- Go 1.25+
- Docker / OrbStack
- Bun (for web UI)
- [OpenCode](https://github.com/opencode-ai/opencode) (`bun install -g opencode`) — required for agent code execution

### Getting Started

```bash
# 1. Start infrastructure (Temporal, Postgres, Redis, LiteLLM, API, Web UI)
docker compose up -d

# 2. Start the Temporal worker on the host
./scripts/worker-start.sh
```

The worker runs on the **host** (not Docker) so it can spawn OpenCode processes and access local project directories. This is required for agents to write code to your filesystem.

### Worker Management

```bash
# Start worker in foreground (see logs, Ctrl+C to stop)
./scripts/worker-start.sh

# Start worker in background
./scripts/worker-start.sh --background

# Stop background worker
./scripts/worker-stop.sh
```

The worker connects to Docker services on localhost (Temporal :7233, Postgres :5432, Redis :6379, LiteLLM :4000, API :8080). Override with env vars if needed:

```bash
DATABASE_URL=postgres://... TEMPORAL_ADDRESS=... ./scripts/worker-start.sh
```

### Build Commands

```bash
# Go
go build ./...                     # Build all packages
go test ./...                      # Run all tests
go build ./cmd/api/                # Build API server
go build ./cmd/worker/             # Build Temporal worker

# Web UI
cd web && bun install && bun run dev   # Dev server on :3000
cd web && bun run build                # Production build
```

### Docker (full stack minus worker)

```bash
docker compose up -d                 # Start all services
docker compose up -d --build swe-web # Rebuild + restart web UI
docker compose logs -f swe-api       # Tail API logs
docker compose down                  # Stop everything
```

### LiteLLM Setup

Copy `config/litellm.example.yaml` to `config/litellm.yaml` and add your API keys before starting Docker.

## License

MIT — see [LICENSE](LICENSE)
