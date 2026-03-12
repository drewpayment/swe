//! Database queries for agents.

use chrono::{DateTime, Utc};
use serde_json::Value;
use sqlx::FromRow;
use uuid::Uuid;

use super::Pool;
use crate::roles::AgentRole;
use crate::types::{Agent, AgentStatus};

/// Database row for the agents table.
#[derive(Debug, FromRow)]
pub struct AgentRow {
    pub id: Uuid,
    pub name: String,
    pub role: String,
    pub status: String,
    pub project_id: Option<Uuid>,
    pub current_work_item_id: Option<Uuid>,
    pub context: Option<String>,
    pub workflow_id: Option<String>,
    pub sandbox_id: Option<String>,
    pub tokens_consumed: i64,
    pub last_heartbeat: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl AgentRow {
    /// Convert a database row into the domain Agent type.
    pub fn into_agent(self) -> Agent {
        let role: AgentRole =
            serde_json::from_value(Value::String(self.role)).unwrap_or_default();
        let status: AgentStatus =
            serde_json::from_value(Value::String(self.status)).unwrap_or_default();

        Agent {
            id: self.id,
            name: self.name,
            role,
            status,
            project_id: self.project_id,
            current_work_item_id: self.current_work_item_id,
            conversation_history: Vec::new(),
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

/// List agents, optionally filtered by project ID.
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

/// Get an agent by ID.
pub async fn get(pool: &Pool, id: Uuid) -> crate::Result<Agent> {
    let row = sqlx::query_as::<_, AgentRow>("SELECT * FROM agents WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| crate::Error::Internal(format!("Failed to get agent: {e}")))?
        .ok_or_else(|| crate::Error::AgentNotFound(id.to_string()))?;

    Ok(row.into_agent())
}

/// Insert a new agent.
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
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)",
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

/// Update the status of an agent.
pub async fn update_status(pool: &Pool, id: Uuid, status: AgentStatus) -> crate::Result<()> {
    let status_str = serde_json::to_value(&status)
        .unwrap_or_default()
        .as_str()
        .unwrap_or("initializing")
        .to_string();

    sqlx::query("UPDATE agents SET status = $1, updated_at = $2 WHERE id = $3")
        .bind(&status_str)
        .bind(Utc::now())
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| crate::Error::Internal(format!("Failed to update agent status: {e}")))?;

    Ok(())
}
