# SWE Platform Wiring — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire the SWE platform end-to-end — database persistence, live API handlers, Temporal SDK integration, CLI→API connectivity, and Web UI→API data flow — so the scaffold becomes a functioning system.

**Architecture:** Add SQLx as the database layer in `swe-core` (keeping it framework-agnostic by exposing a `Db` pool type). API handlers in `swe-api` get a shared `AppState` holding the pool. The Temporal worker switches from stubs to `temporalio-sdk` (0.1.0-alpha.1) with real workflow/activity registration. CLI commands use `reqwest` to call the API. Web UI swaps hardcoded mock data for `fetch()` calls to the API.

**Tech Stack:** SQLx (Postgres, compile-time unchecked queries via `query_as`), `temporalio-sdk` 0.1.0-alpha.1, `reqwest` for CLI HTTP client, Next.js `fetch` for web UI.

**Key constraint:** `temporalio-sdk` is prerelease (0.1.0-alpha.1). We'll integrate it but keep a fallback stub mode so the platform runs without Temporal for dev/testing.

---

## Phase 1: Database Layer

### Task 1: Add SQLx dependency and `Db` module to `swe-core`

**Files:**
- Modify: `Cargo.toml` (workspace root, add sqlx to workspace deps)
- Modify: `crates/swe-core/Cargo.toml` (add sqlx dep)
- Create: `crates/swe-core/src/db.rs`
- Modify: `crates/swe-core/src/lib.rs` (export db module)

**Step 1: Add SQLx to workspace dependencies**

In `Cargo.toml` (workspace root), add to `[workspace.dependencies]`:

```toml
sqlx = { version = "0.8", features = ["runtime-tokio", "tls-rustls", "postgres", "uuid", "chrono", "json"] }
```

**Step 2: Add SQLx to swe-core Cargo.toml**

In `crates/swe-core/Cargo.toml`, add to `[dependencies]`:

```toml
sqlx = { workspace = true }
tokio = { workspace = true }
```

**Step 3: Create the `db.rs` module**

Create `crates/swe-core/src/db.rs`:

```rust
//! Database connection pool and helpers.

use sqlx::postgres::PgPoolOptions;

pub type Pool = sqlx::PgPool;

/// Create a database connection pool.
pub async fn connect(database_url: &str, max_connections: u32) -> crate::Result<Pool> {
    PgPoolOptions::new()
        .max_connections(max_connections)
        .connect(database_url)
        .await
        .map_err(|e| crate::Error::Internal(format!("Database connection failed: {e}")))
}
```

**Step 4: Export from lib.rs**

In `crates/swe-core/src/lib.rs`, add:

```rust
pub mod db;
```

**Step 5: Verify it compiles**

Run: `cargo check -p swe-core`
Expected: compiles with no errors

**Step 6: Commit**

```bash
git add Cargo.toml crates/swe-core/Cargo.toml crates/swe-core/src/db.rs crates/swe-core/src/lib.rs
git commit -m "feat(swe-core): add SQLx database pool module"
```

---

### Task 2: Create SQL migrations

**Files:**
- Create: `migrations/001_initial_schema.sql`

**Step 1: Create migrations directory and initial schema**

Create `migrations/001_initial_schema.sql`:

```sql
-- Projects
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    phase TEXT NOT NULL DEFAULT 'planning',
    status TEXT NOT NULL DEFAULT 'active',
    repo_url TEXT,
    decisions JSONB NOT NULL DEFAULT '[]',
    workflow_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Agents
CREATE TABLE IF NOT EXISTS agents (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'initializing',
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    current_work_item_id UUID,
    context TEXT,
    workflow_id TEXT,
    sandbox_id TEXT,
    tokens_consumed BIGINT NOT NULL DEFAULT 0,
    last_heartbeat TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Work items
CREATE TABLE IF NOT EXISTS work_items (
    id UUID PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    priority TEXT NOT NULL DEFAULT 'normal',
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    assigned_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    depends_on JSONB NOT NULL DEFAULT '[]',
    blocks JSONB NOT NULL DEFAULT '[]',
    branch_name TEXT,
    pr_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- Artifacts
CREATE TABLE IF NOT EXISTS artifacts (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    artifact_type TEXT NOT NULL,
    description TEXT,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    work_item_id UUID REFERENCES work_items(id) ON DELETE SET NULL,
    created_by_agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    content TEXT,
    storage_url TEXT,
    mime_type TEXT NOT NULL DEFAULT 'text/plain',
    size_bytes BIGINT NOT NULL DEFAULT 0,
    approval_status TEXT NOT NULL DEFAULT 'pending',
    approved_by TEXT,
    approval_comment TEXT,
    version INT NOT NULL DEFAULT 1,
    previous_version_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agents_project_id ON agents(project_id);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_work_items_project_id ON work_items(project_id);
CREATE INDEX IF NOT EXISTS idx_work_items_status ON work_items(status);
CREATE INDEX IF NOT EXISTS idx_work_items_assigned_agent ON work_items(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_project_id ON artifacts(project_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_type ON artifacts(artifact_type);
CREATE INDEX IF NOT EXISTS idx_artifacts_approval ON artifacts(approval_status);
```

**Step 2: Run migration against local Postgres**

Run: `psql postgres://swe:swe@localhost:5432/swe -f migrations/001_initial_schema.sql`
Expected: `CREATE TABLE` x4, `CREATE INDEX` x7

**Step 3: Commit**

```bash
git add migrations/
git commit -m "feat: add initial database schema migration"
```

---

### Task 3: Add database query functions to `swe-core`

**Files:**
- Create: `crates/swe-core/src/db/mod.rs` (convert db.rs to module)
- Create: `crates/swe-core/src/db/projects.rs`
- Create: `crates/swe-core/src/db/agents.rs`
- Create: `crates/swe-core/src/db/work_items.rs`
- Create: `crates/swe-core/src/db/artifacts.rs`

**Step 1: Convert `db.rs` to a module directory**

Rename `crates/swe-core/src/db.rs` → `crates/swe-core/src/db/mod.rs` and add submodule exports:

```rust
//! Database connection pool and query functions.

pub mod projects;
pub mod agents;
pub mod work_items;
pub mod artifacts;

use sqlx::postgres::PgPoolOptions;

pub type Pool = sqlx::PgPool;

/// Create a database connection pool.
pub async fn connect(database_url: &str, max_connections: u32) -> crate::Result<Pool> {
    PgPoolOptions::new()
        .max_connections(max_connections)
        .connect(database_url)
        .await
        .map_err(|e| crate::Error::Internal(format!("Database connection failed: {e}")))
}
```

**Step 2: Create `db/projects.rs`**

