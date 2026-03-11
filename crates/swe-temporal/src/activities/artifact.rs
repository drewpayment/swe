//! Artifact activity implementation.
//!
//! Handles storage and retrieval of artifacts produced by agents.

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use swe_core::{Artifact, ArtifactType};

use super::{ActivityResult, SweActivity};

/// Request to store an artifact.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoreArtifactRequest {
    /// Artifact metadata
    pub artifact: Artifact,
    /// Content (for text artifacts)
    pub content: Option<String>,
    /// Binary data (base64 encoded for binary artifacts)
    pub binary_data: Option<String>,
}

/// Response from artifact storage.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoreArtifactResponse {
    /// Artifact ID
    pub artifact_id: Uuid,
    /// Storage URL (for large/binary artifacts)
    pub storage_url: Option<String>,
    /// Size in bytes
    pub size_bytes: u64,
}

/// Artifact activity for storage and retrieval.
pub struct ArtifactActivity {
    /// Storage backend URL (e.g., S3, MinIO)
    storage_url: String,
    /// Local cache directory
    cache_dir: std::path::PathBuf,
}

impl ArtifactActivity {
    /// Create a new artifact activity.
    pub fn new(storage_url: impl Into<String>, cache_dir: impl Into<std::path::PathBuf>) -> Self {
        Self {
            storage_url: storage_url.into(),
            cache_dir: cache_dir.into(),
        }
    }

    /// Store an artifact.
    pub async fn store(&self, request: StoreArtifactRequest) -> ActivityResult<StoreArtifactResponse> {
        let artifact_id = request.artifact.id;
        
        // Determine size
        let size_bytes = if let Some(content) = &request.content {
            content.len() as u64
        } else if let Some(data) = &request.binary_data {
            // Base64 decodes to ~75% of original size
            (data.len() as f64 * 0.75) as u64
        } else {
            0
        };

        // For text artifacts, store locally
        if let Some(content) = &request.content {
            let artifact_path = self.cache_dir.join(format!("{}.txt", artifact_id));
            tokio::fs::create_dir_all(&self.cache_dir)
                .await
                .map_err(|e| swe_core::Error::Io(e))?;
            tokio::fs::write(&artifact_path, content)
                .await
                .map_err(|e| swe_core::Error::Io(e))?;
        }

        // For binary artifacts, would upload to S3/MinIO
        let storage_url = if request.binary_data.is_some() {
            Some(format!("{}/artifacts/{}", self.storage_url, artifact_id))
        } else {
            None
        };

        tracing::info!(
            %artifact_id,
            artifact_type = ?request.artifact.artifact_type,
            %size_bytes,
            "Stored artifact"
        );

        Ok(StoreArtifactResponse {
            artifact_id,
            storage_url,
            size_bytes,
        })
    }

    /// Retrieve artifact content.
    pub async fn retrieve(&self, artifact_id: Uuid) -> ActivityResult<String> {
        let artifact_path = self.cache_dir.join(format!("{}.txt", artifact_id));
        
        if artifact_path.exists() {
            tokio::fs::read_to_string(&artifact_path)
                .await
                .map_err(|e| swe_core::Error::Io(e))
        } else {
            Err(swe_core::Error::ArtifactNotFound(artifact_id.to_string()))
        }
    }

    /// List artifacts for a project.
    pub async fn list_for_project(&self, project_id: Uuid) -> ActivityResult<Vec<Artifact>> {
        // Stub - would query database
        tracing::debug!(%project_id, "Listing artifacts for project");
        Ok(Vec::new())
    }

    /// Get artifact metadata.
    pub async fn get_metadata(&self, artifact_id: Uuid) -> ActivityResult<Artifact> {
        // Stub - would query database
        Err(swe_core::Error::ArtifactNotFound(artifact_id.to_string()))
    }

    /// Delete an artifact.
    pub async fn delete(&self, artifact_id: Uuid) -> ActivityResult<()> {
        let artifact_path = self.cache_dir.join(format!("{}.txt", artifact_id));
        
        if artifact_path.exists() {
            tokio::fs::remove_file(&artifact_path)
                .await
                .map_err(|e| swe_core::Error::Io(e))?;
        }

        tracing::info!(%artifact_id, "Deleted artifact");
        Ok(())
    }

    /// Render an artifact for display.
    pub async fn render(&self, artifact_id: Uuid) -> ActivityResult<RenderedArtifact> {
        let content = self.retrieve(artifact_id).await?;
        
        // Simple rendering - would detect type and render appropriately
        Ok(RenderedArtifact {
            artifact_id,
            format: "text".to_string(),
            rendered: content,
        })
    }
}

/// Rendered artifact for display.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenderedArtifact {
    /// Artifact ID
    pub artifact_id: Uuid,
    /// Output format (html, markdown, text)
    pub format: String,
    /// Rendered content
    pub rendered: String,
}

#[async_trait]
impl SweActivity for ArtifactActivity {
    fn name(&self) -> &'static str {
        "artifact_manage"
    }
}
