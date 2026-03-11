//! Error types for the SWE platform.

use thiserror::Error;

/// Result type alias using SWE's error type.
pub type Result<T> = std::result::Result<T, Error>;

/// Main error type for the SWE platform.
#[derive(Debug, Error)]
pub enum Error {
    /// Configuration error
    #[error("Configuration error: {0}")]
    Config(String),

    /// Project not found
    #[error("Project not found: {0}")]
    ProjectNotFound(String),

    /// Agent not found
    #[error("Agent not found: {0}")]
    AgentNotFound(String),

    /// Work item not found
    #[error("Work item not found: {0}")]
    WorkItemNotFound(String),

    /// Artifact not found
    #[error("Artifact not found: {0}")]
    ArtifactNotFound(String),

    /// Agent spawn error
    #[error("Failed to spawn agent: {0}")]
    AgentSpawn(String),

    /// Sandbox error
    #[error("Sandbox error: {0}")]
    Sandbox(String),

    /// Temporal workflow error
    #[error("Workflow error: {0}")]
    Workflow(String),

    /// LLM/API error
    #[error("LLM error: {0}")]
    Llm(String),

    /// Kubernetes error
    #[error("Kubernetes error: {0}")]
    Kubernetes(String),

    /// IO error
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    /// Serialization error
    #[error("Serialization error: {0}")]
    Serialization(String),

    /// Invalid state transition
    #[error("Invalid state transition: {0}")]
    InvalidState(String),

    /// Permission denied
    #[error("Permission denied: {0}")]
    PermissionDenied(String),

    /// Timeout
    #[error("Operation timed out: {0}")]
    Timeout(String),

    /// Internal error
    #[error("Internal error: {0}")]
    Internal(String),
}

impl Error {
    /// Create a new configuration error.
    pub fn config(msg: impl Into<String>) -> Self {
        Self::Config(msg.into())
    }

    /// Create a new internal error.
    pub fn internal(msg: impl Into<String>) -> Self {
        Self::Internal(msg.into())
    }
}
