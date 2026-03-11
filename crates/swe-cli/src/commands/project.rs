//! Project management commands.

use clap::{Args, Subcommand};

#[derive(Args)]
pub struct ProjectArgs {
    #[command(subcommand)]
    command: ProjectCommand,
}

#[derive(Subcommand)]
enum ProjectCommand {
    /// Create a new project
    Init {
        /// Project name
        name: String,
        /// Description
        #[arg(long)]
        description: Option<String>,
        /// Git repository URL
        #[arg(long)]
        repo: Option<String>,
    },
    /// List all projects
    List,
    /// Get project status
    Status {
        /// Project name or ID
        name: String,
    },
    /// Archive a project
    Archive {
        /// Project name or ID
        name: String,
    },
}

pub async fn execute(args: ProjectArgs, api_url: &str) -> anyhow::Result<()> {
    match args.command {
        ProjectCommand::Init { name, description, repo } => {
            println!("✅ Creating project: {}", name);
            if let Some(desc) = &description {
                println!("   Description: {}", desc);
            }
            if let Some(repo) = &repo {
                println!("   Repository: {}", repo);
            }
            // TODO: Call API
            println!("\n[Stub — connect to SWE API at {}]", api_url);
        }
        ProjectCommand::List => {
            println!("📋 Projects:\n");
            println!("  No projects found.\n");
            println!("[Stub — connect to SWE API at {}]", api_url);
        }
        ProjectCommand::Status { name } => {
            println!("📊 Project: {}\n", name);
            println!("[Stub — connect to SWE API at {}]", api_url);
        }
        ProjectCommand::Archive { name } => {
            println!("📦 Archiving project: {}", name);
            println!("[Stub — connect to SWE API at {}]", api_url);
        }
    }
    Ok(())
}
