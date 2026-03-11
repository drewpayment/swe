//! Work item commands.

use clap::{Args, Subcommand};

#[derive(Args)]
pub struct WorkArgs {
    #[command(subcommand)]
    command: WorkCommand,
}

#[derive(Subcommand)]
enum WorkCommand {
    /// Create a work item
    Create {
        /// Title
        title: String,
        /// Project name or ID
        #[arg(long)]
        project: String,
        /// Priority (low, normal, high, critical)
        #[arg(long, default_value = "normal")]
        priority: String,
    },
    /// List work items
    List {
        /// Filter by project
        #[arg(long)]
        project: Option<String>,
    },
    /// Show work item details
    Show {
        /// Work item ID
        id: String,
    },
}

pub async fn execute(args: WorkArgs, api_url: &str) -> anyhow::Result<()> {
    match args.command {
        WorkCommand::Create { title, project, priority } => {
            println!("✅ Created work item: \"{}\" (project: {}, priority: {})", title, project, priority);
            println!("[Stub — connect to SWE API at {}]", api_url);
        }
        WorkCommand::List { project } => {
            println!("📋 Work items{}\n", project.map(|p| format!(" (project: {})", p)).unwrap_or_default());
            println!("  No work items found.");
            println!("[Stub — connect to SWE API at {}]", api_url);
        }
        WorkCommand::Show { id } => {
            println!("📋 Work item: {}\n", id);
            println!("[Stub — connect to SWE API at {}]", api_url);
        }
    }
    Ok(())
}
