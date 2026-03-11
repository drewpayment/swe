//! Run command — one-liner project kickoff.

use clap::Args;

/// Kick off a full project from a single prompt.
#[derive(Args)]
pub struct RunArgs {
    /// Project prompt
    pub prompt: String,
    /// Git repository URL
    #[arg(long)]
    pub repo: Option<String>,
    /// Agent types to use (comma-separated)
    #[arg(long)]
    pub agents: Option<String>,
    /// Model to use
    #[arg(long)]
    pub model: Option<String>,
    /// Skip human checkpoints
    #[arg(long)]
    pub approve_all: bool,
}

pub async fn execute(args: RunArgs, api_url: &str) -> anyhow::Result<()> {
    println!("🚀 Starting project from prompt...\n");
    println!("  Prompt: {}", args.prompt);
    if let Some(repo) = &args.repo {
        println!("  Repo: {}", repo);
    }
    if let Some(agents) = &args.agents {
        println!("  Agents: {}", agents);
    }
    if args.approve_all {
        println!("  Mode: YOLO (auto-approve all checkpoints)");
    }
    println!();

    // TODO: Create project via API, start orchestrator
    println!("[Run is a stub — connect to SWE API at {} to enable]", api_url);

    Ok(())
}
