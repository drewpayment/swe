//! Project domain type.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Represents the current phase of a project.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProjectPhase {
    /// Initial phase - gathering requirements and planning
    Planning,
    /// Design phase - architecture and technical design
    Designing,
    /// Implementation phase - coding and building
    Building,
    /// Testing phase - QA and validation
    Testing,
    /// Deployment phase - releasing to production
    Deploying,
    /// Project completed successfully
    Complete,
    /// Project archived or cancelled
    Archived,
}

impl Default for ProjectPhase {
    fn default() -> Self {
        Self::Planning
    }
}

/// Represents the status of a project.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProjectStatus {
    /// Project is actively being worked on
    Active,
    /// Project is paused
    Paused,
    /// Project is complete
    Complete,
    /// Project was cancelled
    Cancelled,
}

impl Default for ProjectStatus {
    fn default() -> Self {
        Self::Active
    }
}

/// A project represents a unit of work that agents collaborate on.
///
/// Projects have a lifecycle (phases), contain work items, and produce artifacts.
/// Each project has its own orchestrator agent that coordinates specialist agents.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    /// Unique identifier for the project
    pub id: Uuid,
    /// Human-readable name
    pub name: String,
    /// Optional description of the project
    pub description: Option<String>,
    /// Current phase of the project
    pub phase: ProjectPhase,
    /// Current status
    pub status: ProjectStatus,
    /// Git repository URL if associated with code
    pub repo_url: Option<String>,
    /// IDs of active agents working on this project
    pub active_agent_ids: Vec<Uuid>,
    /// IDs of artifacts produced by this project
    pub artifact_ids: Vec<Uuid>,
    /// IDs of work items in this project
    pub work_item_ids: Vec<Uuid>,
    /// Key decisions made during the project
    pub decisions: Vec<String>,
    /// When the project was created
    pub created_at: DateTime<Utc>,
    /// When the project was last updated
    pub updated_at: DateTime<Utc>,
    /// Temporal workflow ID for this project
    pub workflow_id: Option<String>,
}

impl Project {
    /// Create a new project with the given name.
    pub fn new(name: impl Into<String>) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4(),
            name: name.into(),
            description: None,
            phase: ProjectPhase::default(),
            status: ProjectStatus::default(),
            repo_url: None,
            active_agent_ids: Vec::new(),
            artifact_ids: Vec::new(),
            work_item_ids: Vec::new(),
            decisions: Vec::new(),
            created_at: now,
            updated_at: now,
            workflow_id: None,
        }
    }

    /// Set the project description.
    pub fn with_description(mut self, description: impl Into<String>) -> Self {
        self.description = Some(description.into());
        self
    }

    /// Set the repository URL.
    pub fn with_repo(mut self, url: impl Into<String>) -> Self {
        self.repo_url = Some(url.into());
        self
    }

    /// Check if the project is active.
    pub fn is_active(&self) -> bool {
        self.status == ProjectStatus::Active
    }

    /// Check if the project is complete.
    pub fn is_complete(&self) -> bool {
        self.status == ProjectStatus::Complete || self.phase == ProjectPhase::Complete
    }
}
