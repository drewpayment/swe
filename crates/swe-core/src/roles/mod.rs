//! Agent role definitions.
//!
//! This module defines the different types of agents in the SWE platform
//! and their capabilities.

use serde::{Deserialize, Serialize};

/// The role an agent performs in the SWE platform.
///
/// Each role has specific capabilities, tools, and responsibilities.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentRole {
    /// Global orchestrator - manages multiple projects, human interface at platform level
    GlobalOrchestrator,
    /// Project orchestrator - coordinates agents within a single project
    ProjectOrchestrator,
    /// Architect - system design, BDRs, ADRs, API specs
    Architect,
    /// SDET - test plans, UAT, acceptance criteria, test execution
    Sdet,
    /// Coder - implementation, bug fixes, refactoring
    Coder,
    /// Security - threat modeling, audits, SAST review
    Security,
    /// SRE - monitoring, incident response, runbooks
    Sre,
    /// DevOps - CI/CD, IaC, pipeline configuration
    DevOps,
    /// Platform - K8s manifests, networking, cloud provisioning
    Platform,
}

impl AgentRole {
    /// Get a human-readable name for this role.
    pub fn display_name(&self) -> &'static str {
        match self {
            Self::GlobalOrchestrator => "Global Orchestrator",
            Self::ProjectOrchestrator => "Project Orchestrator",
            Self::Architect => "Architect",
            Self::Sdet => "SDET",
            Self::Coder => "Coder",
            Self::Security => "Security",
            Self::Sre => "SRE",
            Self::DevOps => "DevOps",
            Self::Platform => "Platform",
        }
    }

    /// Get an emoji for this role (for display).
    pub fn emoji(&self) -> &'static str {
        match self {
            Self::GlobalOrchestrator => "🎯",
            Self::ProjectOrchestrator => "🎯",
            Self::Architect => "📐",
            Self::Sdet => "🧪",
            Self::Coder => "💻",
            Self::Security => "🔒",
            Self::Sre => "🚨",
            Self::DevOps => "🔧",
            Self::Platform => "☁️",
        }
    }

    /// Check if this role requires a sandbox container for execution.
    pub fn requires_sandbox(&self) -> bool {
        matches!(
            self,
            Self::Sdet | Self::Coder | Self::Security | Self::DevOps | Self::Platform
        )
    }

    /// Check if this is an orchestrator role.
    pub fn is_orchestrator(&self) -> bool {
        matches!(self, Self::GlobalOrchestrator | Self::ProjectOrchestrator)
    }

    /// Get the default tools available to this role.
    pub fn default_tools(&self) -> &'static [&'static str] {
        match self {
            Self::GlobalOrchestrator | Self::ProjectOrchestrator => &[
                "project_create",
                "project_list",
                "agent_spawn",
                "agent_message",
                "work_create",
                "work_assign",
                "artifact_list",
            ],
            Self::Architect => &[
                "file_read",
                "file_write",
                "web_search",
                "diagram_create",
                "doc_render",
            ],
            Self::Sdet => &[
                "file_read",
                "file_write",
                "shell_exec",
                "test_run",
                "coverage_report",
            ],
            Self::Coder => &[
                "file_read",
                "file_write",
                "shell_exec",
                "git_commit",
                "git_push",
                "pr_create",
            ],
            Self::Security => &[
                "file_read",
                "sast_scan",
                "dependency_audit",
                "threat_model",
            ],
            Self::Sre => &[
                "metrics_query",
                "logs_query",
                "alert_manage",
                "runbook_execute",
            ],
            Self::DevOps => &[
                "file_read",
                "file_write",
                "shell_exec",
                "pipeline_run",
                "infra_provision",
            ],
            Self::Platform => &[
                "file_read",
                "file_write",
                "k8s_apply",
                "k8s_get",
                "terraform_plan",
                "terraform_apply",
            ],
        }
    }

    /// Get all agent roles (for iteration).
    pub fn all() -> &'static [AgentRole] {
        &[
            Self::GlobalOrchestrator,
            Self::ProjectOrchestrator,
            Self::Architect,
            Self::Sdet,
            Self::Coder,
            Self::Security,
            Self::Sre,
            Self::DevOps,
            Self::Platform,
        ]
    }

    /// Get MVP agent roles.
    pub fn mvp() -> &'static [AgentRole] {
        &[
            Self::GlobalOrchestrator,
            Self::ProjectOrchestrator,
            Self::Architect,
            Self::Sdet,
            Self::Coder,
        ]
    }
}

impl std::fmt::Display for AgentRole {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.display_name())
    }
}
