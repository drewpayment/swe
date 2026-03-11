# SWE — Enterprise Agentic Platform

*Design Document — March 11, 2026*

---

## Overview

**SWE** is an enterprise agentic platform built in **Rust** on **Temporal** that orchestrates specialized AI agents across the full software engineering lifecycle. It provides deterministic, stateful, replayable workflows with human-in-the-loop collaboration.

### Core Principles

- **LLM-agnostic** — pluggable model layer (via LiteLLM or similar proxy) so users bring their own AI provider
- **Temporal-native** — all orchestration state lives in Temporal workflows. Replay, pause, resume, and audit everything. No external databases for workflow state.
- **Hybrid execution** — lightweight tool-based execution for knowledge work (docs, designs, reviews), sandboxed K8s containers for execution work (coding, testing, builds)
- **Conversational-first** — `swe chat` is the front door. The orchestrator IS the interface. CLI commands exist for power users and automation.
- **Enterprise-ready** — SSO/SAML via BetterAuth, Slack/Teams integrations, RBAC, audit trails
- **Cloud-native** — all components containerized, K8s-native deployment, OrbStack K8s for local development

### Relationship to Gastown

SWE is a clean-room rebuild inspired by [gastown-rusted](https://github.com/drewpayment/gastown-rusted). Key lessons carried forward:

- Temporal workflows as the single source of state (no databases for orchestration)
- Agent lifecycle management as workflows
- CLI-driven developer experience
- Work item → agent assignment → delivery pipeline

Key departures from gastown:

- **No tmux** — agent session management moves entirely into Temporal workflows and K8s sandboxes
- **LLM-agnostic** — not coupled to Claude Code CLI; uses API layer via LiteLLM proxy
- **Broader agent taxonomy** — beyond coding agents to architecture, testing, security, SRE, DevOps
- **Enterprise integrations** — Slack, Teams, web UI, not just CLI
- **K8s-native sandboxes** — containers for agent execution, not local worktrees

---

## Architecture

### System Layers

```
┌─────────────────────────────────────────────────┐
│  Clients: Web UI │ CLI │ Slack │ Teams           │
└──────────┬──────────────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────┐
│  Next.js BFF (BetterAuth, WebSockets, SSR)      │
│  - Auth / session management                     │
│  - Live agent streaming via WebSocket            │
│  - UI-specific aggregation                       │
└──────────┬──────────────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────┐
│  SWE Core API (Rust, gRPC + REST)               │
│  - Project management                            │
│  - Agent lifecycle                               │
│  - Work item CRUD                                │
│  - Integration hooks (Slack/Teams webhooks)      │
└──────────┬──────────────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────┐
│  Temporal Server (orchestration, state, replay)  │
│  ┌─────────────┐  ┌─────────────┐               │
│  │ Project WFs  │  │ Agent WFs   │               │
│  │ (per-project)│  │ (per-agent) │               │
│  └─────────────┘  └─────────────┘               │
└──────────┬──────────────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────┐
│  SWE Worker (Rust Temporal worker)               │
│  - Workflow definitions                          │
│  - Activity implementations                      │
│  - LLM proxy client (→ LiteLLM)                 │
│  - Container manager (→ K8s API)                 │
└──────────┬──────────┬───────────────────────────┘
           │          │
     ┌─────▼───┐  ┌──▼──────────────────┐
     │ LiteLLM │  │ Agent Sandboxes      │
     │ (model  │  │ (K8s Jobs per task)  │
     │  proxy) │  │                      │
     └─────────┘  └─────────────────────┘
```

### Key Architectural Decisions

- **SWE Core API** is the single source of truth for all clients. CLI, web, Slack — they all hit the same Rust API.
- **Temporal Server** runs as its own service (official Temporal helm chart for K8s, or Temporal Cloud).
- **SWE Worker** is the Rust binary that registers workflows and activities with Temporal.
- **Agent sandboxes** are K8s Jobs — same in dev (OrbStack K8s) and prod. No Docker-in-Docker.
- **LiteLLM** runs as a sidecar/service, handles model routing, API key management, rate limiting.
- **Postgres** stores BetterAuth sessions, project metadata, and artifact references (not workflow state — that's Temporal).
- **Redis** handles WebSocket pub/sub for live agent streaming and caching.

---

## Workflow Model

### Orchestrator Hierarchy

```
Global Orchestrator (always running)
├── Manages multiple projects
├── Default `swe chat` target
├── Creates projects and spawns project orchestrators
│
├── Project Orchestrator (per project, long-lived)
│   ├── Human-in-the-loop touchpoint for the project
│   ├── Dispatches work to specialist agents
│   ├── Aggregates agent outputs
│   └── Manages phase transitions
│
└── Project Orchestrator (another project)
    └── ...
```

- `swe chat` → connects to global orchestrator (cross-project, can create new projects)
- `swe chat --project auth-service` → connects to that project's orchestrator
- `swe chat architect` → direct line to a specific agent

### Project Workflow (long-lived)

Each project gets a single long-lived workflow that tracks the full engagement lifecycle:

```
ProjectWorkflow
├── State: phase, decisions[], artifacts[], active_agents[]
├── Signals: advance_phase, assign_work, human_input, abort
├── Queries: status, timeline, agent_summary
│
├── Project Orchestrator Agent WF (always running while project is active)
│   ├── Receives human messages, dispatches to specialist agents
│   ├── Aggregates agent outputs, presents to human
│   └── Manages phase transitions (design → build → test → deploy)
│
├── Specialist Agent WFs (spawned as child workflows)
│   ├── Ephemeral: spin up for a task, deliver artifact, terminate
│   └── Persistent: long-running monitors (SRE, security scanning)
│
└── Artifact Registry
    ├── BDRs, design docs, test plans, audit reports
    ├── Code branches, PR references
    └── Architecture diagrams, wireframes
```

### Agent Workflow (per-agent)

Every agent, regardless of type, shares a common lifecycle workflow:

```
AgentWorkflow
├── State: role, assignment, context, conversation_history
├── Signals: assign_work, message, cancel, checkpoint
├── Queries: status, current_work, health
│
├── Phases:
│   1. Initialize — load role config, tools, context
│   2. Plan — LLM generates execution plan from assignment
│   3. Execute — iterative tool use / sandbox work
│   4. Review — self-check or peer agent review
│   5. Deliver — produce artifact, notify orchestrator
│   6. Teardown — save checkpoint, release resources
│
└── Heartbeat: periodic health signal to orchestrator
```

### Agent Collaboration

Agents collaborate via an **orchestrator + message passing** model:

- The project orchestrator routes work between agents and composes workflow pipelines
- Agents can directly message each other for peer review, clarification, etc.
- Structured where it matters (design → review → implement pipeline), flexible where it doesn't (ad-hoc agent-to-agent chat)

Example flow:
1. Architect agent produces a design → signals orchestrator
2. Orchestrator routes to security agent for review
3. Security agent reviews, flags concerns → signals orchestrator
4. Orchestrator routes feedback to architect for revision
5. Architect revises → orchestrator routes to SDET for test planning
6. SDET derives acceptance criteria → orchestrator signals coder to begin

---

## Agent Types

### v0.1 (MVP)

| Agent | Role | Execution Model |
|-------|------|-----------------|
| **Orchestrator** | Project coordinator, human interface, work dispatcher | Tool-based (no sandbox) |
| **Architect** | System design, BDRs, ADRs, API specs, diagrams | Tool-based |
| **SDET** | Test plans, UAT, acceptance criteria, test generation & execution | Sandbox (needs to run tests) |
| **Coder** | Implementation, bug fixes, refactoring, PR creation | Sandbox (needs repo + runtime) |

### Post-MVP

| Agent | Role | Execution Model |
|-------|------|-----------------|
| Security | Threat modeling, audit reports, SAST review | Tool-based + sandbox for scanning |
| SRE | Monitoring, incident response, runbooks | Tool-based + infra access |
| DevOps | CI/CD, IaC, pipeline configuration | Sandbox (validate configs) |
| Platform | K8s manifests, networking, cloud provisioning | Sandbox |

---

## Container & Sandbox Architecture

### Development (OrbStack)

Platform services run via Docker Compose. Agent sandboxes run as K8s Jobs in OrbStack's built-in Kubernetes.

```yaml
# docker-compose.yml — platform services only
services:
  temporal:           # Official Temporal dev server
  temporal-ui:        # Temporal Web UI (dev debugging)
  litellm:            # LLM proxy with model configs
  swe-api:            # Rust core API
  swe-worker:         # Rust Temporal worker
  swe-web:            # Next.js BFF + UI
  postgres:           # BetterAuth sessions + project metadata
  redis:              # WebSocket pub/sub, caching
```

Agent sandboxes (K8s Jobs via OrbStack K8s):
- Mounted workspace volume (repo checkout, docs, artifacts)
- Network access to LiteLLM and the SWE API
- Resource limits (CPU, memory, timeout)
- Role-specific tooling pre-installed

### Production (Kubernetes)

```
Namespace: swe-system
├── Deployment: swe-api (replicas: 2+)
├── Deployment: swe-worker (replicas: 2+, autoscaled)
├── Deployment: swe-web (replicas: 2+)
├── Deployment: litellm
├── StatefulSet: temporal-server (or Temporal Cloud)
├── StatefulSet: postgres
├── Deployment: redis
│
Namespace: swe-sandboxes (isolated)
├── Agent sandboxes → K8s Jobs
│   ├── Job per task, pod spec per agent role
│   ├── Resource quotas per namespace
│   ├── Network policies (sandboxes reach LiteLLM + API only)
│   └── Auto-cleanup via TTL controller
```

Key production concerns:
- **Temporal Cloud** as an option — skip self-hosting Temporal entirely
- **Sandbox isolation** — agent containers run in a separate namespace with strict network policies
- **Artifact storage** — S3/MinIO for persisting agent outputs
- **Secrets** — K8s secrets for API keys, injected into sandbox pods via env vars

---

## Rust Crate Structure

```
swe/
├── Cargo.toml                    # Workspace root
├── Dockerfile                    # Multi-stage: builder + runtime
├── docker-compose.yml
│
├── crates/
│   ├── swe-core/                 # Domain types, config, shared logic
│   │   ├── src/
│   │   │   ├── types/            # Project, Agent, WorkItem, Artifact
│   │   │   ├── config/           # Platform config (TOML)
│   │   │   ├── roles/            # Agent role definitions & tool manifests
│   │   │   └── errors/
│   │   └── Cargo.toml
│   │
│   ├── swe-temporal/             # Workflows, activities, signals
│   │   ├── src/
│   │   │   ├── workflows/
│   │   │   │   ├── project.rs    # Project lifecycle workflow
│   │   │   │   ├── agent.rs      # Generic agent workflow
│   │   │   │   ├── orchestrator.rs
│   │   │   │   └── sandbox.rs    # Sandbox lifecycle management
│   │   │   ├── activities/
│   │   │   │   ├── llm.rs        # LiteLLM client calls
│   │   │   │   ├── container.rs  # K8s sandbox management
│   │   │   │   ├── tools.rs      # File I/O, git, HTTP, etc.
│   │   │   │   └── artifact.rs   # Store/retrieve artifacts
│   │   │   └── signals/          # Signal & query definitions
│   │   └── Cargo.toml
│   │
│   ├── swe-api/                  # gRPC + REST API server
│   │   ├── src/
│   │   │   ├── grpc/             # Protobuf service definitions
│   │   │   ├── rest/             # Axum REST handlers
│   │   │   ├── auth/             # API key / token validation
│   │   │   └── websocket/        # Live event streaming
│   │   └── Cargo.toml
│   │
│   ├── swe-cli/                  # CLI binary
│   │   ├── src/
│   │   │   ├── commands/         # init, work, agents, chat, status...
│   │   │   └── output/           # Terminal formatting, tables, color
│   │   └── Cargo.toml
│   │
│   └── swe-sandbox/              # Sandbox image builder & runtime
│       ├── src/
│       │   ├── images/           # Dockerfile templates per role
│       │   ├── runtime/          # In-container agent runtime
│       │   └── volume/           # Workspace mount management
│       └── Cargo.toml
│
├── proto/                        # Protobuf definitions
│   └── swe/v1/
│       ├── project.proto
│       ├── agent.proto
│       ├── work.proto
│       └── events.proto
│
├── web/                          # Next.js app (separate package.json)
│   ├── src/
│   │   ├── app/                  # App router
│   │   ├── components/           # shadcn/ui components
│   │   ├── lib/
│   │   │   ├── auth/             # BetterAuth config
│   │   │   ├── api/              # gRPC-web / REST client
│   │   │   └── ws/               # WebSocket hooks for live streaming
│   │   └── ...
│   ├── package.json
│   └── Dockerfile
│
└── sandbox-images/               # Base Docker images for agent roles
    ├── coder/Dockerfile
    ├── sdet/Dockerfile
    └── base/Dockerfile           # Shared base with common tools
```

### Crate Responsibilities

- **swe-core** — Zero dependencies on Temporal or HTTP frameworks. Pure domain types, config parsing, role definitions.
- **swe-temporal** — All workflow and activity logic. Depends on `temporal-sdk-core`. The worker binary lives here.
- **swe-api** — Thin HTTP/gRPC shell. Axum for REST, tonic for gRPC. Connects to Temporal as a client.
- **swe-cli** — Thin client that hits the SWE API. Uses clap for argument parsing, colored terminal output.
- **swe-sandbox** — K8s Job management, sandbox image building, workspace volume handling.

---

## CLI Design

### Philosophy

The CLI has two modes:
1. **Conversational** — `swe chat` is the front door. Zero learning curve. The orchestrator can do everything the CLI can do, but through natural conversation.
2. **Command** — Direct commands for power users, scripting, and CI/CD.

### Core Commands

```bash
# Platform lifecycle
swe up                              # Start platform services
swe down                            # Stop platform services
swe status                          # Platform health + active projects
swe doctor                          # Validate dependencies

# Conversational interface (the front door)
swe chat                            # Global orchestrator — manages all projects
swe chat --project <name>           # Scoped to a specific project
swe chat <agent>                    # Direct line to a specific agent

# The power move — one-liner project kickoff
swe run "<prompt>"                  # Full project from a single prompt
swe run "<prompt>" --repo <url> --agents coder,sdet --approve-all

# Project management
swe project init "<name>"
swe project list
swe project status <name>
swe project archive <name>

# Work items
swe work create "<title>" --project <name>
swe work list --project <name>
swe work show <id>

# Agent interaction
swe agents list
swe agents list --project <name>
swe attach <agent-id>               # Live interactive session

# Artifacts
swe artifacts list --project <name>
swe artifacts show <id>
swe artifacts export <id> -o ./

# Sandbox management
swe sandbox list
swe sandbox logs <id>
swe sandbox exec <id> -- bash

# Configuration
swe config init
swe config set llm.provider openai
swe config set llm.model gpt-4o
```

---

## Web UI

Built with Next.js App Router + shadcn/ui. Dark mode default.

### Pages

**`/dashboard`** — Home
- Project cards with status badges (designing / building / testing / complete)
- Active agent count per project
- Recent activity feed
- System health indicators

**`/projects/[id]`** — Project Detail
- Agent sidebar (status, role, health)
- Timeline / activity feed (replayable)
- Artifact list with approval status
- Chat panel (talk to orchestrator or any agent)

**`/projects/[id]/agents/[agentId]`** — Agent Live View
- Real-time stream of agent activity
- Current assignment and progress
- Conversation history
- Resource usage (tokens, sandbox CPU/memory)

**`/projects/[id]/artifacts/[artifactId]`** — Artifact Viewer
- Rendered markdown for docs/BDRs
- Diff view for code changes
- Inline approval/rejection with comments

**`/settings`** — Platform Config
- LLM provider configuration
- Model preferences per agent role
- K8s cluster connection
- Integration setup (Slack/Teams)
- User management

---

## Technology Stack

| Component | Technology |
|-----------|-----------|
| Core platform | Rust (stable, edition 2021) |
| Orchestration | Temporal (self-hosted or Cloud) |
| API framework | Axum (REST) + Tonic (gRPC) |
| CLI | Clap |
| LLM proxy | LiteLLM |
| Web UI | Next.js (App Router) + shadcn/ui |
| Auth | BetterAuth |
| Database | PostgreSQL (metadata, auth) |
| Cache/PubSub | Redis |
| Containers | Kubernetes (OrbStack local, any K8s prod) |
| Artifact storage | S3 / MinIO |
| Protobuf | prost + tonic-build |

---

## MVP Scope (v0.1)

### In Scope
- [ ] Rust workspace with 5 crates (core, temporal, api, cli, sandbox)
- [ ] Temporal workflows: project, agent, orchestrator
- [ ] 4 agent types: orchestrator, architect, SDET, coder
- [ ] LiteLLM integration for LLM-agnostic model access
- [ ] `swe chat` conversational interface (CLI)
- [ ] `swe run` one-liner project kickoff
- [ ] Core CLI commands (project, work, agents, status)
- [ ] K8s Job-based sandboxes for coder and SDET agents
- [ ] Next.js web UI: dashboard, project detail, agent live view, chat
- [ ] BetterAuth authentication
- [ ] Docker Compose for local platform services
- [ ] K8s manifests for production deployment
- [ ] Protobuf API definitions

### Out of Scope (post-MVP)
- Slack / Teams integrations
- Security, SRE, DevOps, Platform agent types
- Multi-tenant / multi-user RBAC
- Temporal Cloud integration
- Plugin system
- CI/CD pipeline integration
- Diagram / wireframe generation
- Artifact versioning
