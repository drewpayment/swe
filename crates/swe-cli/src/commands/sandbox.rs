//! Sandbox commands.

use clap::{Args, Subcommand};

#[derive(Args)]
pub struct SandboxArgs {
    #[command(subcommand)]
    command: SandboxCommand,
}

#[derive(Subcommand)]
enum SandboxCommand {
    /// List active sandboxes
    List,
    /// Stream sandbox logs
    Logs { id: String },
    /// Shell into a sandbox
    Exec {
        id: String,
        #[arg(last = true)]
        command: Vec<String>,
    },
}

pub async fn execute(args: SandboxArgs, api_url: &str) -> anyhow::Result<()> {
    match args.command {
        SandboxCommand::List => {
            println!("📦 Active sandboxes:\n");
            println!("  No sandboxes running.");
            println!("[Stub — connect to SWE API at {}]", api_url);
        }
        SandboxCommand::Logs { id } => {
            println!("📋 Logs for sandbox: {}\n", id);
            println!("[Stub — connect to SWE API at {}]", api_url);
        }
        SandboxCommand::Exec { id, command } => {
            let cmd = if command.is_empty() { vec!["bash".to_string()] } else { command };
            println!("🔌 Exec into sandbox {}: {:?}", id, cmd);
            println!("[Stub — connect to SWE API at {}]", api_url);
        }
    }
    Ok(())
}