```rust
//! Project database queries.

use chrono::{DateTime, Utc};
use sqlx::FromRow;
use uuid::Uuid;

use crate::{Project, ProjectPhase, ProjectStatus};

use super::Pool;

/// Row type for reading projects from the database.
#[derive(Debug, FromRow)]
struct ProjectRow {
    id: Uuid,
    name: String,
    description: Option<String>,
    phase: String,
    status: String,
    repo_url: Option<String>,
    decisions: serde_json::Value,
    workflow_id: Option<String>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

impl ProjectRow {
    fn into_project(self) -> Project {
        let phase = serde_json::from_value(serde_json::Value::String(self.phase))
            .unwrap_or_default();
        let status = serde_json::from_value(serde_json::Value::String(self.status))
            .unwrap_or_default();
        let decisions: Vec<String> =
            serde_json::from_value(self.decisions).unwrap_or_default();

        Project {
            id: self.id,
            name: self.name,
            description: self.description,
            phase,
            status,
            repo_url: self.repo_url,
            active_agent_ids: Vec::new(), // populated separately
            artifact_ids: Vec::new(),
            work_item_ids: Vec::new(),
            decisions,
            created_at: self.created_at,
            updated_at: self.updated_at,
            workflow_id: self.workflow_id,
        }
    }
}

pub async fn list(pool: &Pool) -> crate::Result<Vec<Project>> {
    let rows = sqlx::query_as::<_, ProjectRow>("SELECT * FROM projects ORDER BY created_at DESC")
        .fetch_all(pool)
        .await
        .map_err(|e| crate::Error::Internal(format!("Failed to list projects: {e}")))?;
    Ok(rows.into_iter().map(|r| r.into_project()).collect())
}

pub async fn get(pool: &Pool, id: Uuid) -> crate::Result<Project> {
    let row = sqlx::query_as::<_, ProjectRow>("SELECT * FROM projects WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| crate::Error::Internal(format!("Failed to get project: {e}")))?
        .ok_or_else(|| crate::Error::ProjectNotFound(id.to_string()))?;
    Ok(row.into_project())
}

pub async fn insert(pool: &Pool, project: &Project) -> crate::Result<()> {
    let phase = serde_json::to_value(&project.phase)
        .unwrap_or_default()
        .as_str()
        .unwrap_or("planning")
        .to_string();
    let status = serde_json::to_value(&project.status)
        .unwrap_or_default()
        .as_str()
        .unwrap_or("active")
        .to_string();
    let decisions = serde_json::to_value(&project.decisions).unwrap_or_default();

    sqlx::query(
        "INSERT INTO projects (id, name, description, phase, status, repo_url, decisions, workflow_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)"
    )
    .bind(project.id)
    .bind(&project.name)
    .bind(&project.description)
    .bind(&phase)
    .bind(&status)
    .bind(&project.repo_url)
    .bind(&decisions)
    .bind(&project.workflow_id)
    .bind(project.created_at)
    .bind(project.updated_at)
    .execute(pool)
    .await
    .map_err(|e| crate::Error::Internal(format!("Failed to insert project: {e}")))?;
    Ok(())
}

pub async fn update_status(
    pool: &Pool,
    id: Uuid,
    status: &ProjectStatus,
) -> crate::Result<()> {
    let status_str = serde_json::to_value(status)
        .unwrap_or_default()
        .as_str()
        .unwrap_or("active")
        .to_string();
    let result = sqlx::query(
        "UPDATE projects SET status = $1, updated_at = now() WHERE id = $2",
    )
    .bind(&status_str)
    .bind(id)
    .execute(pool)
    .await
    .map_err(|e| crate::Error::Internal(format!("Failed to update project status: {e}")))?;
    if result.rows_affected() == 0 {
        return Err(crate::Error::ProjectNotFound(id.to_string()));
    }
    Ok(())
}

pub async fn update_phase(
    pool: &Pool,
    id: Uuid,
    phase: &ProjectPhase,
) -> crate::Result<()> {
    let phase_str = serde_json::to_value(phase)
        .unwrap_or_default()
        .as_str()
        .unwrap_or("planning")
        .to_string();
    let result = sqlx::query(
        "UPDATE projects SET phase = $1, updated_at = now() WHERE id = $2",
    )
    .bind(&phase_str)
    .bind(id)
    .execute(pool)
    .await
    .map_err(|e| crate::Error::Internal(format!("Failed to update project phase: {e}")))?;
    if result.rows_affected() == 0 {
        return Err(crate::Error::ProjectNotFound(id.to_string()));
    }
    Ok(())
}

pub async fn archive(pool: &Pool, id: Uuid) -> crate::Result<Project> {
    update_status(pool, id, &ProjectStatus::Cancelled).await?;
    update_phase(pool, id, &ProjectPhase::Archived).await?;
    get(pool, id).await
}
```

**Step 3: Create `db/agents.rs`**

```rust
//! Agent database queries.

use chrono::{DateTime, Utc};
use sqlx::FromRow;
use uuid::Uuid;

use crate::{Agent, AgentRole, types::agent::AgentStatus};

use super::Pool;

#[derive(Debug, FromRow)]
struct AgentRow {
    id: Uuid,
    name: String,
    role: String,
    status: String,
    project_id: Option<Uuid>,
    current_work_item_id: Option<Uuid>,
    context: Option<String>,
    workflow_id: Option<String>,
    sandbox_id: Option<String>,
    tokens_consumed: i64,
    last_heartbeat: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

impl AgentRow {
    fn into_agent(self) -> Agent {
        let role: AgentRole =
            serde_json::from_value(serde_json::Value::String(self.role)).unwrap_or(AgentRole::Coder);
        let status: AgentStatus =
            serde_json::from_value(serde_json::Value::String(self.status)).unwrap_or_default();

        Agent {
            id: self.id,
            name: self.name,
            role,
            status,
            project_id: self.project_id,
            current_work_item_id: self.current_work_item_id,
            conversation_history: Vec::new(), // not stored in DB
            context: self.context,
            created_at: self.created_at,
            updated_at: self.updated_at,
            last_heartbeat: self.last_heartbeat,
            workflow_id: self.workflow_id,
            sandbox_id: self.sandbox_id,
            tokens_consumed: self.tokens_consumed as u64,
        }
    }
}

pub async fn list(pool: &Pool, project_id: Option<Uuid>) -> crate::Result<Vec<Agent>> {
    let rows = if let Some(pid) = project_id {
        sqlx::query_as::<_, AgentRow>(
            "SELECT * FROM agents WHERE project_id = $1 ORDER BY created_at DESC",
        )
        .bind(pid)
        .fetch_all(pool)
        .await
    } else {
        sqlx::query_as::<_, AgentRow>("SELECT * FROM agents ORDER BY created_at DESC")
            .fetch_all(pool)
            .await
    }
    .map_err(|e| crate::Error::Internal(format!("Failed to list agents: {e}")))?;
    Ok(rows.into_iter().map(|r| r.into_agent()).collect())
}

pub async fn get(pool: &Pool, id: Uuid) -> crate::Result<Agent> {
    let row = sqlx::query_as::<_, AgentRow>("SELECT * FROM agents WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| crate::Error::Internal(format!("Failed to get agent: {e}")))?
        .ok_or_else(|| crate::Error::AgentNotFound(id.to_string()))?;
    Ok(row.into_agent())
}

pub async fn insert(pool: &Pool, agent: &Agent) -> crate::Result<()> {
    let role = serde_json::to_value(&agent.role)
        .unwrap_or_default()
        .as_str()
        .unwrap_or("coder")
        .to_string();
    let status = serde_json::to_value(&agent.status)
        .unwrap_or_default()
        .as_str()
        .unwrap_or("initializing")
        .to_string();

    sqlx::query(
        "INSERT INTO agents (id, name, role, status, project_id, current_work_item_id, context, workflow_id, sandbox_id, tokens_consumed, last_heartbeat, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)"
    )
    .bind(agent.id)
    .bind(&agent.name)
    .bind(&role)
    .bind(&status)
    .bind(agent.project_id)
    .bind(agent.current_work_item_id)
    .bind(&agent.context)
    .bind(&agent.workflow_id)
    .bind(&agent.sandbox_id)
    .bind(agent.tokens_consumed as i64)
    .bind(agent.last_heartbeat)
    .bind(agent.created_at)
    .bind(agent.updated_at)
    .execute(pool)
    .await
    .map_err(|e| crate::Error::Internal(format!("Failed to insert agent: {e}")))?;
    Ok(())
}

pub async fn update_status(pool: &Pool, id: Uuid, status: &AgentStatus) -> crate::Result<()> {
    let status_str = serde_json::to_value(status)
        .unwrap_or_default()
        .as_str()
        .unwrap_or("initializing")
        .to_string();
    let result = sqlx::query("UPDATE agents SET status = $1, updated_at = now() WHERE id = $2")
        .bind(&status_str)
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| crate::Error::Internal(format!("Failed to update agent status: {e}")))?;
    if result.rows_affected() == 0 {
        return Err(crate::Error::AgentNotFound(id.to_string()));
    }
    Ok(())
}
```

**Step 4: Create `db/work_items.rs`**

