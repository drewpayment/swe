//! Database queries for work items.

use chrono::{DateTime, Utc};
use serde_json::Value;
use sqlx::FromRow;
use uuid::Uuid;

use super::Pool;
use crate::types::{Priority, WorkItem, WorkItemStatus};

/// Database row for the work_items table.
#[derive(Debug, FromRow)]
pub struct WorkItemRow {
    pub id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub priority: String,
    pub project_id: Uuid,
    pub assigned_agent_id: Option<Uuid>,
    pub depends_on: Value,
    pub blocks: Value,
    pub branch_name: Option<String>,
    pub pr_url: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
}

impl WorkItemRow {
    /// Convert a database row into the domain WorkItem type.
    pub fn into_work_item(self) -> WorkItem {
        let status: WorkItemStatus =
            serde_json::from_value(Value::String(self.status)).unwrap_or_default();
        let priority: Priority =
            serde_json::from_value(Value::String(self.priority)).unwrap_or_default();
        let depends_on: Vec<Uuid> =
            serde_json::from_value(self.depends_on).unwrap_or_default();
        let blocks: Vec<Uuid> =
            serde_json::from_value(self.blocks).unwrap_or_default();

        WorkItem {
            id: self.id,
            title: self.title,
            description: self.description,
            status,
            priority,
            project_id: self.project_id,
            assigned_agent_id: self.assigned_agent_id,
            artifact_ids: Vec::new(),
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

/// List work items, optionally filtered by project ID.
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

/// Get a work item by ID.
pub async fn get(pool: &Pool, id: Uuid) -> crate::Result<WorkItem> {
    let row = sqlx::query_as::<_, WorkItemRow>("SELECT * FROM work_items WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| crate::Error::Internal(format!("Failed to get work item: {e}")))?
        .ok_or_else(|| crate::Error::WorkItemNotFound(id.to_string()))?;

    Ok(row.into_work_item())
}

/// Insert a new work item.
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
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)",
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
