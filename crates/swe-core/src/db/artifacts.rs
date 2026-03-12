//! Database queries for artifacts.

use chrono::{DateTime, Utc};
use serde_json::Value;
use sqlx::FromRow;
use uuid::Uuid;

use super::Pool;
use crate::types::{ApprovalStatus, Artifact, ArtifactType};

/// Database row for the artifacts table.
#[derive(Debug, FromRow)]
pub struct ArtifactRow {
    pub id: Uuid,
    pub name: String,
    pub artifact_type: String,
    pub description: Option<String>,
    pub project_id: Uuid,
    pub work_item_id: Option<Uuid>,
    pub created_by_agent_id: Uuid,
    pub content: Option<String>,
    pub storage_url: Option<String>,
    pub mime_type: String,
    pub size_bytes: i64,
    pub approval_status: String,
    pub approved_by: Option<String>,
    pub approval_comment: Option<String>,
    pub version: i32,
    pub previous_version_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl ArtifactRow {
    /// Convert a database row into the domain Artifact type.
    pub fn into_artifact(self) -> Artifact {
        let artifact_type: ArtifactType =
            serde_json::from_value(Value::String(self.artifact_type)).unwrap_or_default();
        let approval_status: ApprovalStatus =
            serde_json::from_value(Value::String(self.approval_status)).unwrap_or_default();

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

/// List artifacts, optionally filtered by project ID.
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

/// Get an artifact by ID.
pub async fn get(pool: &Pool, id: Uuid) -> crate::Result<Artifact> {
    let row = sqlx::query_as::<_, ArtifactRow>("SELECT * FROM artifacts WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| crate::Error::Internal(format!("Failed to get artifact: {e}")))?
        .ok_or_else(|| crate::Error::ArtifactNotFound(id.to_string()))?;

    Ok(row.into_artifact())
}

/// Insert a new artifact.
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
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)",
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

/// Update approval status for an artifact.
pub async fn update_approval(
    pool: &Pool,
    id: Uuid,
    approved: bool,
    by: &str,
    comment: Option<&str>,
) -> crate::Result<Artifact> {
    let status = if approved {
        ApprovalStatus::Approved
    } else {
        ApprovalStatus::Rejected
    };
    let status_str = serde_json::to_value(&status)
        .unwrap_or_default()
        .as_str()
        .unwrap_or("pending")
        .to_string();

    sqlx::query(
        "UPDATE artifacts SET approval_status = $1, approved_by = $2, approval_comment = $3, updated_at = $4 WHERE id = $5",
    )
    .bind(&status_str)
    .bind(by)
    .bind(comment)
    .bind(Utc::now())
    .bind(id)
    .execute(pool)
    .await
    .map_err(|e| crate::Error::Internal(format!("Failed to update artifact approval: {e}")))?;

    get(pool, id).await
}