```rust
//! Work item database queries.

use chrono::{DateTime, Utc};
use sqlx::FromRow;
use uuid::Uuid;

use crate::{WorkItem, types::work_item::{Priority, WorkItemStatus}};

use super::Pool;

#[derive(Debug, FromRow)]
struct WorkItemRow {
    id: Uuid,
    title: String,
    description: Option<String>,
    status: String,
    priority: String,
    project_id: Uuid,
    assigned_agent_id: Option<Uuid>,
    depends_on: serde_json::Value,
    blocks: serde_json::Value,
    branch_name: Option<String>,
    pr_url: Option<String>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    started_at: Option<DateTime<Utc>>,
    completed_at: Option<DateTime<Utc>>,
}

impl WorkItemRow {
    fn into_work_item(self) -> WorkItem {
        let status: WorkItemStatus =
            serde_json::from_value(serde_json::Value::String(self.status)).unwrap_or_default();
        let priority: Priority =
            serde_json::from_value(serde_json::Value::String(self.priority)).unwrap_or_default();
        let depends_on: Vec<Uuid> = serde_json::from_value(self.depends_on).unwrap_or_default();
        let blocks: Vec<Uuid> = serde_json::from_value(self.blocks).unwrap_or_default();

        WorkItem {
            id: self.id,
            title: self.title,
            description: self.description,
            status,
            priority,
            project_id: self.project_id,
            assigned_agent_id: self.assigned_agent_id,
            artifact_ids: Vec::new(), // populated via join
            depends_on,
            blocks,
            branch_name: self.branch_name,
            pr_url: self.pr_url,
            created_at: self.created_at,
            updated_at: self.updated_at,
            started_at: self.started_at,
            completed_at: self.completed_at,
        }
    }
}

pub async fn list(pool: &Pool, project_id: Option<Uuid>) -> crate::Result<Vec<WorkItem>> {
    let rows = if let Some(pid) = project_id {
        sqlx::query_as::<_, WorkItemRow>(
            "SELECT * FROM work_items WHERE project_id = $1 ORDER BY created_at DESC",
        )
        .bind(pid)
        .fetch_all(pool)
        .await
    } else {
        sqlx::query_as::<_, WorkItemRow>("SELECT * FROM work_items ORDER BY created_at DESC")
            .fetch_all(pool)
            .await
    }
    .map_err(|e| crate::Error::Internal(format!("Failed to list work items: {e}")))?;
    Ok(rows.into_iter().map(|r| r.into_work_item()).collect())
}

pub async fn get(pool: &Pool, id: Uuid) -> crate::Result<WorkItem> {
    let row = sqlx::query_as::<_, WorkItemRow>("SELECT * FROM work_items WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| crate::Error::Internal(format!("Failed to get work item: {e}")))?
        .ok_or_else(|| crate::Error::WorkItemNotFound(id.to_string()))?;
    Ok(row.into_work_item())
}

pub async fn insert(pool: &Pool, item: &WorkItem) -> crate::Result<()> {
    let status = serde_json::to_value(&item.status)
        .unwrap_or_default()
        .as_str()
        .unwrap_or("pending")
        .to_string();
    let priority = serde_json::to_value(&item.priority)
        .unwrap_or_default()
        .as_str()
        .unwrap_or("normal")
        .to_string();
    let depends_on = serde_json::to_value(&item.depends_on).unwrap_or_default();
    let blocks = serde_json::to_value(&item.blocks).unwrap_or_default();

    sqlx::query(
        "INSERT INTO work_items (id, title, description, status, priority, project_id, assigned_agent_id, depends_on, blocks, branch_name, pr_url, created_at, updated_at, started_at, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)"
    )
    .bind(item.id)
    .bind(&item.title)
    .bind(&item.description)
    .bind(&status)
    .bind(&priority)
    .bind(item.project_id)
    .bind(item.assigned_agent_id)
    .bind(&depends_on)
    .bind(&blocks)
    .bind(&item.branch_name)
    .bind(&item.pr_url)
    .bind(item.created_at)
    .bind(item.updated_at)
    .bind(item.started_at)
    .bind(item.completed_at)
    .execute(pool)
    .await
    .map_err(|e| crate::Error::Internal(format!("Failed to insert work item: {e}")))?;
    Ok(())
}
```

**Step 5: Create `db/artifacts.rs`**

```rust
//! Artifact database queries.

use chrono::{DateTime, Utc};
use sqlx::FromRow;
use uuid::Uuid;

use crate::{Artifact, types::artifact::{ArtifactType, ApprovalStatus}};

use super::Pool;

#[derive(Debug, FromRow)]
struct ArtifactRow {
    id: Uuid,
    name: String,
    artifact_type: String,
    description: Option<String>,
    project_id: Uuid,
    work_item_id: Option<Uuid>,
    created_by_agent_id: Uuid,
    content: Option<String>,
    storage_url: Option<String>,
    mime_type: String,
    size_bytes: i64,
    approval_status: String,
    approved_by: Option<String>,
    approval_comment: Option<String>,
    version: i32,
    previous_version_id: Option<Uuid>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

impl ArtifactRow {
    fn into_artifact(self) -> Artifact {
        let artifact_type: ArtifactType =
            serde_json::from_value(serde_json::Value::String(self.artifact_type))
                .unwrap_or(ArtifactType::Other);
        let approval_status: ApprovalStatus =
            serde_json::from_value(serde_json::Value::String(self.approval_status))
                .unwrap_or_default();

        Artifact {
            id: self.id,
            name: self.name,
            artifact_type,
            description: self.description,
            project_id: self.project_id,
            work_item_id: self.work_item_id,
            created_by_agent_id: self.created_by_agent_id,
            content: self.content,
            storage_url: self.storage_url,
            mime_type: self.mime_type,
            size_bytes: self.size_bytes as u64,
            approval_status,
            approved_by: self.approved_by,
            approval_comment: self.approval_comment,
            version: self.version as u32,
            previous_version_id: self.previous_version_id,
            created_at: self.created_at,
            updated_at: self.updated_at,
        }
    }
}

pub async fn list(pool: &Pool, project_id: Option<Uuid>) -> crate::Result<Vec<Artifact>> {
    let rows = if let Some(pid) = project_id {
        sqlx::query_as::<_, ArtifactRow>(
            "SELECT * FROM artifacts WHERE project_id = $1 ORDER BY created_at DESC",
        )
        .bind(pid)
        .fetch_all(pool)
        .await
    } else {
        sqlx::query_as::<_, ArtifactRow>("SELECT * FROM artifacts ORDER BY created_at DESC")
            .fetch_all(pool)
            .await
    }
    .map_err(|e| crate::Error::Internal(format!("Failed to list artifacts: {e}")))?;
    Ok(rows.into_iter().map(|r| r.into_artifact()).collect())
}

pub async fn get(pool: &Pool, id: Uuid) -> crate::Result<Artifact> {
    let row = sqlx::query_as::<_, ArtifactRow>("SELECT * FROM artifacts WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| crate::Error::Internal(format!("Failed to get artifact: {e}")))?
        .ok_or_else(|| crate::Error::ArtifactNotFound(id.to_string()))?;
    Ok(row.into_artifact())
}

pub async fn insert(pool: &Pool, artifact: &Artifact) -> crate::Result<()> {
    let artifact_type = serde_json::to_value(&artifact.artifact_type)
        .unwrap_or_default()
        .as_str()
        .unwrap_or("other")
        .to_string();
    let approval_status = serde_json::to_value(&artifact.approval_status)
        .unwrap_or_default()
        .as_str()
        .unwrap_or("pending")
        .to_string();

    sqlx::query(
        "INSERT INTO artifacts (id, name, artifact_type, description, project_id, work_item_id, created_by_agent_id, content, storage_url, mime_type, size_bytes, approval_status, approved_by, approval_comment, version, previous_version_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)"
    )
    .bind(artifact.id)
    .bind(&artifact.name)
    .bind(&artifact_type)
    .bind(&artifact.description)
    .bind(artifact.project_id)
    .bind(artifact.work_item_id)
    .bind(artifact.created_by_agent_id)
    .bind(&artifact.content)
    .bind(&artifact.storage_url)
    .bind(&artifact.mime_type)
    .bind(artifact.size_bytes as i64)
    .bind(&approval_status)
    .bind(&artifact.approved_by)
    .bind(&artifact.approval_comment)
    .bind(artifact.version as i32)
    .bind(artifact.previous_version_id)
    .bind(artifact.created_at)
    .bind(artifact.updated_at)
    .execute(pool)
    .await
    .map_err(|e| crate::Error::Internal(format!("Failed to insert artifact: {e}")))?;
    Ok(())
}

pub async fn update_approval(
    pool: &Pool,
    id: Uuid,
    approved: bool,
    by: &str,
    comment: Option<&str>,
) -> crate::Result<Artifact> {
    let status = if approved { "approved" } else { "rejected" };
    let result = sqlx::query(
        "UPDATE artifacts SET approval_status = $1, approved_by = $2, approval_comment = $3, updated_at = now() WHERE id = $4",
    )
    .bind(status)
    .bind(by)
    .bind(comment)
    .bind(id)
    .execute(pool)
    .await
    .map_err(|e| crate::Error::Internal(format!("Failed to update artifact approval: {e}")))?;
    if result.rows_affected() == 0 {
        return Err(crate::Error::ArtifactNotFound(id.to_string()));
    }
    get(pool, id).await
}
```

