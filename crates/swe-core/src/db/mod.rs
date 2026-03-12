//! Database connection pool and helpers.

pub mod agents;
pub mod artifacts;
pub mod projects;
pub mod work_items;

use sqlx::postgres::PgPoolOptions;

pub type Pool = sqlx::PgPool;

/// Create a database connection pool.
pub async fn connect(database_url: &str, max_connections: u32) -> crate::Result<Pool> {
    PgPoolOptions::new()
        .max_connections(max_connections)
        .connect(database_url)
        .await
        .map_err(|e| crate::Error::Internal(format!("Database connection failed: {e}")))
}
