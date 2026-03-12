//! Project API endpoints.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use swe_core::{Project, ProjectPhase, ProjectStatus};

use super::{ApiResponse, error_response};
use crate::AppState;

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
pub async fn list_projects(
    State(state): State<AppState>,
) -> Result<Json<ApiResponse<Vec<Project>>>, (StatusCode, Json<ApiResponse<()>>)> {
    let projects = swe_core::db::projects::list(&state.db)
        .await
        .map_err(error_response)?;

    Ok(Json(ApiResponse::success(projects)))
}

/// Create a new project.
pub async fn create_project(
    State(state): State<AppState>,
    Json(request): Json<CreateProjectRequest>,
) -> Result<(StatusCode, Json<ApiResponse<Project>>), (StatusCode, Json<ApiResponse<()>>)> {
    let mut project = Project::new(&request.name);

    if let Some(desc) = request.description {
        project.description = Some(desc);
    }
    if let Some(url) = request.repo_url {
        project.repo_url = Some(url);
    }

    swe_core::db::projects::insert(&state.db, &project)
        .await
        .map_err(error_response)?;

    // TODO: Start project workflow with Temporal

    tracing::info!(project_id = %project.id, name = %project.name, "Created project");

    Ok((StatusCode::CREATED, Json(ApiResponse::success(project))))
}

/// Get a project by ID.
pub async fn get_project(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<Project>>, (StatusCode, Json<ApiResponse<()>>)> {
    let project = swe_core::db::projects::get(&state.db, id)
        .await
        .map_err(error_response)?;

    Ok(Json(ApiResponse::success(project)))
}

/// Get project status (detailed view).
pub async fn get_project_status(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<ProjectStatusResponse>>, (StatusCode, Json<ApiResponse<()>>)> {
    let project = swe_core::db::projects::get(&state.db, id)
        .await
        .map_err(error_response)?;

    let agents = swe_core::db::agents::list(&state.db, Some(id))
        .await
        .map_err(error_response)?;

    let work_items = swe_core::db::work_items::list(&state.db, Some(id))
        .await
        .map_err(error_response)?;

    let artifacts = swe_core::db::artifacts::list(&state.db, Some(id))
        .await
        .map_err(error_response)?;

    let active_agents = agents
        .into_iter()
        .map(|a| AgentSummary {
            id: a.id,
            name: a.name,
            role: format!("{:?}", a.role),
            status: format!("{:?}", a.status),
        })
        .collect();

    let pending_work = work_items
        .into_iter()
        .map(|w| WorkSummary {
            id: w.id,
            title: w.title,
            status: format!("{:?}", w.status),
        })
        .collect();

    let recent_artifacts = artifacts
        .into_iter()
        .map(|a| ArtifactSummary {
            id: a.id,
            name: a.name,
            artifact_type: format!("{:?}", a.artifact_type),
            approval_status: format!("{:?}", a.approval_status),
        })
        .collect();

    Ok(Json(ApiResponse::success(ProjectStatusResponse {
        project,
        active_agents,
        pending_work,
        recent_artifacts,
        pending_interactions: Vec::new(),
    })))
}

/// Archive a project.
pub async fn archive_project(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<Project>>, (StatusCode, Json<ApiResponse<()>>)> {
    let project = swe_core::db::projects::archive(&state.db, id)
        .await
        .map_err(error_response)?;

    Ok(Json(ApiResponse::success(project)))
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
