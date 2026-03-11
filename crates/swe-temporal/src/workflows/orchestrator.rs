//! Orchestrator workflow definition.
//!
//! The orchestrator is a specialized agent workflow that:
//! - Serves as the primary human interface
//! - Dispatches work to specialist agents
//! - Coordinates multi-agent collaboration
//! - Manages project phase transitions

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use swe_core::{Agent, AgentRole, AgentStatus};

use super::agent::{AgentWorkflow, AgentWorkflowInput};
use super::{SweWorkflow, WorkflowState};

/// Input for starting an orchestrator workflow.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrchestratorWorkflowInput {
    /// Whether this is the global orchestrator
    pub is_global: bool,
    /// Project ID (None for global orchestrator)
    pub project_id: Option<Uuid>,
    /// Initial prompt from the user
    pub initial_prompt: Option<String>,
}

/// Output from a completed orchestrator workflow.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrchestratorWorkflowOutput {
    /// The final orchestrator agent state
    pub agent: Agent,
    /// IDs of projects managed (for global) or artifacts produced (for project)
    pub result_ids: Vec<Uuid>,
    /// Summary of actions taken
    pub summary: String,
}

/// State specific to orchestrator workflows.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrchestratorState {
    /// Whether this is the global orchestrator
    pub is_global: bool,
    /// IDs of spawned agent workflows
    pub spawned_agents: Vec<SpawnedAgent>,
    /// Pending human interactions
    pub pending_interactions: Vec<PendingInteraction>,
}

/// Information about a spawned agent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpawnedAgent {
    /// Agent ID
    pub agent_id: Uuid,
    /// Workflow ID
    pub workflow_id: String,
    /// Role of the agent
    pub role: AgentRole,
    /// Current status
    pub status: AgentStatus,
}

/// A pending human interaction.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PendingInteraction {
    /// Unique ID for this interaction
    pub id: Uuid,
    /// Type of interaction needed
    pub interaction_type: InteractionType,
    /// Question or prompt for the human
    pub prompt: String,
    /// Options (if multiple choice)
    pub options: Option<Vec<String>>,
    /// Related artifact ID (if reviewing)
    pub artifact_id: Option<Uuid>,
    /// When the interaction was requested
    pub requested_at: chrono::DateTime<chrono::Utc>,
    /// Response from human (if received)
    pub response: Option<String>,
}

/// Type of human interaction.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InteractionType {
    /// Approval needed for an artifact
    Approval,
    /// Choice between options
    Choice,
    /// Free-form input needed
    Input,
    /// Confirmation needed
    Confirmation,
    /// Notification (no response needed)
    Notification,
}

/// The orchestrator workflow.
///
/// Orchestrators are special agents that coordinate work:
/// - Global orchestrator: manages multiple projects
/// - Project orchestrator: manages agents within a project
pub struct OrchestratorWorkflow {
    /// Underlying agent workflow
    agent_workflow: AgentWorkflow,
    /// Orchestrator-specific state
    orchestrator_state: OrchestratorState,
}

impl OrchestratorWorkflow {
    /// Create a new orchestrator workflow.
    pub fn new(input: &OrchestratorWorkflowInput) -> Self {
        let role = if input.is_global {
            AgentRole::GlobalOrchestrator
        } else {
            AgentRole::ProjectOrchestrator
        };

        let name = if input.is_global {
            "global-orchestrator".to_string()
        } else {
            format!("project-orchestrator-{}", input.project_id.unwrap_or_default())
        };

        let agent_input = AgentWorkflowInput {
            agent_id: Uuid::new_v4(),
            name,
            role,
            project_id: input.project_id,
            initial_context: input.initial_prompt.clone(),
            initial_work_item_id: None,
        };

        Self {
            agent_workflow: AgentWorkflow::new(&agent_input),
            orchestrator_state: OrchestratorState {
                is_global: input.is_global,
                spawned_agents: Vec::new(),
                pending_interactions: Vec::new(),
            },
        }
    }

    /// Get the orchestrator agent.
    pub fn agent(&self) -> &Agent {
        self.agent_workflow.agent()
    }

