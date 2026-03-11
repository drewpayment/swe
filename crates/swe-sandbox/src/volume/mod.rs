//! Volume management for sandbox workspaces.

use serde::{Deserialize, Serialize};

/// Volume mount configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VolumeMountConfig {
    /// Volume name
    pub name: String,
    /// Mount path inside the container
    pub mount_path: String,
    /// Volume source
    pub source: VolumeSourceConfig,
    /// Read-only mount
    pub read_only: bool,
}

/// Volume source type.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum VolumeSourceConfig {
    /// Empty directory (ephemeral)
    EmptyDir,
    /// Persistent Volume Claim
    Pvc { claim_name: String },
    /// ConfigMap
    ConfigMap { name: String },
    /// Secret
    Secret { name: String },
    /// Host path (dev only)
    HostPath { path: String },
}

/// Create a default workspace volume (emptyDir).
pub fn default_workspace_volume() -> VolumeMountConfig {
    VolumeMountConfig {
        name: "workspace".to_string(),
        mount_path: "/workspace".to_string(),
        source: VolumeSourceConfig::EmptyDir,
        read_only: false,
    }
}

/// Create a git repo volume using an init container.
pub fn git_repo_volume(repo_url: &str, branch: &str) -> VolumeMountConfig {
    // Note: actual git cloning happens via init container,
    // this just configures the volume mount
    VolumeMountConfig {
        name: "workspace".to_string(),
        mount_path: "/workspace".to_string(),
        source: VolumeSourceConfig::EmptyDir,
        read_only: false,
    }
}
