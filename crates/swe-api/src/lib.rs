//! # SWE API
//!
//! REST and gRPC API server for the SWE platform.
//!
//! Provides HTTP endpoints for:
//! - Project management
//! - Agent lifecycle
//! - Work items
//! - Artifacts
//! - Health checks
//! - WebSocket streaming

pub mod auth;
pub mod rest;
pub mod websocket;
// pub mod grpc; // Enable when proto files are compiled

use axum::{
    routing::{get, post, delete},
    Router,
};
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;

/// Shared application state available to all handlers.
#[derive(Clone)]
pub struct AppState {
    pub db: swe_core::db::Pool,
}

/// Create the API router with all routes.
pub fn create_router(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        // Health check
        .route("/health", get(rest::health::health_check))
        .route("/ready", get(rest::health::ready_check))
        
        // Projects
        .route("/api/v1/projects", get(rest::projects::list_projects))
        .route("/api/v1/projects", post(rest::projects::create_project))
        .route("/api/v1/projects/{id}", get(rest::projects::get_project))
        .route("/api/v1/projects/{id}", delete(rest::projects::archive_project))
        .route("/api/v1/projects/{id}/status", get(rest::projects::get_project_status))

        // Agents
        .route("/api/v1/agents", get(rest::agents::list_agents))
        .route("/api/v1/agents/{id}", get(rest::agents::get_agent))
        .route("/api/v1/agents/{id}/message", post(rest::agents::send_message))

        // Work items
        .route("/api/v1/work", get(rest::work::list_work_items))
        .route("/api/v1/work", post(rest::work::create_work_item))
        .route("/api/v1/work/{id}", get(rest::work::get_work_item))

        // Artifacts
        .route("/api/v1/artifacts", get(rest::artifacts::list_artifacts))
        .route("/api/v1/artifacts/{id}", get(rest::artifacts::get_artifact))
        .route("/api/v1/artifacts/{id}/content", get(rest::artifacts::get_artifact_content))
        .route("/api/v1/artifacts/{id}/approve", post(rest::artifacts::approve_artifact))
        
        // WebSocket for live streaming
        .route("/ws/stream", get(websocket::stream_handler))
        
        // Layers
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

/// Start the API server.
pub async fn start_server(host: &str, port: u16, state: AppState) -> Result<(), Box<dyn std::error::Error>> {
    let addr = format!("{}:{}", host, port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;

    tracing::info!("SWE API server listening on {}", addr);

    axum::serve(listener, create_router(state)).await?;

    Ok(())
}
