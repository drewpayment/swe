//! Settings API endpoints.
//!
//! Reads and writes the platform config file (~/.swe/config.toml).

use axum::{http::StatusCode, Json};
use swe_core::Config;
use swe_core::config::dirs_path;

use super::{ApiResponse, error_response};

/// Get current platform settings.
pub async fn get_settings(
) -> Result<Json<ApiResponse<Config>>, (StatusCode, Json<ApiResponse<()>>)> {
    let config = Config::load_default().map_err(error_response)?;
    Ok(Json(ApiResponse::success(config)))
}

/// Update platform settings.
pub async fn update_settings(
    Json(config): Json<Config>,
) -> Result<Json<ApiResponse<Config>>, (StatusCode, Json<ApiResponse<()>>)> {
    let config_path = dirs_path().join("config.toml");
    config.save(&config_path).map_err(error_response)?;

    // Re-read to confirm what was saved
    let saved = Config::load_default().map_err(error_response)?;
    Ok(Json(ApiResponse::success(saved)))
}
