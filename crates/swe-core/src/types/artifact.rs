//! Artifact domain type.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Type of artifact produced by agents.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ArtifactType {
    /// Business Design Review document
    Bdr,
    /// Architecture Decision Record
    Adr,
    /// API specification (OpenAPI, etc.)
    ApiSpec,
    /// Design document
    DesignDoc,
    /// Test plan
    TestPlan,
    /// Acceptance criteria
    AcceptanceCriteria,
    /// Security audit report
    SecurityAudit,
    /// Code (file or directory)
    Code,
    /// Pull request
    PullRequest,
    /// Test results
    TestResults,
    /// Architecture diagram
    Diagram,
    /// Wireframe or mockup
    Wireframe,
    /// Generic document
    Document,
    /// Other artifact type
    Other,
}

/// Approval status for artifacts that require review.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ApprovalStatus {
    /// Not yet reviewed
    Pending,
    /// Approved by human or agent
    Approved,
    /// Rejected with feedback
    Rejected,
    /// No approval required
    NotRequired,
}

impl Default for ApprovalStatus {
    fn default() -> Self {
        Self::Pending
    }
}

/// An artifact is any output produced by an agent.
///
/// Artifacts can be documents, code, diagrams, test results, etc.
/// They are tracked, versioned, and may require approval before use.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Artifact {
    /// Unique identifier
    pub id: Uuid,
    /// Human-readable name
    pub name: String,
    /// Type of artifact
    pub artifact_type: ArtifactType,
    /// Optional description
    pub description: Option<String>,
    /// ID of the project this belongs to
    pub project_id: Uuid,
    /// ID of the work item that produced this (if any)
    pub work_item_id: Option<Uuid>,
    /// ID of the agent that created this
    pub created_by_agent_id: Uuid,
    /// Content of the artifact (for text-based artifacts)
    pub content: Option<String>,
    /// Storage URL for binary/large artifacts
    pub storage_url: Option<String>,
    /// MIME type of the content
    pub mime_type: String,
    /// Size in bytes
    pub size_bytes: u64,
    /// Approval status
    pub approval_status: ApprovalStatus,
    /// Who approved/rejected (human user or agent ID)
    pub approved_by: Option<String>,
    /// Approval/rejection comment
    pub approval_comment: Option<String>,
    /// Version number (for versioned artifacts)
    pub version: u32,
    /// ID of the previous version (if any)
    pub previous_version_id: Option<Uuid>,
    /// When the artifact was created
    pub created_at: DateTime<Utc>,
    /// When the artifact was last updated
    pub updated_at: DateTime<Utc>,
}

impl Artifact {
    /// Create a new artifact.
    pub fn new(
        name: impl Into<String>,
        artifact_type: ArtifactType,
        project_id: Uuid,
        created_by_agent_id: Uuid,
    ) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4(),
            name: name.into(),
            artifact_type,
            description: None,
            project_id,
            work_item_id: None,
            created_by_agent_id,
            content: None,
            storage_url: None,
            mime_type: "text/plain".to_string(),
            size_bytes: 0,
            approval_status: ApprovalStatus::default(),
            approved_by: None,
            approval_comment: None,
            version: 1,
            previous_version_id: None,
            created_at: now,
            updated_at: now,
        }
    }

    /// Set the content.
    pub fn with_content(mut self, content: impl Into<String>) -> Self {
        let content = content.into();
        self.size_bytes = content.len() as u64;
        self.content = Some(content);
        self
    }

    /// Set the MIME type.
    pub fn with_mime_type(mut self, mime_type: impl Into<String>) -> Self {
        self.mime_type = mime_type.into();
        self
    }

    /// Check if the artifact requires approval.
    pub fn requires_approval(&self) -> bool {
        matches!(
            self.artifact_type,
            ArtifactType::Bdr
                | ArtifactType::Adr
                | ArtifactType::DesignDoc
                | ArtifactType::ApiSpec
                | ArtifactType::SecurityAudit
        )
    }

    /// Check if the artifact is approved.
    pub fn is_approved(&self) -> bool {
        self.approval_status == ApprovalStatus::Approved
            || self.approval_status == ApprovalStatus::NotRequired
    }

    /// Approve the artifact.
    pub fn approve(&mut self, by: impl Into<String>, comment: Option<String>) {
        self.approval_status = ApprovalStatus::Approved;
        self.approved_by = Some(by.into());
        self.approval_comment = comment;
        self.updated_at = Utc::now();
    }

    /// Reject the artifact.
    pub fn reject(&mut self, by: impl Into<String>, comment: impl Into<String>) {
        self.approval_status = ApprovalStatus::Rejected;
        self.approved_by = Some(by.into());
        self.approval_comment = Some(comment.into());
        self.updated_at = Utc::now();
    }
}
