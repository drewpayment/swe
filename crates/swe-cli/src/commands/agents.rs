//! Agent commands.

use clap::{Args, Subcommand};

#[derive(Args)]
pub struct AgentsArgs {
    #[command(subcommand)]
    command: AgentsCommand,
}

#[derive(Subcommand)]
enum AgentsCommand {
    /// List all agents
    List {
        /// Filter by project
        #[arg(long)]
        project: Option<String>,
    },
}

pub async fn execute(args: AgentsArgs, api_url: &str) -> anyhow::Result<()> {
    match args.command {
        AgentsCommand::List { project } => {
            println!("🤖 Agents{}\n", project.map(|p| format!(" (project: {})", p)).unwrap_or_default());
            println!("  No agents running.");
            println!("[Stub — connect to SWE API at {}]", api_url);
        }
    }
    Ok(())
}