**Step 6: Verify it compiles**

Run: `cargo check -p swe-core`
Expected: compiles with no errors

**Step 7: Commit**

```bash
git add crates/swe-core/src/db/
git commit -m "feat(swe-core): add database query functions for all domain types"
```

---

## Phase 2: Wire API Handlers to Database

### Task 4: Add `AppState` with DB pool to `swe-api`

**Files:**
- Modify: `crates/swe-api/Cargo.toml` (add sqlx dep)
- Modify: `crates/swe-api/src/lib.rs` (add AppState, pass pool to router)
- Modify: `crates/swe-api/src/main.rs` (connect to DB on startup)

**Step 1: Add sqlx to swe-api Cargo.toml**

Add to `[dependencies]` in `crates/swe-api/Cargo.toml`:

```toml
sqlx = { workspace = true }
```

**Step 2: Update `lib.rs` with AppState**

Replace `crates/swe-api/src/lib.rs` with:

```rust
//! # SWE API
//!
//! REST and gRPC API server for the SWE platform.

pub mod auth;
pub mod rest;
pub mod websocket;
// pub mod grpc; // Enable when proto files are compiled

use axum::{
    routing::{get, post, delete},
    Router,
};
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;

/// Shared application state.
#[derive(Clone)]
pub struct AppState {
    pub db: swe_core::db::Pool,
}

/// Create the API router with all routes.
pub fn create_router(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        // Health check
        .route("/health", get(rest::health::health_check))
        .route("/ready", get(rest::health::ready_check))

        // Projects
        .route("/api/v1/projects", get(rest::projects::list_projects))
        .route("/api/v1/projects", post(rest::projects::create_project))
        .route("/api/v1/projects/{id}", get(rest::projects::get_project))
        .route("/api/v1/projects/{id}", delete(rest::projects::archive_project))
        .route("/api/v1/projects/{id}/status", get(rest::projects::get_project_status))

        // Agents
        .route("/api/v1/agents", get(rest::agents::list_agents))
        .route("/api/v1/agents/{id}", get(rest::agents::get_agent))
        .route("/api/v1/agents/{id}/message", post(rest::agents::send_message))

        // Work items
        .route("/api/v1/work", get(rest::work::list_work_items))
        .route("/api/v1/work", post(rest::work::create_work_item))
        .route("/api/v1/work/{id}", get(rest::work::get_work_item))

        // Artifacts
        .route("/api/v1/artifacts", get(rest::artifacts::list_artifacts))
        .route("/api/v1/artifacts/{id}", get(rest::artifacts::get_artifact))
        .route("/api/v1/artifacts/{id}/content", get(rest::artifacts::get_artifact_content))
        .route("/api/v1/artifacts/{id}/approve", post(rest::artifacts::approve_artifact))

        // WebSocket for live streaming
        .route("/ws/stream", get(websocket::stream_handler))

        // State and layers
        .with_state(state)
        .layer(cors)
        .layer(TraceLayer::new_for_http())
}

/// Start the API server.
pub async fn start_server(host: &str, port: u16, state: AppState) -> Result<(), Box<dyn std::error::Error>> {
    let addr = format!("{}:{}", host, port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;

    tracing::info!("SWE API server listening on {}", addr);

    axum::serve(listener, create_router(state)).await?;

    Ok(())
}
```

**Step 3: Update `main.rs` to connect to database**

Replace `crates/swe-api/src/main.rs` with:

```rust
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .init();

    let host = std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8080);

    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://swe:swe@localhost:5432/swe".to_string());

    tracing::info!("Connecting to database...");
    let db = swe_core::db::connect(&database_url, 10).await?;
    tracing::info!("Database connected");

    let state = swe_api::AppState { db };

    swe_api::start_server(&host, port, state).await
}
```

**Step 4: Verify it compiles**

