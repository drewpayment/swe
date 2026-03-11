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

- Rust (stable)
- Docker / OrbStack
- Node.js 22+
- Temporal CLI (optional, for local dev server)

### Build

```bash
# Build all Rust crates
cargo build

# Run tests
cargo test

# Build the CLI
cargo build -p swe-cli --release

# Start dev infrastructure
docker compose up -d
```

## License

MIT — see [LICENSE](LICENSE)
