//! Project workflow definition.
//!
//! The project workflow manages the lifecycle of a project, including:
//! - Phase transitions
//! - Agent coordination
//! - Artifact tracking
//! - Human checkpoints

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use swe_core::{Project, ProjectPhase, ProjectStatus};

use super::{SweWorkflow, WorkflowState};

/// Input for starting a project workflow.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectWorkflowInput {
    /// Project ID
    pub project_id: Uuid,
    /// Project name
    pub name: String,
    /// Optional description
    pub description: Option<String>,
    /// Optional repository URL
    pub repo_url: Option<String>,
    /// Initial prompt from user (if starting via `swe run`)
    pub initial_prompt: Option<String>,
}

/// Output from a completed project workflow.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectWorkflowOutput {
    /// The final project state
    pub project: Project,
    /// Summary of what was accomplished
    pub summary: String,
    /// IDs of artifacts produced
    pub artifact_ids: Vec<Uuid>,
}

/// Internal state of the project workflow.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectWorkflowState {
    /// Common workflow state
    pub workflow: WorkflowState,
    /// The project being managed
    pub project: Project,
    /// IDs of active agent workflows
    pub agent_workflow_ids: Vec<String>,
    /// Decisions log
    pub decisions: Vec<ProjectDecision>,
    /// Phase history
    pub phase_history: Vec<PhaseTransition>,
}

/// A decision made during the project.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectDecision {
    /// When the decision was made
    pub timestamp: chrono::DateTime<chrono::Utc>,
    /// Who made the decision (human or agent ID)
    pub made_by: String,
    /// The decision description
    pub description: String,
    /// Related artifact IDs
    pub artifact_ids: Vec<Uuid>,
}

/// A phase transition in the project.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhaseTransition {
    /// When the transition happened
    pub timestamp: chrono::DateTime<chrono::Utc>,
    /// Previous phase
    pub from: ProjectPhase,
    /// New phase
    pub to: ProjectPhase,
    /// Reason for transition
    pub reason: String,
}

/// The project workflow.
///
/// This workflow orchestrates the entire lifecycle of a project:
/// 1. Initialize project and spawn orchestrator agent
/// 2. Orchestrator breaks down work and spawns specialist agents
/// 3. Track phase transitions and checkpoints
/// 4. Collect artifacts and decisions
/// 5. Complete when all work is done
pub struct ProjectWorkflow {
    state: ProjectWorkflowState,
}

impl ProjectWorkflow {
    /// Create a new project workflow.
    pub fn new(input: &ProjectWorkflowInput) -> Self {
        let workflow_id = WorkflowState::generate_id("project");
        let mut project = Project::new(&input.name);
        project.description = input.description.clone();
        project.repo_url = input.repo_url.clone();
        project.workflow_id = Some(workflow_id.clone());

        Self {
            state: ProjectWorkflowState {
                workflow: WorkflowState::new(workflow_id),
                project,
                agent_workflow_ids: Vec::new(),
                decisions: Vec::new(),
                phase_history: Vec::new(),
            },
        }
    }

    /// Get the current project state.
    pub fn project(&self) -> &Project {
        &self.state.project
    }

    /// Advance to the next phase.
    pub fn advance_phase(&mut self, new_phase: ProjectPhase, reason: &str) {
        let transition = PhaseTransition {
            timestamp: chrono::Utc::now(),
            from: self.state.project.phase,
            to: new_phase,
            reason: reason.to_string(),
        };
        self.state.phase_history.push(transition);
        self.state.project.phase = new_phase;
        self.state.project.updated_at = chrono::Utc::now();
    }

    /// Record a decision.
    pub fn record_decision(&mut self, made_by: &str, description: &str, artifact_ids: Vec<Uuid>) {
        self.state.decisions.push(ProjectDecision {
            timestamp: chrono::Utc::now(),
            made_by: made_by.to_string(),
            description: description.to_string(),
            artifact_ids,
        });
    }

    /// Register an agent workflow.
    pub fn register_agent(&mut self, workflow_id: String, agent_id: Uuid) {
        self.state.agent_workflow_ids.push(workflow_id);
        self.state.project.active_agent_ids.push(agent_id);
    }
}

#[async_trait::async_trait]
impl SweWorkflow for ProjectWorkflow {
    type Input = ProjectWorkflowInput;
    type Output = ProjectWorkflowOutput;

    async fn execute(&self, _input: Self::Input) -> Result<Self::Output, swe_core::Error> {
        // Stub implementation - actual Temporal workflow would:
        // 1. Spawn orchestrator agent workflow
        // 2. Wait for orchestrator to complete work breakdown
        // 3. Monitor phase transitions and checkpoints
        // 4. Collect final artifacts
        // 5. Return summary

        Ok(ProjectWorkflowOutput {
            project: self.state.project.clone(),
            summary: "Project workflow completed".to_string(),
            artifact_ids: self.state.project.artifact_ids.clone(),
        })
    }

    async fn handle_signal(
        &mut self,
        signal: &str,
        payload: serde_json::Value,
    ) -> Result<(), swe_core::Error> {
        match signal {
            "advance_phase" => {
                let phase: ProjectPhase = serde_json::from_value(payload["phase"].clone())
                    .map_err(|e| swe_core::Error::Internal(e.to_string()))?;
                let reason = payload["reason"].as_str().unwrap_or("No reason provided");
                self.advance_phase(phase, reason);
                Ok(())
            }
            "human_input" => {
                // Handle human input signal
                Ok(())
            }
            "abort" => {
                self.state.project.status = ProjectStatus::Cancelled;
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
            "status" => Ok(serde_json::to_value(&self.state.project)
                .map_err(|e| swe_core::Error::Serialization(e.to_string()))?),
            "timeline" => Ok(serde_json::to_value(&self.state.phase_history)
                .map_err(|e| swe_core::Error::Serialization(e.to_string()))?),
            "decisions" => Ok(serde_json::to_value(&self.state.decisions)
                .map_err(|e| swe_core::Error::Serialization(e.to_string()))?),
            _ => Err(swe_core::Error::Internal(format!(
                "Unknown query: {}",
                query
            ))),
        }
    }
}