Run: `cargo check -p swe-api`
Expected: compile errors in handler functions (they don't accept State yet) — that's expected, we fix them in the next task.

**Step 5: Commit**

```bash
git add crates/swe-api/Cargo.toml crates/swe-api/src/lib.rs crates/swe-api/src/main.rs
git commit -m "feat(swe-api): add AppState with database pool"
```

---

### Task 5: Wire project API handlers to database

**Files:**
- Modify: `crates/swe-api/src/rest/projects.rs`

**Step 1: Replace `projects.rs` with database-backed handlers**

```rust
//! Project API endpoints.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use swe_core::{Project, ProjectPhase, ProjectStatus};

use super::{ApiResponse, error_response};
use crate::AppState;

/// Request to create a project.
#[derive(Debug, Deserialize)]
pub struct CreateProjectRequest {
    pub name: String,
    pub description: Option<String>,
    pub repo_url: Option<String>,
    pub initial_prompt: Option<String>,
}

/// Project summary for list responses.
#[derive(Debug, Serialize)]
pub struct ProjectSummary {
    pub id: Uuid,
    pub name: String,
    pub phase: ProjectPhase,
    pub status: ProjectStatus,
    pub active_agent_count: usize,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

/// List all projects.
pub async fn list_projects(
    State(state): State<AppState>,
) -> Result<Json<ApiResponse<Vec<ProjectSummary>>>, (StatusCode, Json<ApiResponse<()>>)> {
    let projects = swe_core::db::projects::list(&state.db)
        .await
        .map_err(|e| error_response(e))?;

    let summaries: Vec<ProjectSummary> = projects
        .into_iter()
        .map(|p| ProjectSummary {
            id: p.id,
            name: p.name,
            phase: p.phase,
            status: p.status,
            active_agent_count: p.active_agent_ids.len(),
            created_at: p.created_at,
        })
        .collect();

    Ok(Json(ApiResponse::success(summaries)))
}

/// Create a new project.
pub async fn create_project(
    State(state): State<AppState>,
    Json(request): Json<CreateProjectRequest>,
) -> Result<(StatusCode, Json<ApiResponse<Project>>), (StatusCode, Json<ApiResponse<()>>)> {
    let mut project = Project::new(&request.name);

    if let Some(desc) = request.description {
        project.description = Some(desc);
    }
    if let Some(url) = request.repo_url {
        project.repo_url = Some(url);
    }

    swe_core::db::projects::insert(&state.db, &project)
        .await
        .map_err(|e| error_response(e))?;

    tracing::info!(project_id = %project.id, name = %project.name, "Created project");

    Ok((StatusCode::CREATED, Json(ApiResponse::success(project))))
}

/// Get a project by ID.
pub async fn get_project(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<Project>>, (StatusCode, Json<ApiResponse<()>>)> {
    let project = swe_core::db::projects::get(&state.db, id)
        .await
        .map_err(|e| error_response(e))?;
    Ok(Json(ApiResponse::success(project)))
}

/// Get project status (detailed view).
pub async fn get_project_status(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<ProjectStatusResponse>>, (StatusCode, Json<ApiResponse<()>>)> {
    let project = swe_core::db::projects::get(&state.db, id)
        .await
        .map_err(|e| error_response(e))?;
    let agents = swe_core::db::agents::list(&state.db, Some(id))
        .await
        .map_err(|e| error_response(e))?;
    let work_items = swe_core::db::work_items::list(&state.db, Some(id))
        .await
        .map_err(|e| error_response(e))?;
    let artifacts = swe_core::db::artifacts::list(&state.db, Some(id))
        .await
        .map_err(|e| error_response(e))?;

    let response = ProjectStatusResponse {
        project,
        active_agents: agents
            .into_iter()
            .map(|a| AgentSummary {
                id: a.id,
                name: a.name,
                role: a.role.display_name().to_string(),
                status: format!("{:?}", a.status),
            })
            .collect(),
        pending_work: work_items
            .into_iter()
            .filter(|w| !w.is_complete())
            .map(|w| WorkSummary {
                id: w.id,
                title: w.title,
                status: format!("{:?}", w.status),
            })
            .collect(),
        recent_artifacts: artifacts
            .into_iter()
            .take(10)
            .map(|a| ArtifactSummary {
                id: a.id,
                name: a.name,
                artifact_type: format!("{:?}", a.artifact_type),
                approval_status: format!("{:?}", a.approval_status),
            })
            .collect(),
        pending_interactions: Vec::new(), // TODO: from Temporal queries
    };

    Ok(Json(ApiResponse::success(response)))
}

/// Archive a project.
pub async fn archive_project(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<Project>>, (StatusCode, Json<ApiResponse<()>>)> {
    let project = swe_core::db::projects::archive(&state.db, id)
        .await
        .map_err(|e| error_response(e))?;
    Ok(Json(ApiResponse::success(project)))
}

/// Detailed project status response.
#[derive(Debug, Serialize)]
pub struct ProjectStatusResponse {
    pub project: Project,
    pub active_agents: Vec<AgentSummary>,
    pub pending_work: Vec<WorkSummary>,
    pub recent_artifacts: Vec<ArtifactSummary>,
    pub pending_interactions: Vec<InteractionSummary>,
}

#[derive(Debug, Serialize)]
pub struct AgentSummary {
    pub id: Uuid,
    pub name: String,
    pub role: String,
    pub status: String,
}

#[derive(Debug, Serialize)]
pub struct WorkSummary {
    pub id: Uuid,
    pub title: String,
    pub status: String,
}

#[derive(Debug, Serialize)]
pub struct ArtifactSummary {
    pub id: Uuid,
    pub name: String,
    pub artifact_type: String,
    pub approval_status: String,
}

#[derive(Debug, Serialize)]
pub struct InteractionSummary {
    pub id: Uuid,
    pub prompt: String,
    pub interaction_type: String,
}
```

**Step 2: Verify it compiles**

Run: `cargo check -p swe-api`
Expected: may still error on other handler files not updated yet — that's fine.

**Step 3: Commit**

```bash
git add crates/swe-api/src/rest/projects.rs
git commit -m "feat(swe-api): wire project endpoints to database"
```

---

### Task 6: Wire remaining API handlers (agents, work items, artifacts)

**Files:**
- Modify: `crates/swe-api/src/rest/agents.rs`
- Modify: `crates/swe-api/src/rest/work.rs`
- Modify: `crates/swe-api/src/rest/artifacts.rs`

**Step 1: Replace `agents.rs`**

```rust
//! Agent API endpoints.

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use swe_core::Agent;

use super::{ApiResponse, error_response};
use crate::AppState;

#[derive(Debug, Deserialize)]
pub struct ListAgentsQuery {
    pub project_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
pub struct SendMessageRequest {
    pub content: String,
}

#[derive(Debug, Serialize)]
pub struct SendMessageResponse {
    pub message_id: Uuid,
    pub acknowledged: bool,
}

pub async fn list_agents(
    State(state): State<AppState>,
    Query(query): Query<ListAgentsQuery>,
) -> Result<Json<ApiResponse<Vec<Agent>>>, (StatusCode, Json<ApiResponse<()>>)> {
    let agents = swe_core::db::agents::list(&state.db, query.project_id)
        .await
        .map_err(|e| error_response(e))?;
    Ok(Json(ApiResponse::success(agents)))
}

pub async fn get_agent(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<Agent>>, (StatusCode, Json<ApiResponse<()>>)> {
    let agent = swe_core::db::agents::get(&state.db, id)
        .await
        .map_err(|e| error_response(e))?;
    Ok(Json(ApiResponse::success(agent)))
}

pub async fn send_message(
    State(_state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(_request): Json<SendMessageRequest>,
) -> Result<Json<ApiResponse<SendMessageResponse>>, (StatusCode, Json<ApiResponse<()>>)> {
    // TODO: Signal Temporal workflow with message
    tracing::info!(agent_id = %id, "Sending message to agent");

    Ok(Json(ApiResponse::success(SendMessageResponse {
        message_id: Uuid::new_v4(),
        acknowledged: true,
    })))
}
```

**Step 2: Replace `work.rs`**

```rust
//! Work item API endpoints.

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;
use uuid::Uuid;

use swe_core::{Priority, WorkItem};

use super::{ApiResponse, error_response};
use crate::AppState;

#[derive(Debug, Deserialize)]
pub struct ListWorkQuery {
    pub project_id: Option<Uuid>,
    pub status: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateWorkItemRequest {
    pub project_id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub priority: Option<Priority>,
}

pub async fn list_work_items(
    State(state): State<AppState>,
    Query(query): Query<ListWorkQuery>,
) -> Result<Json<ApiResponse<Vec<WorkItem>>>, (StatusCode, Json<ApiResponse<()>>)> {
    let items = swe_core::db::work_items::list(&state.db, query.project_id)
        .await
        .map_err(|e| error_response(e))?;
    Ok(Json(ApiResponse::success(items)))
}

pub async fn create_work_item(
    State(state): State<AppState>,
    Json(request): Json<CreateWorkItemRequest>,
) -> Result<(StatusCode, Json<ApiResponse<WorkItem>>), (StatusCode, Json<ApiResponse<()>>)> {
    let mut work_item = WorkItem::new(&request.title, request.project_id);

    if let Some(desc) = request.description {
        work_item.description = Some(desc);
    }
    if let Some(priority) = request.priority {
        work_item.priority = priority;
    }

    swe_core::db::work_items::insert(&state.db, &work_item)
        .await
        .map_err(|e| error_response(e))?;

    tracing::info!(work_item_id = %work_item.id, "Created work item");

    Ok((StatusCode::CREATED, Json(ApiResponse::success(work_item))))
}

pub async fn get_work_item(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<WorkItem>>, (StatusCode, Json<ApiResponse<()>>)> {
    let item = swe_core::db::work_items::get(&state.db, id)
        .await
        .map_err(|e| error_response(e))?;
    Ok(Json(ApiResponse::success(item)))
}
```

**Step 3: Replace `artifacts.rs`**

```rust
//! Artifact API endpoints.

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use swe_core::Artifact;

use super::{ApiResponse, error_response};
use crate::AppState;

#[derive(Debug, Deserialize)]
pub struct ListArtifactsQuery {
    pub project_id: Option<Uuid>,
    pub artifact_type: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ApproveArtifactRequest {
    pub approved: bool,
    pub comment: Option<String>,
    pub approved_by: String,
}

#[derive(Debug, Serialize)]
pub struct ArtifactContentResponse {
    pub artifact_id: Uuid,
    pub content: String,
    pub mime_type: String,
}

pub async fn list_artifacts(
    State(state): State<AppState>,
    Query(query): Query<ListArtifactsQuery>,
) -> Result<Json<ApiResponse<Vec<Artifact>>>, (StatusCode, Json<ApiResponse<()>>)> {
    let artifacts = swe_core::db::artifacts::list(&state.db, query.project_id)
        .await
        .map_err(|e| error_response(e))?;
    Ok(Json(ApiResponse::success(artifacts)))
}

pub async fn get_artifact(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<Artifact>>, (StatusCode, Json<ApiResponse<()>>)> {
    let artifact = swe_core::db::artifacts::get(&state.db, id)
        .await
        .map_err(|e| error_response(e))?;
    Ok(Json(ApiResponse::success(artifact)))
}

pub async fn get_artifact_content(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<ArtifactContentResponse>>, (StatusCode, Json<ApiResponse<()>>)> {
    let artifact = swe_core::db::artifacts::get(&state.db, id)
        .await
        .map_err(|e| error_response(e))?;

    let content = artifact
        .content
        .clone()
        .unwrap_or_default();

    Ok(Json(ApiResponse::success(ArtifactContentResponse {
        artifact_id: artifact.id,
        content,
        mime_type: artifact.mime_type,
    })))
}

pub async fn approve_artifact(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(request): Json<ApproveArtifactRequest>,
) -> Result<Json<ApiResponse<Artifact>>, (StatusCode, Json<ApiResponse<()>>)> {
    let artifact = swe_core::db::artifacts::update_approval(
        &state.db,
        id,
        request.approved,
        &request.approved_by,
        request.comment.as_deref(),
    )
    .await
    .map_err(|e| error_response(e))?;

    Ok(Json(ApiResponse::success(artifact)))
}
```

**Step 4: Update `rest/mod.rs` to remove unused import**

The `IntoResponse` import is unused — remove it:

```rust
use axum::{http::StatusCode, Json};
```

(Remove `response::IntoResponse` from the import.)

**Step 5: Verify everything compiles**

Run: `cargo check -p swe-api`
Expected: clean compile (warnings OK)

**Step 6: Commit**

```bash
git add crates/swe-api/src/rest/
git commit -m "feat(swe-api): wire all REST handlers to database queries"
```

---

### Task 7: Update Docker Compose to run migrations on startup

**Files:**
- Modify: `docker-compose.yml` (add init container or entrypoint for migrations)
- Create: `scripts/init-db.sh`

**Step 1: Create init script**

Create `scripts/init-db.sh`:

```bash
#!/bin/bash
set -e

echo "Running database migrations..."

for f in /migrations/*.sql; do
    echo "Applying: $f"
    psql "$DATABASE_URL" -f "$f"
done

echo "Migrations complete."
```

**Step 2: Add migration service to docker-compose.yml**

Add this service before `swe-api` in `docker-compose.yml`:

```yaml
  swe-migrate:
    image: postgres:16
    volumes:
      - ./migrations:/migrations
      - ./scripts/init-db.sh:/init-db.sh
    environment:
      DATABASE_URL: postgres://swe:swe@postgres:5432/swe
    entrypoint: ["/bin/bash", "/init-db.sh"]
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - swe-net
```

Update `swe-api` to depend on `swe-migrate`:

```yaml
    depends_on:
      postgres:
        condition: service_healthy
      swe-migrate:
        condition: service_completed_successfully
```

**Step 3: Make init script executable**

Run: `chmod +x scripts/init-db.sh`

**Step 4: Test locally**

Run: `docker compose up swe-migrate`
Expected: migration applies successfully

**Step 5: Commit**

```bash
git add docker-compose.yml scripts/init-db.sh migrations/
git commit -m "feat: add database migration service to docker-compose"
```

---

### Task 8: Integration test — API CRUD via curl

This is a manual verification step. No code to write.

**Step 1: Rebuild and restart**

Run: `docker compose up -d --build swe-api`

**Step 2: Create a project**

Run: `curl -s -X POST http://localhost:8080/api/v1/projects -H 'Content-Type: application/json' -d '{"name":"test-project","description":"Testing DB integration"}' | python3 -m json.tool`
Expected: `success: true` with a project object containing a UUID.

**Step 3: List projects**

Run: `curl -s http://localhost:8080/api/v1/projects | python3 -m json.tool`
Expected: `success: true` with array containing the project just created.

**Step 4: Get project by ID**

Run: `curl -s http://localhost:8080/api/v1/projects/<id-from-step-2> | python3 -m json.tool`
Expected: `success: true` with the full project object.

**Step 5: Archive project**

Run: `curl -s -X DELETE http://localhost:8080/api/v1/projects/<id> | python3 -m json.tool`
Expected: `success: true`, status is `cancelled`, phase is `archived`.

---

## Phase 3: CLI → API Connectivity

### Task 9: Add reqwest to swe-cli and create API client module

**Files:**
- Modify: `crates/swe-cli/Cargo.toml` (add reqwest)
- Create: `crates/swe-cli/src/api_client.rs`
- Modify: `crates/swe-cli/src/main.rs` (export api_client)

**Step 1: Add reqwest to swe-cli**

In `crates/swe-cli/Cargo.toml`, add to `[dependencies]`:

```toml
reqwest = { version = "0.12", features = ["json"] }
```

**Step 2: Create API client**

Create `crates/swe-cli/src/api_client.rs`:

```rust
//! HTTP client for the SWE API.

use serde::{de::DeserializeOwned, Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct ApiResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

pub struct ApiClient {
    base_url: String,
    client: reqwest::Client,
}

impl ApiClient {
    pub fn new(base_url: &str) -> Self {
        Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            client: reqwest::Client::new(),
        }
    }

    pub async fn get<T: DeserializeOwned>(&self, path: &str) -> anyhow::Result<ApiResponse<T>> {
        let resp = self
            .client
            .get(format!("{}{}", self.base_url, path))
            .send()
            .await?
            .json::<ApiResponse<T>>()
            .await?;
        Ok(resp)
    }

    pub async fn post<B: Serialize, T: DeserializeOwned>(
        &self,
        path: &str,
        body: &B,
    ) -> anyhow::Result<ApiResponse<T>> {
        let resp = self
            .client
            .post(format!("{}{}", self.base_url, path))
            .json(body)
            .send()
            .await?
            .json::<ApiResponse<T>>()
            .await?;
        Ok(resp)
    }

    pub async fn delete<T: DeserializeOwned>(&self, path: &str) -> anyhow::Result<ApiResponse<T>> {
        let resp = self
            .client
            .delete(format!("{}{}", self.base_url, path))
            .send()
            .await?
            .json::<ApiResponse<T>>()
            .await?;
        Ok(resp)
    }

    /// Check if the API is reachable.
    pub async fn health(&self) -> anyhow::Result<bool> {
        let resp = self.client.get(format!("{}/health", self.base_url)).send().await;
        Ok(resp.is_ok())
    }
}
```

**Step 3: Export from main.rs**

Add to the top of `crates/swe-cli/src/main.rs`:

```rust
mod api_client;
```

(The existing `mod commands` and `mod output` stay.)

**Step 4: Verify it compiles**

Run: `cargo check -p swe-cli`
Expected: compiles cleanly

**Step 5: Commit**

```bash
git add crates/swe-cli/Cargo.toml crates/swe-cli/src/api_client.rs crates/swe-cli/src/main.rs
git commit -m "feat(swe-cli): add HTTP API client module"
```

---

### Task 10: Wire CLI project commands to API

**Files:**
- Modify: `crates/swe-cli/src/commands/mod.rs` (pass ApiClient)
- Modify: `crates/swe-cli/src/commands/project.rs`
- Modify: `crates/swe-cli/src/commands/status.rs`
- Modify: `crates/swe-cli/src/main.rs`

**Step 1: Update `main.rs` to create ApiClient and pass it through**

In `crates/swe-cli/src/main.rs`, update to pass the API client through Cli:

```rust
mod api_client;
mod commands;
mod output;

use clap::Parser;
use commands::Cli;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();
    cli.execute().await
}
```

(This stays the same — the `api_url` is already on `Cli` and passed to subcommands.)

**Step 2: Update `commands/project.rs` to call the API**

```rust
//! Project management commands.

use clap::{Args, Subcommand};
use serde::Serialize;

use crate::api_client::ApiClient;

#[derive(Args)]
pub struct ProjectArgs {
    #[command(subcommand)]
    command: ProjectCommand,
}

#[derive(Subcommand)]
enum ProjectCommand {
    /// Create a new project
    Init {
        name: String,
        #[arg(long)]
        description: Option<String>,
        #[arg(long)]
        repo: Option<String>,
    },
    /// List all projects
    List,
    /// Get project status
    Status {
        name: String,
    },
    /// Archive a project
    Archive {
        name: String,
    },
}

#[derive(Serialize)]
struct CreateProjectBody {
    name: String,
    description: Option<String>,
    repo_url: Option<String>,
}

pub async fn execute(args: ProjectArgs, api_url: &str) -> anyhow::Result<()> {
    let client = ApiClient::new(api_url);

    match args.command {
        ProjectCommand::Init { name, description, repo } => {
            let body = CreateProjectBody {
                name: name.clone(),
                description,
                repo_url: repo,
            };
            let resp = client.post::<_, serde_json::Value>("/api/v1/projects", &body).await?;
            if resp.success {
                if let Some(data) = resp.data {
                    let id = data.get("id").and_then(|v| v.as_str()).unwrap_or("unknown");
                    println!("Created project: {} ({})", name, id);
                }
            } else {
                eprintln!("Error: {}", resp.error.unwrap_or_else(|| "Unknown error".into()));
            }
        }
        ProjectCommand::List => {
            let resp = client.get::<Vec<serde_json::Value>>("/api/v1/projects").await?;
            if resp.success {
                let projects = resp.data.unwrap_or_default();
                if projects.is_empty() {
                    println!("No projects found.");
                } else {
                    println!("{:<38} {:<25} {:<12} {:<10}", "ID", "NAME", "PHASE", "STATUS");
                    println!("{}", "-".repeat(85));
                    for p in &projects {
                        println!(
                            "{:<38} {:<25} {:<12} {:<10}",
                            p.get("id").and_then(|v| v.as_str()).unwrap_or("-"),
                            p.get("name").and_then(|v| v.as_str()).unwrap_or("-"),
                            p.get("phase").and_then(|v| v.as_str()).unwrap_or("-"),
                            p.get("status").and_then(|v| v.as_str()).unwrap_or("-"),
                        );
                    }
                }
            } else {
                eprintln!("Error: {}", resp.error.unwrap_or_else(|| "Unknown error".into()));
            }
        }
        ProjectCommand::Status { name } => {
            // Try as UUID first, otherwise search by name
            let resp = client.get::<serde_json::Value>(&format!("/api/v1/projects/{}/status", name)).await?;
            if resp.success {
                if let Some(data) = resp.data {
                    println!("{}", serde_json::to_string_pretty(&data)?);
                }
            } else {
                eprintln!("Error: {}", resp.error.unwrap_or_else(|| "Unknown error".into()));
            }
        }
        ProjectCommand::Archive { name } => {
            let resp = client.delete::<serde_json::Value>(&format!("/api/v1/projects/{}", name)).await?;
            if resp.success {
                println!("Archived project: {}", name);
            } else {
                eprintln!("Error: {}", resp.error.unwrap_or_else(|| "Unknown error".into()));
            }
        }
    }
    Ok(())
}
```

**Step 3: Update `commands/status.rs` to call the API health endpoint**

Read the current `status.rs` first and update the `execute` function to use `ApiClient`:

```rust
//! Status and doctor commands.

use crate::api_client::ApiClient;

pub async fn execute(api_url: &str) -> anyhow::Result<()> {
    let client = ApiClient::new(api_url);

    println!("SWE Platform Status\n");

    // Check API health
    match client.health().await {
        Ok(true) => println!("  API:      UP ({})", api_url),
        _ => println!("  API:      DOWN ({})", api_url),
    }

    // Check projects
    match client.get::<Vec<serde_json::Value>>("/api/v1/projects").await {
        Ok(resp) if resp.success => {
            let count = resp.data.map(|d| d.len()).unwrap_or(0);
            println!("  Projects: {}", count);
        }
        _ => println!("  Projects: unavailable"),
    }

    // Check agents
    match client.get::<Vec<serde_json::Value>>("/api/v1/agents").await {
        Ok(resp) if resp.success => {
            let count = resp.data.map(|d| d.len()).unwrap_or(0);
            println!("  Agents:   {}", count);
        }
        _ => println!("  Agents:   unavailable"),
    }

    Ok(())
}

pub async fn doctor() -> anyhow::Result<()> {
    println!("Checking dependencies...\n");

    // Check Docker
    let docker = std::process::Command::new("docker").arg("--version").output();
    match docker {
        Ok(out) if out.status.success() => {
            println!("  docker:       OK ({})", String::from_utf8_lossy(&out.stdout).trim());
        }
        _ => println!("  docker:       NOT FOUND"),
    }

    // Check Docker Compose
    let compose = std::process::Command::new("docker").args(["compose", "version"]).output();
    match compose {
        Ok(out) if out.status.success() => {
            println!("  compose:      OK ({})", String::from_utf8_lossy(&out.stdout).trim());
        }
        _ => println!("  compose:      NOT FOUND"),
    }

    // Check kubectl
    let kubectl = std::process::Command::new("kubectl").arg("version").args(["--client", "--short"]).output();
    match kubectl {
        Ok(out) if out.status.success() => {
            println!("  kubectl:      OK ({})", String::from_utf8_lossy(&out.stdout).trim());
        }
        _ => println!("  kubectl:      NOT FOUND (optional — needed for sandboxes)"),
    }

    Ok(())
}
```

**Step 4: Verify it compiles**

Run: `cargo check -p swe-cli`
Expected: compiles cleanly

**Step 5: Commit**

```bash
git add crates/swe-cli/src/
git commit -m "feat(swe-cli): wire project and status commands to API"
```

---

## Phase 4: Temporal SDK Integration

### Task 11: Switch swe-temporal to `temporalio-sdk`

**Files:**
- Modify: `Cargo.toml` (workspace deps — replace temporal stubs)
- Modify: `crates/swe-temporal/Cargo.toml`
- Modify: `crates/swe-temporal/src/main.rs`

**Step 1: Update workspace Cargo.toml**

Replace the temporal deps in `[workspace.dependencies]`:

```toml
# Temporal — prerelease Rust SDK
temporalio-sdk = "0.1.0-alpha.1"
temporalio-client = "0.1"
temporalio-sdk-core = "0.1"
temporalio-macros = "0.1"
```

Remove the old placeholder lines:

```toml
# Remove these:
temporal-sdk-core = "0.1"
temporal-client = "0.1"
```

**Step 2: Update swe-temporal Cargo.toml**

```toml
[package]
name = "swe-temporal"
version.workspace = true
edition.workspace = true
license.workspace = true
description = "Temporal workflows and activities for SWE platform"

[[bin]]
name = "swe-worker"
path = "src/main.rs"

[dependencies]
tracing-subscriber = { workspace = true }
swe-core = { workspace = true }
serde = { workspace = true }
serde_json = { workspace = true }
tokio = { workspace = true }
async-trait = { workspace = true }
thiserror = { workspace = true }
uuid = { workspace = true }
chrono = { workspace = true }
tracing = { workspace = true }
reqwest = { version = "0.12", features = ["json"] }
sqlx = { workspace = true }

# Temporal Rust SDK (prerelease)
temporalio-sdk = { workspace = true }
temporalio-client = { workspace = true }
temporalio-sdk-core = { workspace = true }
temporalio-macros = { workspace = true }
```

**Step 3: Update `main.rs` with real Temporal worker**

```rust
use temporalio_client::{Client, ClientOptions, Connection, ConnectionOptions};
use temporalio_sdk::{Worker, WorkerOptions};
use temporalio_sdk_core::{CoreRuntime, RuntimeOptions, Url};
use tracing_subscriber::EnvFilter;
use std::str::FromStr;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .init();

    let temporal_address =
        std::env::var("TEMPORAL_ADDRESS").unwrap_or_else(|_| "http://localhost:7233".to_string());
    let task_queue =
        std::env::var("TEMPORAL_TASK_QUEUE").unwrap_or_else(|_| "swe-workers".to_string());

    tracing::info!(
        "SWE Worker starting, connecting to Temporal at {}",
        temporal_address
    );

    let runtime = CoreRuntime::new_assume_tokio(RuntimeOptions::builder().build()?)?;

    let connection = Connection::connect(
        ConnectionOptions::new(Url::from_str(&temporal_address)?).build(),
    )
    .await?;
    let client = Client::new(connection, ClientOptions::new("default").build());

    tracing::info!("Connected to Temporal, registering on queue: {}", task_queue);

    let worker_options = WorkerOptions::new(&task_queue)
        // TODO: Register workflows and activities as they are implemented
        // .register_workflow::<ProjectWorkflow>()
        // .register_activities(SweActivities::new())
        .build();

    tracing::info!("SWE Worker running");
    Worker::new(&runtime, client, worker_options)?.run().await?;

    Ok(())
}
```

**Step 4: Try to compile**

Run: `cargo check -p swe-temporal`

This step may fail if the `temporalio-sdk` crate has breaking API differences from the README examples. If it fails, read the error messages and adapt. The key thing is getting the dependency resolved and the worker connecting to Temporal.

If the SDK doesn't compile cleanly with these exact APIs (it's prerelease), fall back to keeping the stub worker and just confirming the dependency resolves:

