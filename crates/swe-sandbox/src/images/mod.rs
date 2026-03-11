//! Sandbox image management.

use swe_core::AgentRole;

/// Get the Docker image name for an agent role.
pub fn image_for_role(role: AgentRole) -> &'static str {
    match role {
        AgentRole::Coder => "ghcr.io/drewpayment/swe-sandbox-coder:latest",
        AgentRole::Sdet => "ghcr.io/drewpayment/swe-sandbox-sdet:latest",
        AgentRole::Security => "ghcr.io/drewpayment/swe-sandbox-security:latest",
        AgentRole::DevOps | AgentRole::Platform => "ghcr.io/drewpayment/swe-sandbox-devops:latest",
        _ => "ghcr.io/drewpayment/swe-sandbox-base:latest",
    }
}

/// Available sandbox images and their descriptions.
pub fn available_images() -> Vec<(&'static str, &'static str)> {
    vec![
        ("swe-sandbox-base", "Base image with common tools (git, curl, etc.)"),
        ("swe-sandbox-coder", "Coding sandbox with language runtimes"),
        ("swe-sandbox-sdet", "Testing sandbox with test frameworks"),
        ("swe-sandbox-security", "Security scanning sandbox"),
        ("swe-sandbox-devops", "DevOps sandbox with IaC tools"),
    ]
}
