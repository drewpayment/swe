//! CLI command definitions.

mod agents;
mod artifacts;
mod chat;
mod config;
mod project;
mod run;
mod sandbox;
mod status;
mod work;

use clap::{Parser, Subcommand};

use crate::output::print_banner;

/// SWE — Enterprise Agentic Platform
#[derive(Parser)]
#[command(name = "swe", version, about = "Enterprise agentic platform built on Rust + Temporal")]
pub struct Cli {
    #[command(subcommand)]
    command: Commands,

    /// API server URL
    #[arg(long, env = "SWE_API_URL", default_value = "http://localhost:8080")]
    api_url: String,
}

#[derive(Subcommand)]
enum Commands {
    /// Start platform services
    Up,
    /// Stop platform services
    Down,
    /// Platform health and active projects
    Status,
    /// Validate dependencies and connectivity
    Doctor,
    /// Open a chat session (the front door)
    Chat(chat::ChatArgs),
    /// Kick off a full project from a single prompt
    Run(run::RunArgs),
    /// Project management
    Project(project::ProjectArgs),
    /// Work item management
    Work(work::WorkArgs),
    /// Agent interaction
    Agents(agents::AgentsArgs),
    /// Artifact management
    Artifacts(artifacts::ArtifactsArgs),
    /// Sandbox management
    Sandbox(sandbox::SandboxArgs),
    /// Configuration management
    Config(config::ConfigArgs),
}

impl Cli {
    pub async fn execute(self) -> anyhow::Result<()> {
        let api_url = self.api_url;

        match self.command {
            Commands::Up => {
                print_banner();
                println!("Starting SWE platform services...");
                println!("  → Temporal server");
                println!("  → SWE API");
                println!("  → SWE Worker");
                println!("  → LiteLLM proxy");
                println!();
                println!("Run `swe status` to check health.");
                // TODO: docker-compose up
                Ok(())
            }
            Commands::Down => {
                println!("Stopping SWE platform services...");
                // TODO: docker-compose down
                Ok(())
            }
            Commands::Status => status::execute(&api_url).await,
            Commands::Doctor => {
                println!("🩺 Running system checks...\n");
                status::doctor().await
            }
            Commands::Chat(args) => chat::execute(args, &api_url).await,
            Commands::Run(args) => run::execute(args, &api_url).await,
            Commands::Project(args) => project::execute(args, &api_url).await,
            Commands::Work(args) => work::execute(args, &api_url).await,
            Commands::Agents(args) => agents::execute(args, &api_url).await,
            Commands::Artifacts(args) => artifacts::execute(args, &api_url).await,
            Commands::Sandbox(args) => sandbox::execute(args, &api_url).await,
            Commands::Config(args) => config::execute(args).await,
        }
    }
}