```rust
// Fallback main.rs if SDK APIs don't match
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .init();

    let temporal_address =
        std::env::var("TEMPORAL_ADDRESS").unwrap_or_else(|_| "http://localhost:7233".to_string());

    tracing::info!("SWE Worker starting (Temporal SDK 0.1.0-alpha.1)");
    tracing::info!("Temporal address: {}", temporal_address);

    // SDK is available but APIs are evolving — keeping stub mode until stabilized
    // When ready, use: temporalio_sdk::Worker, temporalio_client::Client, etc.
    tracing::info!("SWE Worker running (SDK integration in progress)");

    tokio::signal::ctrl_c().await?;
    tracing::info!("SWE Worker shutting down");

    Ok(())
}
```

**Step 5: Commit**

```bash
git add Cargo.toml crates/swe-temporal/Cargo.toml crates/swe-temporal/src/main.rs
git commit -m "feat(swe-temporal): integrate temporalio-sdk dependency"
```

---

## Phase 5: Web UI → API Integration

### Task 12: Connect Web UI dashboard to live API data

**Files:**
- Modify: `web/src/app/(app)/dashboard/page.tsx`
- Modify: `web/src/app/(app)/projects/page.tsx`

**Step 1: Read current dashboard page to understand the mock data structure**

Read: `web/src/app/(app)/dashboard/page.tsx`

