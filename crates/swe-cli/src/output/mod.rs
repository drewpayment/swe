//! Output formatting for the CLI.

use colored::Colorize;

/// Print the SWE banner.
pub fn print_banner() {
    println!();
    println!("{}", "  ███████╗██╗    ██╗███████╗".cyan());
    println!("{}", "  ██╔════╝██║    ██║██╔════╝".cyan());
    println!("{}", "  ███████╗██║ █╗ ██║█████╗  ".cyan());
    println!("{}", "  ╚════██║██║███╗██║██╔══╝  ".cyan());
    println!("{}", "  ███████║╚███╔███╔╝███████╗".cyan());
    println!("{}", "  ╚══════╝ ╚══╝╚══╝ ╚══════╝".cyan());
    println!();
    println!("  {} {}", "SWE".bold(), format!("v{}", env!("CARGO_PKG_VERSION")).dimmed());
    println!("  {}", "Enterprise Agentic Platform".dimmed());
    println!();
}

/// Format a status badge.
pub fn status_badge(status: &str) -> String {
    match status.to_lowercase().as_str() {
        "active" | "running" | "healthy" => format!("{}", status.green()),
        "idle" | "pending" | "planning" => format!("{}", status.yellow()),
        "error" | "failed" | "terminated" => format!("{}", status.red()),
        "complete" | "completed" => format!("{}", status.blue()),
        _ => status.to_string(),
    }
}
