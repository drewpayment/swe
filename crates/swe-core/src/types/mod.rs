//! Domain types for the SWE platform.

mod agent;
mod artifact;
mod project;
mod work_item;

pub use agent::{Agent, AgentStatus};
pub use artifact::{Artifact, ArtifactType, ApprovalStatus};
pub use project::{Project, ProjectPhase, ProjectStatus};
pub use work_item::{WorkItem, WorkItemStatus, Priority};
