//! Project API endpoints.

use axum::{
    extract::Path,
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use swe_core::{Project, ProjectPhase, ProjectStatus};

use super::{ApiResponse, error_response};

/// Request to create a project.
#[derive(Debug, Deserialize)]
pub struct CreateProjectRequest {
    pub name: String,
    pub description: Option<String>,
    pub repo_url: Option<String>,
    pub initial_prompt: Option<String>,
}

/// Project summary for list responses.
#[derive(Debug, Serialize)]
pub struct ProjectSummary {
    pub id: Uuid,
    pub name: String,
    pub phase: ProjectPhase,
    pub status: ProjectStatus,
    pub active_agent_count: usize,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

/// List all projects.
pub async fn list_projects() -> Json<ApiResponse<Vec<ProjectSummary>>> {
    // Stub - would query database
    Json(ApiResponse::success(Vec::new()))
}

/// Create a new project.
pub async fn create_project(
    Json(request): Json<CreateProjectRequest>,
) -> (StatusCode, Json<ApiResponse<Project>>) {
    let mut project = Project::new(&request.name);
    
    if let Some(desc) = request.description {
        project.description = Some(desc);
    }
    if let Some(url) = request.repo_url {
        project.repo_url = Some(url);
    }

    // TODO: Start project workflow with Temporal
    // TODO: Persist to database

    tracing::info!(project_id = %project.id, name = %project.name, "Created project");

    (StatusCode::CREATED, Json(ApiResponse::success(project)))
}

/// Get a project by ID.
pub async fn get_project(
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<Project>>, (StatusCode, Json<ApiResponse<()>>)> {
    // Stub - would query database
    Err(error_response(swe_core::Error::ProjectNotFound(id.to_string())))
}

/// Get project status (detailed view).
pub async fn get_project_status(
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<ProjectStatusResponse>>, (StatusCode, Json<ApiResponse<()>>)> {
    // Stub - would query Temporal workflow
    Err(error_response(swe_core::Error::ProjectNotFound(id.to_string())))
}

/// Archive a project.
pub async fn archive_project(
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<Project>>, (StatusCode, Json<ApiResponse<()>>)> {
    // Stub - would update database and cancel workflow
    Err(error_response(swe_core::Error::ProjectNotFound(id.to_string())))
}

/// Detailed project status response.
#[derive(Debug, Serialize)]
pub struct ProjectStatusResponse {
    pub project: Project,
    pub active_agents: Vec<AgentSummary>,
    pub pending_work: Vec<WorkSummary>,
    pub recent_artifacts: Vec<ArtifactSummary>,
    pub pending_interactions: Vec<InteractionSummary>,
}

#[derive(Debug, Serialize)]
pub struct AgentSummary {
    pub id: Uuid,
    pub name: String,
    pub role: String,
    pub status: String,
}

#[derive(Debug, Serialize)]
pub struct WorkSummary {
    pub id: Uuid,
    pub title: String,
    pub status: String,
}

#[derive(Debug, Serialize)]
pub struct ArtifactSummary {
    pub id: Uuid,
    pub name: String,
    pub artifact_type: String,
    pub approval_status: String,
}

#[derive(Debug, Serialize)]
pub struct InteractionSummary {
    pub id: Uuid,
    pub prompt: String,
    pub interaction_type: String,
}
