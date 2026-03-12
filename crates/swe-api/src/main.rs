use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .init();

    let host = std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8080);

    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://swe:swe@localhost:5432/swe".to_string());

    let db = swe_core::db::connect(&database_url, 10).await?;
    let state = swe_api::AppState { db };

    swe_api::start_server(&host, port, state).await
}
