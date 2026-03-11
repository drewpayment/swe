//! Work item API endpoints.

use axum::{
    extract::{Path, Query},
    http::StatusCode,
    Json,
};
use serde::Deserialize;
use uuid::Uuid;

use swe_core::{Priority, WorkItem};

use super::{ApiResponse, error_response};

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
    Query(query): Query<ListWorkQuery>,
) -> Json<ApiResponse<Vec<WorkItem>>> {
    // Stub - would query database
    tracing::debug!(project_id = ?query.project_id, "Listing work items");
    Json(ApiResponse::success(Vec::new()))
}

/// Create a work item.
pub async fn create_work_item(
    Json(request): Json<CreateWorkItemRequest>,
) -> (StatusCode, Json<ApiResponse<WorkItem>>) {
    let mut work_item = WorkItem::new(&request.title, request.project_id);
    
    if let Some(desc) = request.description {
        work_item.description = Some(desc);
    }
    if let Some(priority) = request.priority {
        work_item.priority = priority;
    }

    // TODO: Persist to database
    // TODO: Signal project workflow

    tracing::info!(work_item_id = %work_item.id, "Created work item");

    (StatusCode::CREATED, Json(ApiResponse::success(work_item)))
}

/// Get a work item by ID.
pub async fn get_work_item(
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<WorkItem>>, (StatusCode, Json<ApiResponse<()>>)> {
    // Stub - would query database
    Err(error_response(swe_core::Error::WorkItemNotFound(id.to_string())))
}
