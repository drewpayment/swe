//! Temporal workflow definitions.
//!
//! Each workflow represents a long-running, durable process in the SWE platform.

mod agent;
mod orchestrator;
mod project;
mod sandbox;

pub use agent::AgentWorkflow;
pub use orchestrator::OrchestratorWorkflow;
pub use project::ProjectWorkflow;
pub use sandbox::SandboxWorkflow;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Common workflow state that all workflows share.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowState {
    /// Unique workflow ID
    pub workflow_id: String,
    /// Current status
    pub status: WorkflowStatus,
    /// When the workflow was started
    pub started_at: chrono::DateTime<chrono::Utc>,
    /// Last activity timestamp
    pub last_activity: chrono::DateTime<chrono::Utc>,
}

/// Status of a workflow.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkflowStatus {
    /// Workflow is running
    Running,
    /// Workflow is paused
    Paused,
    /// Workflow completed successfully
    Completed,
    /// Workflow failed
    Failed,
    /// Workflow was cancelled
    Cancelled,
}

impl WorkflowState {
    /// Create a new workflow state.
    pub fn new(workflow_id: impl Into<String>) -> Self {
        let now = chrono::Utc::now();
        Self {
            workflow_id: workflow_id.into(),
            status: WorkflowStatus::Running,
            started_at: now,
            last_activity: now,
        }
    }

    /// Generate a new workflow ID.
    pub fn generate_id(prefix: &str) -> String {
        format!("{}-{}", prefix, Uuid::new_v4())
    }
}

/// Trait for all SWE workflows.
///
/// Note: This is a stub trait. When temporal-sdk-core stabilizes,
/// this will be replaced with actual Temporal workflow implementations.
#[async_trait::async_trait]
pub trait SweWorkflow: Send + Sync {
    /// The input type for this workflow.
    type Input: Send;
    /// The output type for this workflow.
    type Output: Send;

    /// Execute the workflow.
    async fn execute(&self, input: Self::Input) -> Result<Self::Output, swe_core::Error>;

    /// Handle a signal sent to this workflow.
    async fn handle_signal(&mut self, signal: &str, payload: serde_json::Value)
        -> Result<(), swe_core::Error>;

    /// Handle a query sent to this workflow.
    async fn handle_query(
        &self,
        query: &str,
        args: serde_json::Value,
    ) -> Result<serde_json::Value, swe_core::Error>;
}
