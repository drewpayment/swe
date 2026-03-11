//! Temporal activity implementations.
//!
//! Activities are the building blocks of workflows - they perform
//! the actual work (LLM calls, container management, file I/O, etc.)

mod artifact;
mod container;
mod llm;
mod tools;

pub use artifact::ArtifactActivity;
pub use container::ContainerActivity;
pub use llm::LlmActivity;
pub use tools::ToolActivity;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};

/// Common result type for activities.
pub type ActivityResult<T> = Result<T, swe_core::Error>;

/// Trait for all SWE activities.
///
/// Note: This is a stub trait. When temporal-sdk-core stabilizes,
/// this will be replaced with actual Temporal activity implementations.
#[async_trait]
pub trait SweActivity: Send + Sync {
    /// Activity name for registration.
    fn name(&self) -> &'static str;
}

/// Options for activity execution.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ActivityOptions {
    /// Timeout for the activity in seconds
    pub timeout_seconds: Option<u64>,
    /// Number of retries on failure
    pub max_retries: Option<u32>,
    /// Retry backoff multiplier
    pub retry_backoff_multiplier: Option<f64>,
}
