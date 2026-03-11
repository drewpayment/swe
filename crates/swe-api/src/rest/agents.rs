//! Agent API endpoints.

use axum::{
    extract::{Path, Query},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use swe_core::Agent;

use super::{ApiResponse, error_response};

/// Query parameters for listing agents.
#[derive(Debug, Deserialize)]
pub struct ListAgentsQuery {
    pub project_id: Option<Uuid>,
}

/// Request to send a message to an agent.
#[derive(Debug, Deserialize)]
pub struct SendMessageRequest {
    pub content: String,
}

/// Response from sending a message.
#[derive(Debug, Serialize)]
pub struct SendMessageResponse {
    pub message_id: Uuid,
    pub acknowledged: bool,
}

/// List agents.
pub async fn list_agents(
    Query(query): Query<ListAgentsQuery>,
) -> Json<ApiResponse<Vec<Agent>>> {
    // Stub - would query database filtered by project_id
    tracing::debug!(project_id = ?query.project_id, "Listing agents");
    Json(ApiResponse::success(Vec::new()))
}

/// Get an agent by ID.
pub async fn get_agent(
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<Agent>>, (StatusCode, Json<ApiResponse<()>>)> {
    // Stub - would query database
    Err(error_response(swe_core::Error::AgentNotFound(id.to_string())))
}

/// Send a message to an agent.
pub async fn send_message(
    Path(id): Path<Uuid>,
    Json(request): Json<SendMessageRequest>,
) -> Result<Json<ApiResponse<SendMessageResponse>>, (StatusCode, Json<ApiResponse<()>>)> {
    // Stub - would signal Temporal workflow
    tracing::info!(agent_id = %id, "Sending message to agent");
    
    Ok(Json(ApiResponse::success(SendMessageResponse {
        message_id: Uuid::new_v4(),
        acknowledged: true,
    })))
}
