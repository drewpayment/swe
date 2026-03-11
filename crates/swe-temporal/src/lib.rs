//! # SWE Temporal
//!
//! Temporal workflows and activities for the SWE platform.
//!
//! This crate provides:
//! - Workflow definitions for projects, agents, and orchestration
//! - Activity implementations for LLM calls, container management, and tools
//! - Signal and query definitions for workflow interaction

pub mod activities;
pub mod signals;
pub mod workflows;

pub use activities::*;
pub use signals::*;
pub use workflows::*;

/// Re-export commonly used types
pub mod prelude {
    pub use crate::activities::{
        ArtifactActivity, ContainerActivity, LlmActivity, ToolActivity,
    };
    pub use crate::signals::{AgentSignal, ProjectSignal};
    pub use crate::workflows::{AgentWorkflow, OrchestratorWorkflow, ProjectWorkflow, SandboxWorkflow};
}
