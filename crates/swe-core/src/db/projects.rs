//! Database queries for projects.

use chrono::{DateTime, Utc};
use serde_json::Value;
use sqlx::FromRow;
use uuid::Uuid;

use super::Pool;
use crate::types::{Project, ProjectPhase, ProjectStatus};

/// Database row for the projects table.
#[derive(Debug, FromRow)]
pub struct ProjectRow {
    pub id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub phase: String,
    pub status: String,
    pub repo_url: Option<String>,
    pub decisions: Value,
    pub workflow_id: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl ProjectRow {
    /// Convert a database row into the domain Project type.
    pub fn into_project(self) -> Project {
        let phase: ProjectPhase =
            serde_json::from_value(Value::String(self.phase)).unwrap_or_default();
        let status: ProjectStatus =
            serde_json::from_value(Value::String(self.status)).unwrap_or_default();
        let decisions: Vec<String> =
            serde_json::from_value(self.decisions).unwrap_or_default();

        Project {
            id: self.id,
            name: self.name,
            description: self.description,
            phase,
            status,
            repo_url: self.repo_url,
            active_agent_ids: Vec::new(),
            artifact_ids: Vec::new(),
            work_item_ids: Vec::new(),
            decisions,
            workflow_id: self.workflow_id,
            created_at: self.created_at,
            updated_at: self.updated_at,
        }
    }
}

/// List all projects ordered by creation date (newest first).
pub async fn list(pool: &Pool) -> crate::Result<Vec<Project>> {
    let rows = sqlx::query_as::<_, ProjectRow>("SELECT * FROM projects ORDER BY created_at DESC")
        .fetch_all(pool)
        .await
        .map_err(|e| crate::Error::Internal(format!("Failed to list projects: {e}")))?;

    Ok(rows.into_iter().map(|r| r.into_project()).collect())
}

/// Get a project by ID.
pub async fn get(pool: &Pool, id: Uuid) -> crate::Result<Project> {
    let row = sqlx::query_as::<_, ProjectRow>("SELECT * FROM projects WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| crate::Error::Internal(format!("Failed to get project: {e}")))?
        .ok_or_else(|| crate::Error::ProjectNotFound(id.to_string()))?;

    Ok(row.into_project())
}

/// Insert a new project.
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
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
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

/// Update the status of a project.
pub async fn update_status(pool: &Pool, id: Uuid, status: ProjectStatus) -> crate::Result<()> {
    let status_str = serde_json::to_value(&status)
        .unwrap_or_default()
        .as_str()
        .unwrap_or("active")
        .to_string();

    sqlx::query("UPDATE projects SET status = $1, updated_at = $2 WHERE id = $3")
        .bind(&status_str)
        .bind(Utc::now())
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| crate::Error::Internal(format!("Failed to update project status: {e}")))?;

    Ok(())
}

/// Update the phase of a project.
pub async fn update_phase(pool: &Pool, id: Uuid, phase: ProjectPhase) -> crate::Result<()> {
    let phase_str = serde_json::to_value(&phase)
        .unwrap_or_default()
        .as_str()
        .unwrap_or("planning")
        .to_string();

    sqlx::query("UPDATE projects SET phase = $1, updated_at = $2 WHERE id = $3")
        .bind(&phase_str)
        .bind(Utc::now())
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| crate::Error::Internal(format!("Failed to update project phase: {e}")))?;

    Ok(())
}

/// Archive a project by setting status to Cancelled and phase to Archived.
pub async fn archive(pool: &Pool, id: Uuid) -> crate::Result<Project> {
    update_status(pool, id, ProjectStatus::Cancelled).await?;
    update_phase(pool, id, ProjectPhase::Archived).await?;
    get(pool, id).await
}
