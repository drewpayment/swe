//! Status and doctor commands.

use colored::Colorize;

pub async fn execute(api_url: &str) -> anyhow::Result<()> {
    println!("{}", "SWE Platform Status".bold());
    println!("{}", "═".repeat(40));
    println!();
    
    // Check API
    print!("  API Server ({})... ", api_url);
    match reqwest::get(&format!("{}/health", api_url)).await {
        Ok(resp) if resp.status().is_success() => {
            println!("{}", "✅ healthy".green());
        }
        Ok(resp) => {
            println!("{}", format!("⚠️  status {}", resp.status()).yellow());
        }
        Err(_) => {
            println!("{}", "❌ unreachable".red());
        }
    }

    // Stub checks
    println!("  Temporal Server... {}", "❌ not configured".red());
    println!("  LiteLLM Proxy...  {}", "❌ not configured".red());
    println!("  Kubernetes...     {}", "❌ not configured".red());
    println!("  PostgreSQL...     {}", "❌ not configured".red());
    println!("  Redis...          {}", "❌ not configured".red());
    println!();
    println!("  Active Projects:  0");
    println!("  Running Agents:   0");
    println!("  Active Sandboxes: 0");
    
    Ok(())
}

pub async fn doctor() -> anyhow::Result<()> {
    let checks = vec![
        ("Rust", check_command("rustc", &["--version"]).await),
        ("Cargo", check_command("cargo", &["--version"]).await),
        ("Docker/OrbStack", check_command("docker", &["--version"]).await),
        ("kubectl", check_command("kubectl", &["version", "--client", "--short"]).await),
        ("Temporal CLI", check_command("temporal", &["--version"]).await),
        ("Node.js", check_command("node", &["--version"]).await),
        ("Git", check_command("git", &["--version"]).await),
    ];

    for (name, result) in checks {
        match result {
            Ok(version) => println!("  {} {} — {}", "✅".green(), name, version.trim()),
            Err(_) => println!("  {} {} — {}", "❌".red(), name, "not found".red()),
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
