//! Agent API endpoints.

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use swe_core::Agent;

use super::{ApiResponse, error_response};
use crate::AppState;

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
    State(state): State<AppState>,
    Query(query): Query<ListAgentsQuery>,
) -> Result<Json<ApiResponse<Vec<Agent>>>, (StatusCode, Json<ApiResponse<()>>)> {
    let agents = swe_core::db::agents::list(&state.db, query.project_id)
        .await
        .map_err(error_response)?;

    Ok(Json(ApiResponse::success(agents)))
}

/// Get an agent by ID.
pub async fn get_agent(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<Agent>>, (StatusCode, Json<ApiResponse<()>>)> {
    let agent = swe_core::db::agents::get(&state.db, id)
        .await
        .map_err(error_response)?;

    Ok(Json(ApiResponse::success(agent)))
}

/// Send a message to an agent.
pub async fn send_message(
    State(_state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(request): Json<SendMessageRequest>,
) -> Result<Json<ApiResponse<SendMessageResponse>>, (StatusCode, Json<ApiResponse<()>>)> {
    // TODO: Signal Temporal workflow with agent message
    tracing::info!(agent_id = %id, content_len = request.content.len(), "Sending message to agent");

    Ok(Json(ApiResponse::success(SendMessageResponse {
        message_id: Uuid::new_v4(),
        acknowledged: true,
    })))
}