    /// Spawn a new specialist agent.
    pub fn spawn_agent(&mut self, role: AgentRole, context: Option<String>) -> SpawnedAgent {
        let workflow_id = WorkflowState::generate_id(&format!("agent-{:?}", role));
        let agent_id = Uuid::new_v4();

        let spawned = SpawnedAgent {
            agent_id,
            workflow_id,
            role,
            status: AgentStatus::Initializing,
        };

        self.orchestrator_state.spawned_agents.push(spawned.clone());
        tracing::info!(%agent_id, ?role, "Orchestrator spawned agent");

        spawned
    }

    /// Request human interaction.
    pub fn request_interaction(
        &mut self,
        interaction_type: InteractionType,
        prompt: &str,
        options: Option<Vec<String>>,
        artifact_id: Option<Uuid>,
    ) -> Uuid {
        let interaction = PendingInteraction {
            id: Uuid::new_v4(),
            interaction_type,
            prompt: prompt.to_string(),
            options,
            artifact_id,
            requested_at: chrono::Utc::now(),
            response: None,
        };
        let id = interaction.id;
        self.orchestrator_state.pending_interactions.push(interaction);
        id
    }

    /// Get pending interactions.
    pub fn pending_interactions(&self) -> &[PendingInteraction] {
        &self.orchestrator_state.pending_interactions
    }

    /// Resolve a pending interaction.
    pub fn resolve_interaction(&mut self, id: Uuid, response: &str) -> bool {
        if let Some(interaction) = self
            .orchestrator_state
            .pending_interactions
            .iter_mut()
            .find(|i| i.id == id)
        {
            interaction.response = Some(response.to_string());
            true
        } else {
            false
        }
    }
}

#[async_trait::async_trait]
impl SweWorkflow for OrchestratorWorkflow {
    type Input = OrchestratorWorkflowInput;
    type Output = OrchestratorWorkflowOutput;

    async fn execute(&self, _input: Self::Input) -> Result<Self::Output, swe_core::Error> {
        // Stub implementation - actual workflow would:
        // 1. Parse initial prompt and create work breakdown
        // 2. Spawn specialist agents as needed
        // 3. Monitor agent progress
        // 4. Handle human interactions
        // 5. Coordinate phase transitions
        // 6. Aggregate results

        Ok(OrchestratorWorkflowOutput {
            agent: self.agent_workflow.agent().clone(),
            result_ids: Vec::new(),
            summary: "Orchestrator workflow completed".to_string(),
        })
    }

    async fn handle_signal(
        &mut self,
        signal: &str,
        payload: serde_json::Value,
    ) -> Result<(), swe_core::Error> {
        match signal {
            "spawn_agent" => {
                let role: AgentRole = serde_json::from_value(payload["role"].clone())
                    .map_err(|e| swe_core::Error::Internal(e.to_string()))?;
                let context = payload["context"].as_str().map(String::from);
                self.spawn_agent(role, context);
                Ok(())
            }
            "human_response" => {
                let id: Uuid = serde_json::from_value(payload["interaction_id"].clone())
                    .map_err(|e| swe_core::Error::Internal(e.to_string()))?;
                let response = payload["response"].as_str().unwrap_or("");
                self.resolve_interaction(id, response);
                Ok(())
            }
            _ => self.agent_workflow.handle_signal(signal, payload).await,
        }
    }

    async fn handle_query(
        &self,
        query: &str,
        args: serde_json::Value,
    ) -> Result<serde_json::Value, swe_core::Error> {
        match query {
            "spawned_agents" => Ok(serde_json::to_value(&self.orchestrator_state.spawned_agents)
                .map_err(|e| swe_core::Error::Serialization(e.to_string()))?),
            "pending_interactions" => {
                Ok(serde_json::to_value(&self.orchestrator_state.pending_interactions)
                    .map_err(|e| swe_core::Error::Serialization(e.to_string()))?)
            }
            _ => self.agent_workflow.handle_query(query, args).await,
        }
    }
}
