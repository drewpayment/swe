//! Work item domain type.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Priority level for work items.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Priority {
    /// Low priority - can wait
    Low,
    /// Normal priority - standard work
    Normal,
    /// High priority - should be done soon
    High,
    /// Critical priority - needs immediate attention
    Critical,
}

impl Default for Priority {
    fn default() -> Self {
        Self::Normal
    }
}

/// Status of a work item.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkItemStatus {
    /// Work item is created but not yet assigned
    Pending,
    /// Work item is assigned to an agent
    Assigned,
    /// Work is in progress
    InProgress,
    /// Work is waiting for review
    InReview,
    /// Work is blocked on something
    Blocked,
    /// Work is complete
    Complete,
    /// Work was cancelled
    Cancelled,
}

impl Default for WorkItemStatus {
    fn default() -> Self {
        Self::Pending
    }
}

/// A work item represents a discrete unit of work to be done.
///
/// Work items are assigned to agents and tracked through completion.
/// They can produce artifacts and be part of larger projects.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkItem {
    /// Unique identifier
    pub id: Uuid,
    /// Title/summary of the work
    pub title: String,
    /// Detailed description
    pub description: Option<String>,
    /// Current status
    pub status: WorkItemStatus,
    /// Priority level
    pub priority: Priority,
    /// ID of the project this belongs to
    pub project_id: Uuid,
    /// ID of the agent assigned to this work
    pub assigned_agent_id: Option<Uuid>,
    /// IDs of artifacts produced by this work
    pub artifact_ids: Vec<Uuid>,
    /// IDs of work items this depends on
    pub depends_on: Vec<Uuid>,
    /// IDs of work items that depend on this
    pub blocks: Vec<Uuid>,
    /// Git branch name if applicable
    pub branch_name: Option<String>,
    /// Pull request URL if applicable
    pub pr_url: Option<String>,
    /// When the work was created
    pub created_at: DateTime<Utc>,
    /// When the work was last updated
    pub updated_at: DateTime<Utc>,
    /// When the work was started
    pub started_at: Option<DateTime<Utc>>,
    /// When the work was completed
    pub completed_at: Option<DateTime<Utc>>,
}

impl WorkItem {
    /// Create a new work item.
    pub fn new(title: impl Into<String>, project_id: Uuid) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4(),
            title: title.into(),
            description: None,
            status: WorkItemStatus::default(),
            priority: Priority::default(),
            project_id,
            assigned_agent_id: None,
            artifact_ids: Vec::new(),
            depends_on: Vec::new(),
            blocks: Vec::new(),
            branch_name: None,
            pr_url: None,
            created_at: now,
            updated_at: now,
            started_at: None,
            completed_at: None,
        }
    }

    /// Set the description.
    pub fn with_description(mut self, description: impl Into<String>) -> Self {
        self.description = Some(description.into());
        self
    }

    /// Set the priority.
    pub fn with_priority(mut self, priority: Priority) -> Self {
        self.priority = priority;
        self
    }

    /// Check if this work item is blocked by dependencies.
    pub fn is_blocked(&self) -> bool {
        self.status == WorkItemStatus::Blocked || !self.depends_on.is_empty()
    }

    /// Check if this work item is complete.
    pub fn is_complete(&self) -> bool {
        self.status == WorkItemStatus::Complete
    }

    /// Mark the work as started.
    pub fn start(&mut self) {
        self.status = WorkItemStatus::InProgress;
        self.started_at = Some(Utc::now());
        self.updated_at = Utc::now();
    }

    /// Mark the work as complete.
    pub fn complete(&mut self) {
        self.status = WorkItemStatus::Complete;
        self.completed_at = Some(Utc::now());
        self.updated_at = Utc::now();
    }
}
