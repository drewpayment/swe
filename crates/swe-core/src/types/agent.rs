//! Agent domain type.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::roles::AgentRole;

/// Status of an agent.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentStatus {
    /// Agent is initializing
    Initializing,
    /// Agent is idle, waiting for work
    Idle,
    /// Agent is actively working on a task
    Active,
    /// Agent is waiting for human input
    WaitingForHuman,
    /// Agent is waiting for another agent
    WaitingForAgent,
    /// Agent has completed its work
    Complete,
    /// Agent encountered an error
    Error,
    /// Agent has been terminated
    Terminated,
}

impl Default for AgentStatus {
    fn default() -> Self {
        Self::Initializing
    }
}

/// Represents an AI agent in the SWE platform.
///
/// Agents are specialized workers that perform specific roles in the software
/// engineering lifecycle. Each agent runs as a Temporal workflow and can
/// communicate with other agents and humans.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Agent {
    /// Unique identifier for the agent
    pub id: Uuid,
    /// Human-readable name (e.g., "architect-1", "coder-main")
    pub name: String,
    /// The role this agent performs
    pub role: AgentRole,
    /// Current status
    pub status: AgentStatus,
    /// ID of the project this agent belongs to (None for global orchestrator)
    pub project_id: Option<Uuid>,
    /// ID of the current work item being processed
    pub current_work_item_id: Option<Uuid>,
    /// Conversation history (serialized messages)
    pub conversation_history: Vec<String>,
    /// Context/memory for the agent
    pub context: Option<String>,
    /// When the agent was created
    pub created_at: DateTime<Utc>,
    /// When the agent was last updated
    pub updated_at: DateTime<Utc>,
    /// Last heartbeat timestamp
    pub last_heartbeat: Option<DateTime<Utc>>,
    /// Temporal workflow ID for this agent
    pub workflow_id: Option<String>,
    /// ID of the sandbox container (if running in one)
    pub sandbox_id: Option<String>,
    /// Total tokens consumed by this agent
    pub tokens_consumed: u64,
}

impl Agent {
    /// Create a new agent with the given name and role.
    pub fn new(name: impl Into<String>, role: AgentRole) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4(),
            name: name.into(),
            role,
            status: AgentStatus::default(),
            project_id: None,
            current_work_item_id: None,
            conversation_history: Vec::new(),
            context: None,
            created_at: now,
            updated_at: now,
            last_heartbeat: None,
            workflow_id: None,
            sandbox_id: None,
            tokens_consumed: 0,
        }
    }

    /// Assign this agent to a project.
    pub fn with_project(mut self, project_id: Uuid) -> Self {
        self.project_id = Some(project_id);
        self
    }

    /// Check if the agent is currently working.
    pub fn is_working(&self) -> bool {
        matches!(
            self.status,
            AgentStatus::Active | AgentStatus::WaitingForHuman | AgentStatus::WaitingForAgent
        )
    }

    /// Check if the agent is healthy (received heartbeat recently).
    pub fn is_healthy(&self) -> bool {
        if let Some(last_heartbeat) = self.last_heartbeat {
            let elapsed = Utc::now() - last_heartbeat;
            elapsed.num_seconds() < 60 // Healthy if heartbeat within last minute
        } else {
            // No heartbeat yet, check if recently created
            let elapsed = Utc::now() - self.created_at;
            elapsed.num_seconds() < 30
        }
    }

    /// Record a heartbeat.
    pub fn heartbeat(&mut self) {
        self.last_heartbeat = Some(Utc::now());
        self.updated_at = Utc::now();
    }

    /// Check if this agent requires a sandbox for execution.
    pub fn requires_sandbox(&self) -> bool {
        self.role.requires_sandbox()
    }
}
