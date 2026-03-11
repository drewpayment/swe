//! Artifact API endpoints.

use axum::{
    extract::{Path, Query},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use swe_core::Artifact;

use super::{ApiResponse, error_response};

/// Query parameters for listing artifacts.
#[derive(Debug, Deserialize)]
pub struct ListArtifactsQuery {
    pub project_id: Option<Uuid>,
    pub artifact_type: Option<String>,
}

/// Request to approve an artifact.
#[derive(Debug, Deserialize)]
pub struct ApproveArtifactRequest {
    pub approved: bool,
    pub comment: Option<String>,
    pub approved_by: String,
}

/// Artifact content response.
#[derive(Debug, Serialize)]
pub struct ArtifactContentResponse {
    pub artifact_id: Uuid,
    pub content: String,
    pub mime_type: String,
}

/// List artifacts.
pub async fn list_artifacts(
    Query(query): Query<ListArtifactsQuery>,
) -> Json<ApiResponse<Vec<Artifact>>> {
    // Stub - would query database
    tracing::debug!(project_id = ?query.project_id, "Listing artifacts");
    Json(ApiResponse::success(Vec::new()))
}

/// Get an artifact by ID.
pub async fn get_artifact(
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<Artifact>>, (StatusCode, Json<ApiResponse<()>>)> {
    // Stub - would query database
    Err(error_response(swe_core::Error::ArtifactNotFound(id.to_string())))
}

/// Get artifact content.
pub async fn get_artifact_content(
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<ArtifactContentResponse>>, (StatusCode, Json<ApiResponse<()>>)> {
    // Stub - would retrieve from storage
    Err(error_response(swe_core::Error::ArtifactNotFound(id.to_string())))
}

/// Approve or reject an artifact.
pub async fn approve_artifact(
    Path(id): Path<Uuid>,
    Json(request): Json<ApproveArtifactRequest>,
) -> Result<Json<ApiResponse<Artifact>>, (StatusCode, Json<ApiResponse<()>>)> {
    // Stub - would update database and signal workflow
    tracing::info!(
        artifact_id = %id,
        approved = request.approved,
        "Artifact approval request"
    );
    
    Err(error_response(swe_core::Error::ArtifactNotFound(id.to_string())))
}