**Step 2: Update dashboard to fetch from API**

Replace the mock data with `fetch()` calls using the existing `web/src/lib/api.ts` client. The page should:

- Call `listProjects()` on mount (server component fetch or client-side)
- Call `listAgents()` for agent counts
- Show real project data or a helpful empty state
- Handle loading and error states

Since this is a Next.js App Router server component, use direct `fetch` calls:

```tsx
import { listProjects } from "@/lib/api";
import { checkHealth } from "@/lib/api";

export default async function DashboardPage() {
  const [projectsResp, health] = await Promise.all([
    listProjects(),
    checkHealth(),
  ]);

  const projects = projectsResp.success ? projectsResp.data ?? [] : [];
  const isApiUp = health !== null;

  return (
    // ... render with real data, show empty state if no projects
  );
}
```

The exact JSX depends on the current layout. Read the file first, then update only the data-fetching parts while keeping the existing UI structure.

**Step 3: Update projects page similarly**

Same pattern — replace mock data with `listProjects()` call.

**Step 4: Test in browser**

Run: `cd web && bun run dev`
Open: `http://localhost:3000/dashboard`
Expected: page loads, shows real data from API (or empty state if no projects exist).

**Step 5: Commit**

```bash
git add web/src/app/
git commit -m "feat(web): connect dashboard and projects pages to live API"
```

