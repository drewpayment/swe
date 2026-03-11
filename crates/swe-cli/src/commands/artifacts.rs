//! Artifact commands.

use clap::{Args, Subcommand};

#[derive(Args)]
pub struct ArtifactsArgs {
    #[command(subcommand)]
    command: ArtifactsCommand,
}

#[derive(Subcommand)]
enum ArtifactsCommand {
    /// List artifacts
    List {
        #[arg(long)]
        project: Option<String>,
    },
    /// Show artifact details
    Show { id: String },
    /// Export artifact to local file
    Export {
        id: String,
        #[arg(short, long, default_value = ".")]
        output: String,
    },
}

pub async fn execute(args: ArtifactsArgs, api_url: &str) -> anyhow::Result<()> {
    match args.command {
        ArtifactsCommand::List { project } => {
            println!("📄 Artifacts{}\n", project.map(|p| format!(" (project: {})", p)).unwrap_or_default());
            println!("  No artifacts found.");
            println!("[Stub — connect to SWE API at {}]", api_url);
        }
        ArtifactsCommand::Show { id } => {
            println!("📄 Artifact: {}\n", id);
            println!("[Stub — connect to SWE API at {}]", api_url);
        }
        ArtifactsCommand::Export { id, output } => {
            println!("📥 Exporting artifact {} to {}", id, output);
            println!("[Stub — connect to SWE API at {}]", api_url);
        }
    }
    Ok(())
}
