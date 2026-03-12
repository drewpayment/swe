//! Database connection pool and helpers.

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
