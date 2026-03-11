//! Sandbox workflow definition.
//!
//! The sandbox workflow manages the lifecycle of agent execution environments:
//! - Spawning K8s Jobs for agent sandboxes
//! - Managing workspace volumes
//! - Monitoring health and resource usage
//! - Cleanup on completion or timeout

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use swe_core::AgentRole;

use super::{SweWorkflow, WorkflowState, WorkflowStatus};

/// Input for starting a sandbox workflow.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SandboxWorkflowInput {
    /// Agent ID that will use this sandbox
    pub agent_id: Uuid,
    /// Role of the agent (determines base image)
    pub role: AgentRole,
    /// Workspace path to mount
    pub workspace_path: Option<String>,
    /// Git repository to clone
    pub repo_url: Option<String>,
    /// Branch to checkout
    pub branch: Option<String>,
    /// CPU limit
    pub cpu_limit: Option<String>,
    /// Memory limit
    pub memory_limit: Option<String>,
    /// Timeout in seconds
    pub timeout_seconds: Option<u64>,
}

/// Output from a completed sandbox workflow.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SandboxWorkflowOutput {
    /// Final status
    pub status: SandboxStatus,
    /// Exit code (if completed)
    pub exit_code: Option<i32>,
    /// Paths to output artifacts
    pub output_paths: Vec<String>,
    /// Resource usage summary
    pub resource_usage: ResourceUsage,
}

/// Status of a sandbox.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SandboxStatus {
    /// Sandbox is being created
    Creating,
    /// Sandbox is running
    Running,
    /// Sandbox completed successfully
    Completed,
    /// Sandbox failed
    Failed,
    /// Sandbox was terminated
    Terminated,
    /// Sandbox timed out
    TimedOut,
}

/// Resource usage information.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ResourceUsage {
    /// Peak CPU usage (millicores)
    pub peak_cpu_millicores: u64,
    /// Peak memory usage (bytes)
    pub peak_memory_bytes: u64,
    /// Total runtime (seconds)
    pub runtime_seconds: u64,
}

/// Internal state of the sandbox workflow.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SandboxWorkflowState {
    /// Common workflow state
    pub workflow: WorkflowState,
    /// Sandbox ID (K8s Job name)
    pub sandbox_id: String,
    /// Agent ID
    pub agent_id: Uuid,
    /// Current status
    pub status: SandboxStatus,
    /// K8s namespace
    pub namespace: String,
    /// Pod name
    pub pod_name: Option<String>,
    /// Start time
    pub started_at: chrono::DateTime<chrono::Utc>,
    /// Resource usage
    pub resource_usage: ResourceUsage,
}

/// The sandbox workflow.
///
/// This workflow manages the lifecycle of agent execution environments:
/// 1. Create K8s Job with appropriate image for role
/// 2. Mount workspace volumes
/// 3. Monitor job status and resource usage
/// 4. Stream logs to agent workflow
/// 5. Cleanup on completion or timeout
pub struct SandboxWorkflow {
    state: SandboxWorkflowState,
    input: SandboxWorkflowInput,
}

impl SandboxWorkflow {
    /// Create a new sandbox workflow.
    pub fn new(input: SandboxWorkflowInput) -> Self {
        let workflow_id = WorkflowState::generate_id("sandbox");
        let sandbox_id = format!("swe-sandbox-{}", Uuid::new_v4());

        Self {
            state: SandboxWorkflowState {
                workflow: WorkflowState::new(&workflow_id),
                sandbox_id,
                agent_id: input.agent_id,
                status: SandboxStatus::Creating,
                namespace: "swe-sandboxes".to_string(),
                pod_name: None,
                started_at: chrono::Utc::now(),
                resource_usage: ResourceUsage::default(),
            },
            input,
        }
    }

    /// Get the sandbox ID.
    pub fn sandbox_id(&self) -> &str {
        &self.state.sandbox_id
    }

    /// Get the current status.
    pub fn status(&self) -> SandboxStatus {
        self.state.status
    }

    /// Get the image name for a role.
    pub fn image_for_role(role: AgentRole) -> &'static str {
        match role {
            AgentRole::Coder => "swe-sandbox-coder:latest",
            AgentRole::Sdet => "swe-sandbox-sdet:latest",
            AgentRole::Security => "swe-sandbox-security:latest",
            AgentRole::DevOps | AgentRole::Platform => "swe-sandbox-devops:latest",
            _ => "swe-sandbox-base:latest",
        }
    }

    /// Update status.
    pub fn set_status(&mut self, status: SandboxStatus) {
        self.state.status = status;
        self.state.workflow.last_activity = chrono::Utc::now();
    }

    /// Update resource usage.
    pub fn update_resource_usage(&mut self, cpu: u64, memory: u64) {
        if cpu > self.state.resource_usage.peak_cpu_millicores {
            self.state.resource_usage.peak_cpu_millicores = cpu;
        }
        if memory > self.state.resource_usage.peak_memory_bytes {
            self.state.resource_usage.peak_memory_bytes = memory;
        }
        let elapsed = chrono::Utc::now() - self.state.started_at;
        self.state.resource_usage.runtime_seconds = elapsed.num_seconds() as u64;
    }
}

#[async_trait::async_trait]
impl SweWorkflow for SandboxWorkflow {
    type Input = SandboxWorkflowInput;
    type Output = SandboxWorkflowOutput;

    async fn execute(&self, _input: Self::Input) -> Result<Self::Output, swe_core::Error> {
        // Stub implementation - actual workflow would:
        // 1. Create K8s Job spec with appropriate image
        // 2. Mount workspace volume
        // 3. Clone repo if specified
        // 4. Monitor job status
        // 5. Stream logs
        // 6. Cleanup on completion

        Ok(SandboxWorkflowOutput {
            status: self.state.status,
            exit_code: Some(0),
            output_paths: Vec::new(),
            resource_usage: self.state.resource_usage.clone(),
        })
    }

    async fn handle_signal(
        &mut self,
        signal: &str,
        payload: serde_json::Value,
    ) -> Result<(), swe_core::Error> {
        match signal {
            "terminate" => {
                self.set_status(SandboxStatus::Terminated);
                self.state.workflow.status = WorkflowStatus::Cancelled;
                Ok(())
            }
            "resource_update" => {
                let cpu = payload["cpu"].as_u64().unwrap_or(0);
                let memory = payload["memory"].as_u64().unwrap_or(0);
                self.update_resource_usage(cpu, memory);
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
            "status" => Ok(serde_json::json!({
                "sandbox_id": self.state.sandbox_id,
                "status": self.state.status,
                "pod_name": self.state.pod_name,
            })),
            "resources" => Ok(serde_json::to_value(&self.state.resource_usage)
                .map_err(|e| swe_core::Error::Serialization(e.to_string()))?),
            _ => Err(swe_core::Error::Internal(format!(
                "Unknown query: {}",
                query
            ))),
        }
    }
}
