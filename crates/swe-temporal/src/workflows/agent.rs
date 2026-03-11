//! Agent workflow definition.
//!
//! The agent workflow manages an individual agent's lifecycle:
//! - Initialization with role-specific configuration
//! - Work assignment and execution
//! - Communication with other agents and humans
//! - Health monitoring and checkpointing

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use swe_core::{Agent, AgentRole, AgentStatus};

use super::{SweWorkflow, WorkflowState, WorkflowStatus};

/// Input for starting an agent workflow.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentWorkflowInput {
    /// Agent ID
    pub agent_id: Uuid,
    /// Name for the agent
    pub name: String,
    /// Role of the agent
    pub role: AgentRole,
    /// Project ID (None for global orchestrator)
    pub project_id: Option<Uuid>,
    /// Initial context/instructions
    pub initial_context: Option<String>,
    /// Work item ID to start with (if any)
    pub initial_work_item_id: Option<Uuid>,
}

/// Output from a completed agent workflow.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentWorkflowOutput {
    /// The final agent state
    pub agent: Agent,
    /// IDs of artifacts produced
    pub artifact_ids: Vec<Uuid>,
    /// Final message/summary
    pub summary: String,
}

/// Internal state of the agent workflow.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentWorkflowState {
    /// Common workflow state
    pub workflow: WorkflowState,
    /// The agent being managed
    pub agent: Agent,
    /// Current execution phase
    pub phase: AgentPhase,
    /// Message inbox
    pub inbox: Vec<AgentMessage>,
    /// Checkpoint data for recovery
    pub checkpoint: Option<AgentCheckpoint>,
}

/// Execution phase of an agent.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentPhase {
    /// Loading configuration and context
    Initialize,
    /// Generating execution plan
    Plan,
    /// Executing work (tool calls, sandbox work)
    Execute,
    /// Self-review or peer review
    Review,
    /// Producing and delivering artifacts
    Deliver,
    /// Saving state and cleaning up
    Teardown,
}

/// A message sent to an agent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentMessage {
    /// Unique message ID
    pub id: Uuid,
    /// Sender (human user ID or agent ID)
    pub from: String,
    /// Message content
    pub content: String,
    /// When the message was sent
    pub timestamp: chrono::DateTime<chrono::Utc>,
    /// Whether the message has been processed
    pub processed: bool,
}

/// Checkpoint data for agent recovery.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentCheckpoint {
    /// When the checkpoint was created
    pub timestamp: chrono::DateTime<chrono::Utc>,
    /// Current phase
    pub phase: AgentPhase,
    /// Conversation history
    pub conversation_history: Vec<String>,
    /// Current context
    pub context: String,
    /// Partial work in progress
    pub work_in_progress: Option<serde_json::Value>,
}

/// The agent workflow.
///
/// This workflow manages the lifecycle of a single agent:
/// 1. Initialize with role config and context
/// 2. Receive work assignments
/// 3. Plan execution strategy
/// 4. Execute work (tool calls or sandbox)
/// 5. Review output
/// 6. Deliver artifacts
/// 7. Checkpoint state periodically
pub struct AgentWorkflow {
    state: AgentWorkflowState,
}

impl AgentWorkflow {
    /// Create a new agent workflow.
    pub fn new(input: &AgentWorkflowInput) -> Self {
        let workflow_id = WorkflowState::generate_id(&format!("agent-{:?}", input.role));
        let mut agent = Agent::new(&input.name, input.role);
        agent.id = input.agent_id;
        agent.project_id = input.project_id;
        agent.context = input.initial_context.clone();
        agent.workflow_id = Some(workflow_id.clone());
        agent.current_work_item_id = input.initial_work_item_id;

        Self {
            state: AgentWorkflowState {
                workflow: WorkflowState::new(workflow_id),
                agent,
                phase: AgentPhase::Initialize,
                inbox: Vec::new(),
                checkpoint: None,
            },
        }
    }

    /// Get the current agent state.
    pub fn agent(&self) -> &Agent {
        &self.state.agent
    }

    /// Get the current phase.
    pub fn phase(&self) -> AgentPhase {
        self.state.phase
    }

