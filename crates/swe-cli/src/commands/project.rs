//! Project management commands.

use clap::{Args, Subcommand};
use serde_json::{json, Value};

use crate::api_client::ApiClient;

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
    let client = ApiClient::new(api_url);

    match args.command {
        ProjectCommand::Init {
            name,
            description,
            repo,
        } => {
            let body = json!({
                "name": name,
                "description": description.unwrap_or_default(),
                "repo_url": repo.unwrap_or_default(),
            });
            let resp = client
                .post::<Value, Value>("/api/v1/projects", &body)
                .await?;
            if resp.success {
                println!("Project '{}' created successfully.", name);
                if let Some(data) = resp.data {
                    if let Some(id) = data.get("id").and_then(|v| v.as_str()) {
                        println!("  ID: {}", id);
                    }
                }
            } else {
                eprintln!(
                    "Failed to create project: {}",
                    resp.error.unwrap_or_else(|| "unknown error".into())
                );
            }
        }
        ProjectCommand::List => {
            let resp = client.get::<Value>("/api/v1/projects").await?;
            if resp.success {
                let projects = resp
                    .data
                    .as_ref()
                    .and_then(|d| d.as_array())
                    .cloned()
                    .unwrap_or_default();
                if projects.is_empty() {
                    println!("No projects found.");
                } else {
                    println!(
                        "{:<38}  {:<20}  {:<12}  {:<10}",
                        "ID", "NAME", "PHASE", "STATUS"
                    );
                    println!("{}", "-".repeat(84));
                    for p in &projects {
                        let id = p.get("id").and_then(|v| v.as_str()).unwrap_or("-");
                        let name = p.get("name").and_then(|v| v.as_str()).unwrap_or("-");
                        let phase = p.get("phase").and_then(|v| v.as_str()).unwrap_or("-");
                        let status = p.get("status").and_then(|v| v.as_str()).unwrap_or("-");
                        println!("{:<38}  {:<20}  {:<12}  {:<10}", id, name, phase, status);
                    }
                    println!("\n{} project(s)", projects.len());
                }
            } else {
                eprintln!(
                    "Failed to list projects: {}",
                    resp.error.unwrap_or_else(|| "unknown error".into())
                );
            }
        }
        ProjectCommand::Status { name } => {
            let resp = client
                .get::<Value>(&format!("/api/v1/projects/{}/status", name))
                .await?;
            if resp.success {
                if let Some(data) = resp.data {
                    println!("{}", serde_json::to_string_pretty(&data)?);
                } else {
                    println!("No status data returned.");
                }
            } else {
                eprintln!(
                    "Failed to get project status: {}",
                    resp.error.unwrap_or_else(|| "unknown error".into())
                );
            }
        }
        ProjectCommand::Archive { name } => {
            let resp = client
                .delete::<Value>(&format!("/api/v1/projects/{}", name))
                .await?;
            if resp.success {
                println!("Project '{}' archived.", name);
            } else {
                eprintln!(
                    "Failed to archive project: {}",
                    resp.error.unwrap_or_else(|| "unknown error".into())
                );
            }
        }
    }
    Ok(())
}
