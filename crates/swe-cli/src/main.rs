//! SWE CLI — Enterprise Agentic Platform
//!
//! The primary CLI interface for the SWE platform.
//! `swe chat` is the conversational front door.

use clap::Parser;
use tracing_subscriber::EnvFilter;

mod commands;
mod output;

use commands::Cli;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("warn")),
        )
        .init();

    let cli = Cli::parse();
    cli.execute().await
}