    /// Advance to the next phase.
    pub fn advance_phase(&mut self, phase: AgentPhase) {
        self.state.phase = phase;
        self.state.workflow.last_activity = chrono::Utc::now();
        tracing::info!(agent_id = %self.state.agent.id, ?phase, "Agent phase transition");
    }

    /// Process a message from the inbox.
    pub fn receive_message(&mut self, from: &str, content: &str) -> Uuid {
        let message = AgentMessage {
            id: Uuid::new_v4(),
            from: from.to_string(),
            content: content.to_string(),
            timestamp: chrono::Utc::now(),
            processed: false,
        };
        let id = message.id;
        self.state.inbox.push(message);
        id
    }

    /// Record a heartbeat.
    pub fn heartbeat(&mut self) {
        self.state.agent.heartbeat();
        self.state.workflow.last_activity = chrono::Utc::now();
    }

    /// Create a checkpoint.
    pub fn checkpoint(&mut self) {
        self.state.checkpoint = Some(AgentCheckpoint {
            timestamp: chrono::Utc::now(),
            phase: self.state.phase,
            conversation_history: self.state.agent.conversation_history.clone(),
            context: self.state.agent.context.clone().unwrap_or_default(),
            work_in_progress: None,
        });
    }

    /// Update agent status.
    pub fn set_status(&mut self, status: AgentStatus) {
        self.state.agent.status = status;
        self.state.agent.updated_at = chrono::Utc::now();
    }
}

#[async_trait::async_trait]
impl SweWorkflow for AgentWorkflow {
    type Input = AgentWorkflowInput;
    type Output = AgentWorkflowOutput;

    async fn execute(&self, _input: Self::Input) -> Result<Self::Output, swe_core::Error> {
        // Stub implementation - actual Temporal workflow would:
        // 1. Initialize with role-specific tools and context
        // 2. Enter main loop:
        //    a. Check inbox for messages
        //    b. Plan next action
        //    c. Execute (LLM call, tool use, or sandbox work)
        //    d. Review output
        //    e. Deliver artifacts if ready
        //    f. Checkpoint periodically
        // 3. Teardown when complete or cancelled

        Ok(AgentWorkflowOutput {
            agent: self.state.agent.clone(),
            artifact_ids: Vec::new(),
            summary: "Agent workflow completed".to_string(),
        })
    }

    async fn handle_signal(
        &mut self,
        signal: &str,
        payload: serde_json::Value,
    ) -> Result<(), swe_core::Error> {
        match signal {
            "assign_work" => {
                let work_item_id: Uuid = serde_json::from_value(payload["work_item_id"].clone())
                    .map_err(|e| swe_core::Error::Internal(e.to_string()))?;
                self.state.agent.current_work_item_id = Some(work_item_id);
                self.set_status(AgentStatus::Active);
                Ok(())
            }
            "message" => {
                let from = payload["from"].as_str().unwrap_or("unknown");
                let content = payload["content"].as_str().unwrap_or("");
                self.receive_message(from, content);
                Ok(())
            }
            "cancel" => {
                self.set_status(AgentStatus::Terminated);
                self.state.workflow.status = WorkflowStatus::Cancelled;
                Ok(())
            }
            "checkpoint" => {
                self.checkpoint();
                Ok(())
            }
            _ => Err(swe_core::Error::Internal(format!(
                "Unknown signal: {}",
                signal
            ))),
        }
    }

    async fn handle_query(
        &self,
        query: &str,
        _args: serde_json::Value,
    ) -> Result<serde_json::Value, swe_core::Error> {
        match query {
            "status" => Ok(serde_json::to_value(&self.state.agent)
                .map_err(|e| swe_core::Error::Serialization(e.to_string()))?),
            "current_work" => Ok(serde_json::to_value(&self.state.agent.current_work_item_id)
                .map_err(|e| swe_core::Error::Serialization(e.to_string()))?),
            "health" => {
                let healthy = self.state.agent.is_healthy();
                Ok(serde_json::json!({ "healthy": healthy }))
            }
            "inbox" => Ok(serde_json::to_value(&self.state.inbox)
                .map_err(|e| swe_core::Error::Serialization(e.to_string()))?),
            _ => Err(swe_core::Error::Internal(format!(
                "Unknown query: {}",
                query
            ))),
        }
    }
}
