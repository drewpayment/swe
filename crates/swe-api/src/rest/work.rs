//! Work item API endpoints.

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;
use uuid::Uuid;

use swe_core::{Priority, WorkItem};

use super::{ApiResponse, error_response};
use crate::AppState;

/// Query parameters for listing work items.
#[derive(Debug, Deserialize)]
pub struct ListWorkQuery {
    pub project_id: Option<Uuid>,
    pub status: Option<String>,
}

/// Request to create a work item.
#[derive(Debug, Deserialize)]
pub struct CreateWorkItemRequest {
    pub project_id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub priority: Option<Priority>,
}

/// List work items.
pub async fn list_work_items(
    State(state): State<AppState>,
    Query(query): Query<ListWorkQuery>,
) -> Result<Json<ApiResponse<Vec<WorkItem>>>, (StatusCode, Json<ApiResponse<()>>)> {
    let items = swe_core::db::work_items::list(&state.db, query.project_id)
        .await
        .map_err(error_response)?;

    Ok(Json(ApiResponse::success(items)))
}

/// Create a work item.
pub async fn create_work_item(
    State(state): State<AppState>,
    Json(request): Json<CreateWorkItemRequest>,
) -> Result<(StatusCode, Json<ApiResponse<WorkItem>>), (StatusCode, Json<ApiResponse<()>>)> {
    let mut work_item = WorkItem::new(&request.title, request.project_id);

    if let Some(desc) = request.description {
        work_item.description = Some(desc);
    }
    if let Some(priority) = request.priority {
        work_item.priority = priority;
    }

    swe_core::db::work_items::insert(&state.db, &work_item)
        .await
        .map_err(error_response)?;

    // TODO: Signal project workflow

    tracing::info!(work_item_id = %work_item.id, "Created work item");

    Ok((StatusCode::CREATED, Json(ApiResponse::success(work_item))))
}

/// Get a work item by ID.
pub async fn get_work_item(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<WorkItem>>, (StatusCode, Json<ApiResponse<()>>)> {
    let item = swe_core::db::work_items::get(&state.db, id)
        .await
        .map_err(error_response)?;

    Ok(Json(ApiResponse::success(item)))
}
