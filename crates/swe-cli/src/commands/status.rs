//! Status and doctor commands.

use colored::Colorize;
use serde_json::Value;

use crate::api_client::ApiClient;

pub async fn execute(api_url: &str) -> anyhow::Result<()> {
    println!("{}", "SWE Platform Status".bold());
    println!("{}", "=".repeat(40));
    println!();

    let client = ApiClient::new(api_url);

    // Check API health
    print!("  API Server ({})... ", api_url);
    match client.health().await {
        Ok(true) => println!("{}", "UP".green()),
        _ => println!("{}", "DOWN".red()),
    }

    // Count projects
    let project_count = match client.get::<Value>("/api/v1/projects").await {
        Ok(resp) if resp.success => resp
            .data
            .as_ref()
            .and_then(|d| d.as_array())
            .map(|a| a.len())
            .unwrap_or(0),
        _ => 0,
    };

    // Count agents
    let agent_count = match client.get::<Value>("/api/v1/agents").await {
        Ok(resp) if resp.success => resp
            .data
            .as_ref()
            .and_then(|d| d.as_array())
            .map(|a| a.len())
            .unwrap_or(0),
        _ => 0,
    };

    println!();
    println!("  Active Projects:  {}", project_count);
    println!("  Running Agents:   {}", agent_count);

    Ok(())
}

pub async fn doctor() -> anyhow::Result<()> {
    let checks = vec![
        ("Docker", check_command("docker", &["--version"]).await),
        (
            "Docker Compose",
            check_command("docker", &["compose", "version"]).await,
        ),
        (
            "kubectl",
            check_command("kubectl", &["version", "--client", "--short"]).await,
        ),
        ("Rust", check_command("rustc", &["--version"]).await),
        ("Cargo", check_command("cargo", &["--version"]).await),
        (
            "Temporal CLI",
            check_command("temporal", &["--version"]).await,
        ),
        ("Node.js", check_command("node", &["--version"]).await),
        ("Git", check_command("git", &["--version"]).await),
    ];

    for (name, result) in checks {
        match result {
            Ok(version) => println!(
                "  {} {} -- {}",
                "OK".green(),
                name,
                version.trim()
            ),
            Err(_) => println!(
                "  {} {} -- {}",
                "MISSING".red(),
                name,
                "not found".red()
            ),
        }
    }

    println!();
    Ok(())
}

async fn check_command(cmd: &str, args: &[&str]) -> Result<String, String> {
    tokio::process::Command::new(cmd)
        .args(args)
        .output()
        .await
        .map_err(|e| e.to_string())
        .and_then(|o| {
            if o.status.success() {
                Ok(String::from_utf8_lossy(&o.stdout).to_string())
            } else {
                Err("command failed".to_string())
            }
        })
}
