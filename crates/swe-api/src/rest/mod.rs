//! REST API handlers.

pub mod agents;
pub mod artifacts;
pub mod health;
pub mod projects;
pub mod work;

use axum::{http::StatusCode, Json};
use serde::Serialize;

/// Standard API response wrapper.
#[derive(Debug, Serialize)]
pub struct ApiResponse<T: Serialize> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

impl<T: Serialize> ApiResponse<T> {
    pub fn success(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }

}

impl ApiResponse<()> {
    pub fn error(message: impl Into<String>) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(message.into()),
        }
    }
}

/// Convert SWE errors to HTTP responses.
pub fn error_response(err: swe_core::Error) -> (StatusCode, Json<ApiResponse<()>>) {
    let status = match &err {
        swe_core::Error::ProjectNotFound(_) => StatusCode::NOT_FOUND,
        swe_core::Error::AgentNotFound(_) => StatusCode::NOT_FOUND,
        swe_core::Error::WorkItemNotFound(_) => StatusCode::NOT_FOUND,
        swe_core::Error::ArtifactNotFound(_) => StatusCode::NOT_FOUND,
        swe_core::Error::PermissionDenied(_) => StatusCode::FORBIDDEN,
        swe_core::Error::InvalidState(_) => StatusCode::BAD_REQUEST,
        _ => StatusCode::INTERNAL_SERVER_ERROR,
    };

    (status, Json(ApiResponse::error(err.to_string())))
}
