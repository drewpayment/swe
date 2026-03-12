//! Artifact API endpoints.

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use swe_core::Artifact;

use super::{ApiResponse, error_response};
use crate::AppState;

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
    State(state): State<AppState>,
    Query(query): Query<ListArtifactsQuery>,
) -> Result<Json<ApiResponse<Vec<Artifact>>>, (StatusCode, Json<ApiResponse<()>>)> {
    let artifacts = swe_core::db::artifacts::list(&state.db, query.project_id)
        .await
        .map_err(error_response)?;

    Ok(Json(ApiResponse::success(artifacts)))
}

/// Get an artifact by ID.
pub async fn get_artifact(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<Artifact>>, (StatusCode, Json<ApiResponse<()>>)> {
    let artifact = swe_core::db::artifacts::get(&state.db, id)
        .await
        .map_err(error_response)?;

    Ok(Json(ApiResponse::success(artifact)))
}

/// Get artifact content.
pub async fn get_artifact_content(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<ArtifactContentResponse>>, (StatusCode, Json<ApiResponse<()>>)> {
    let artifact = swe_core::db::artifacts::get(&state.db, id)
        .await
        .map_err(error_response)?;

    let content = artifact.content.clone().unwrap_or_default();

    Ok(Json(ApiResponse::success(ArtifactContentResponse {
        artifact_id: artifact.id,
        content,
        mime_type: artifact.mime_type,
    })))
}

/// Approve or reject an artifact.
pub async fn approve_artifact(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(request): Json<ApproveArtifactRequest>,
) -> Result<Json<ApiResponse<Artifact>>, (StatusCode, Json<ApiResponse<()>>)> {
    tracing::info!(
        artifact_id = %id,
        approved = request.approved,
        "Artifact approval request"
    );

    let artifact = swe_core::db::artifacts::update_approval(
        &state.db,
        id,
        request.approved,
        &request.approved_by,
        request.comment.as_deref(),
    )
    .await
    .map_err(error_response)?;

    Ok(Json(ApiResponse::success(artifact)))
}
