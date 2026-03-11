//! Signal and query definitions for Temporal workflows.
//!
//! Signals allow external communication with running workflows.
//! Queries allow reading workflow state without modifying it.

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use swe_core::{AgentRole, ProjectPhase};

/// Signals that can be sent to project workflows.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ProjectSignal {
    /// Advance to a new phase
    AdvancePhase {
        phase: ProjectPhase,
        reason: String,
    },
    /// Human input received
    HumanInput {
        interaction_id: Uuid,
        response: String,
    },
    /// Assign work to the project
    AssignWork {
        title: String,
        description: Option<String>,
    },
    /// Abort the project
    Abort {
        reason: String,
    },
    /// Pause the project
    Pause,
    /// Resume the project
    Resume,
}

/// Queries that can be sent to project workflows.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ProjectQuery {
    /// Get current status
    Status,
    /// Get timeline/history
    Timeline,
    /// Get decisions made
    Decisions,
    /// Get active agents
    ActiveAgents,
    /// Get artifacts
    Artifacts,
}

/// Signals that can be sent to agent workflows.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AgentSignal {
    /// Assign work to the agent
    AssignWork {
        work_item_id: Uuid,
    },
    /// Send a message to the agent
    Message {
        from: String,
        content: String,
    },
    /// Cancel the agent's current work
    Cancel {
        reason: String,
    },
    /// Request a checkpoint
    Checkpoint,
    /// Heartbeat request
    Heartbeat,
}

/// Queries that can be sent to agent workflows.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AgentQuery {
    /// Get current status
    Status,
    /// Get current work
    CurrentWork,
    /// Get health status
    Health,
    /// Get inbox
    Inbox,
    /// Get conversation history
    ConversationHistory,
}

/// Signals for orchestrator-specific operations.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum OrchestratorSignal {
    /// Spawn a new agent
    SpawnAgent {
        role: AgentRole,
        context: Option<String>,
    },
    /// Human response to an interaction
    HumanResponse {
        interaction_id: Uuid,
        response: String,
    },
    /// Route message to an agent
    RouteMessage {
        agent_id: Uuid,
        content: String,
    },
}

/// Queries for orchestrator-specific information.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum OrchestratorQuery {
    /// Get spawned agents
    SpawnedAgents,
    /// Get pending human interactions
    PendingInteractions,
    /// Get work breakdown
    WorkBreakdown,
}

/// Signals for sandbox workflows.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SandboxSignal {
    /// Terminate the sandbox
    Terminate,
    /// Update resource usage metrics
    ResourceUpdate {
        cpu_millicores: u64,
        memory_bytes: u64,
    },
    /// Execute a command
    Execute {
        command: Vec<String>,
    },
}

/// Queries for sandbox workflows.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SandboxQuery {
    /// Get status
    Status,
    /// Get resource usage
    Resources,
    /// Get logs
    Logs {
        tail_lines: Option<u32>,
    },
}

/// Helper trait for converting signals to JSON.
pub trait SignalPayload: Serialize {
    /// Get the signal type name.
    fn signal_type(&self) -> &'static str;
    
    /// Convert to JSON value.
    fn to_payload(&self) -> serde_json::Value {
        serde_json::to_value(self).expect("Signal serialization should not fail")
    }
}

impl SignalPayload for ProjectSignal {
    fn signal_type(&self) -> &'static str {
        match self {
            Self::AdvancePhase { .. } => "advance_phase",
            Self::HumanInput { .. } => "human_input",
            Self::AssignWork { .. } => "assign_work",
            Self::Abort { .. } => "abort",
            Self::Pause => "pause",
            Self::Resume => "resume",
        }
    }
}

impl SignalPayload for AgentSignal {
    fn signal_type(&self) -> &'static str {
        match self {
            Self::AssignWork { .. } => "assign_work",
            Self::Message { .. } => "message",
            Self::Cancel { .. } => "cancel",
            Self::Checkpoint => "checkpoint",
            Self::Heartbeat => "heartbeat",
        }
    }
}

impl SignalPayload for OrchestratorSignal {
    fn signal_type(&self) -> &'static str {
        match self {
            Self::SpawnAgent { .. } => "spawn_agent",
            Self::HumanResponse { .. } => "human_response",
            Self::RouteMessage { .. } => "route_message",
        }
    }
}

impl SignalPayload for SandboxSignal {
    fn signal_type(&self) -> &'static str {
        match self {
            Self::Terminate => "terminate",
            Self::ResourceUpdate { .. } => "resource_update",
            Self::Execute { .. } => "execute",
        }
    }
}
