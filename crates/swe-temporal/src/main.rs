use temporalio_client::{Client, ClientOptions, Connection, ConnectionOptions};
use temporalio_sdk::{Worker, WorkerOptions};
use temporalio_sdk_core::{CoreRuntime, RuntimeOptions, Url};
use tracing_subscriber::EnvFilter;
use std::str::FromStr;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .init();

    let temporal_address =
        std::env::var("TEMPORAL_ADDRESS").unwrap_or_else(|_| "http://localhost:7233".to_string());
    let task_queue =
        std::env::var("TEMPORAL_TASK_QUEUE").unwrap_or_else(|_| "swe-workers".to_string());

    tracing::info!(
        "SWE Worker starting, connecting to Temporal at {}",
        temporal_address
    );

    let runtime = CoreRuntime::new_assume_tokio(RuntimeOptions::builder().build()?)?;

    let connection = Connection::connect(
        ConnectionOptions::new(Url::from_str(&temporal_address)?).build(),
    )
    .await?;
    let client = Client::new(connection, ClientOptions::new("default").build())?;

    tracing::info!("Connected to Temporal, registering on queue: {}", task_queue);

    let worker_options = WorkerOptions::new(&task_queue)
        .build();

    tracing::info!("SWE Worker running");
    Worker::new(&runtime, client, worker_options)?.run().await?;

    Ok(())
}