---

### Task 13: Connect project detail and agent pages to API

**Files:**
- Modify: `web/src/app/(app)/projects/[id]/page.tsx`
- Modify: `web/src/app/(app)/projects/[id]/agents/[agentId]/page.tsx`

**Step 1: Update project detail page**

Read the current file, then update to use `getProject(id)` and `listAgents(id)` and `listWorkItems(id)` from `@/lib/api`.

**Step 2: Update agent detail page**

Update to use `getAgent(agentId)` from `@/lib/api`.

**Step 3: Test**

Create a project via curl, then navigate to its detail page in the browser.

**Step 4: Commit**

```bash
git add web/src/app/
git commit -m "feat(web): connect project detail and agent pages to live API"
```

---

## Phase 6: Verification & Cleanup

### Task 14: End-to-end smoke test

This is a manual verification. No code.

**Step 1: Start fresh**

```bash
docker compose down -v
docker compose up -d --build
```

**Step 2: Wait for services, then run migration**

```bash
docker compose logs -f swe-migrate  # should complete
docker compose logs swe-api         # should show "listening on"
```

**Step 3: CLI test**

```bash
cargo run -p swe-cli -- status
cargo run -p swe-cli -- project init "smoke-test" --description "End-to-end test"
cargo run -p swe-cli -- project list
```

**Step 4: API test**

```bash
curl -s http://localhost:8080/api/v1/projects | python3 -m json.tool
```

**Step 5: Web UI test**

Open `http://localhost:3000/dashboard` — should show the project created via CLI.

**Step 6: Verify Temporal connection**

Open `http://localhost:8233` (Temporal UI) — worker should be connected to `swe-workers` queue.

---

### Task 15: Update CLAUDE.md with new information

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add migration info to CLAUDE.md**

Add under `## Build & Test Commands`:

```markdown
### Database
```bash
psql postgres://swe:swe@localhost:5432/swe -f migrations/001_initial_schema.sql  # Run migrations manually
docker compose up swe-migrate                                                     # Run migrations via Docker
```
```

**Step 2: Update architecture section**

Note that `swe-core` now has a `db` module with query functions, and `swe-api` uses `AppState` with a DB pool.

**Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with database and migration info"
```

---

## Summary

| Phase | Tasks | What it delivers |
|-------|-------|-----------------|
| **1. Database** | Tasks 1-3 | SQLx pool, migrations, query functions for all 4 domain types |
| **2. API Wiring** | Tasks 4-8 | All REST handlers backed by Postgres, integration tested |
| **3. CLI → API** | Tasks 9-10 | CLI commands call the real API via reqwest |
| **4. Temporal** | Task 11 | `temporalio-sdk` dependency integrated, worker connects to Temporal |
| **5. Web UI** | Tasks 12-13 | Dashboard and detail pages show live data |
| **6. Cleanup** | Tasks 14-15 | End-to-end smoke test, docs updated |

**Not in scope for this plan (follow-up work):**
- Temporal workflow definitions (project/agent/orchestrator workflows)
- BetterAuth integration
- WebSocket live streaming with Redis pub/sub
- gRPC proto compilation
- K8s sandbox testing
