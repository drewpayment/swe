// Domain types matching the Rust core types

export type ProjectPhase =
  | "planning"
  | "designing"
  | "building"
  | "testing"
  | "deploying"
  | "complete"
  | "archived";

export type ProjectStatus = "active" | "paused" | "complete" | "cancelled";

export type AgentRole =
  | "global_orchestrator"
  | "project_orchestrator"
  | "architect"
  | "sdet"
  | "coder"
  | "security"
  | "sre"
  | "devops"
  | "platform";

export type AgentStatus =
  | "initializing"
  | "idle"
  | "active"
  | "waiting_for_human"
  | "waiting_for_agent"
  | "complete"
  | "error"
  | "terminated";

export type WorkItemStatus =
  | "pending"
  | "assigned"
  | "in_progress"
  | "in_review"
  | "blocked"
  | "complete"
  | "cancelled";

export type Priority = "low" | "normal" | "high" | "critical";

export type ArtifactType =
  | "bdr"
  | "adr"
  | "api_spec"
  | "design_doc"
  | "test_plan"
  | "acceptance_criteria"
  | "security_audit"
  | "code"
  | "pull_request"
  | "test_results"
  | "diagram"
  | "wireframe"
  | "document"
  | "other";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "not_required";

export interface Project {
  id: string;
  name: string;
  description?: string;
  phase: ProjectPhase;
  status: ProjectStatus;
  repo_url?: string;
  active_agent_ids: string[];
  artifact_ids: string[];
  work_item_ids: string[];
  decisions: string[];
  created_at: string;
  updated_at: string;
  workflow_id?: string;
}

export interface Agent {
  id: string;
  name: string;
  role: AgentRole;
  status: AgentStatus;
  project_id?: string;
  current_work_item_id?: string;
  created_at: string;
  updated_at: string;
  last_heartbeat?: string;
  workflow_id?: string;
  tokens_consumed: number;
}

export interface WorkItem {
  id: string;
  title: string;
  description?: string;
  status: WorkItemStatus;
  priority: Priority;
  project_id: string;
  assigned_agent_id?: string;
  branch_name?: string;
  pr_url?: string;
  created_at: string;
  updated_at: string;
}

export interface Artifact {
  id: string;
  name: string;
  artifact_type: ArtifactType;
  description?: string;
  project_id: string;
  created_by_agent_id: string;
  mime_type: string;
  size_bytes: number;
  approval_status: ApprovalStatus;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Role display helpers
export const ROLE_EMOJI: Record<AgentRole, string> = {
  global_orchestrator: "🎯",
  project_orchestrator: "🎯",
  architect: "📐",
  sdet: "🧪",
  coder: "💻",
  security: "🔒",
  sre: "🚨",
  devops: "🔧",
  platform: "☁️",
};

export const ROLE_LABEL: Record<AgentRole, string> = {
  global_orchestrator: "Global Orchestrator",
  project_orchestrator: "Project Orchestrator",
  architect: "Architect",
  sdet: "SDET",
  coder: "Coder",
  security: "Security",
  sre: "SRE",
  devops: "DevOps",
  platform: "Platform",
};

export const PHASE_LABEL: Record<ProjectPhase, string> = {
  planning: "Planning",
  designing: "Designing",
  building: "Building",
  testing: "Testing",
  deploying: "Deploying",
  complete: "Complete",
  archived: "Archived",
};

export const STATUS_COLOR: Record<AgentStatus, string> = {
  initializing: "text-yellow-500",
  idle: "text-gray-400",
  active: "text-green-500",
  waiting_for_human: "text-blue-500",
  waiting_for_agent: "text-purple-500",
  complete: "text-blue-400",
  error: "text-red-500",
  terminated: "text-gray-600",
};
