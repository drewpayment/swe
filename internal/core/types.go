package core

import (
	"time"
)

// ProjectPhase represents the lifecycle phase of a project.
type ProjectPhase string

const (
	PhasePlanning  ProjectPhase = "planning"
	PhaseDesigning ProjectPhase = "designing"
	PhaseBuilding  ProjectPhase = "building"
	PhaseTesting   ProjectPhase = "testing"
	PhaseDeploying ProjectPhase = "deploying"
	PhaseComplete  ProjectPhase = "complete"
	PhaseArchived  ProjectPhase = "archived"
)

// ProjectStatus represents the current status of a project.
type ProjectStatus string

const (
	StatusActive    ProjectStatus = "active"
	StatusPaused    ProjectStatus = "paused"
	StatusComplete  ProjectStatus = "complete"
	StatusCancelled ProjectStatus = "cancelled"
)

// AgentRole represents the role an agent plays.
type AgentRole string

const (
	RoleGlobalOrchestrator  AgentRole = "global_orchestrator"
	RoleProjectOrchestrator AgentRole = "project_orchestrator"
	RoleArchitect           AgentRole = "architect"
	RoleSdet                AgentRole = "sdet"
	RoleCoder               AgentRole = "coder"
	RoleSecurity            AgentRole = "security"
	RoleSre                 AgentRole = "sre"
	RoleDevOps              AgentRole = "devops"
	RolePlatform            AgentRole = "platform"
)

// DisplayName returns a human-readable name for the role.
func (r AgentRole) DisplayName() string {
	switch r {
	case RoleGlobalOrchestrator:
		return "Global Orchestrator"
	case RoleProjectOrchestrator:
		return "Project Orchestrator"
	case RoleArchitect:
		return "Architect"
	case RoleSdet:
		return "SDET"
	case RoleCoder:
		return "Coder"
	case RoleSecurity:
		return "Security"
	case RoleSre:
		return "SRE"
	case RoleDevOps:
		return "DevOps"
	case RolePlatform:
		return "Platform"
	default:
		return string(r)
	}
}

// RequiresSandbox returns whether this role needs a K8s sandbox.
func (r AgentRole) RequiresSandbox() bool {
	switch r {
	case RoleSdet, RoleCoder, RoleSecurity, RoleDevOps, RolePlatform:
		return true
	default:
		return false
	}
}

// IsOrchestrator returns whether this role is an orchestrator.
func (r AgentRole) IsOrchestrator() bool {
	return r == RoleGlobalOrchestrator || r == RoleProjectOrchestrator
}

// DefaultTools returns the default tool set for this role.
func (r AgentRole) DefaultTools() []string {
	switch r {
	case RoleGlobalOrchestrator, RoleProjectOrchestrator:
		return []string{"project_create", "project_list", "agent_spawn", "agent_message", "work_create", "work_assign", "artifact_list"}
	case RoleArchitect:
		return []string{"file_read", "file_write", "web_search", "diagram_create", "doc_render"}
	case RoleSdet:
		return []string{"file_read", "file_write", "shell_exec", "test_run", "coverage_report"}
	case RoleCoder:
		return []string{"file_read", "file_write", "shell_exec", "git_commit", "git_push", "pr_create"}
	case RoleSecurity:
		return []string{"file_read", "sast_scan", "dependency_audit", "threat_model"}
	case RoleSre:
		return []string{"metrics_query", "logs_query", "alert_manage", "runbook_execute"}
	case RoleDevOps:
		return []string{"file_read", "file_write", "shell_exec", "pipeline_run", "infra_provision"}
	case RolePlatform:
		return []string{"file_read", "file_write", "k8s_apply", "k8s_get", "terraform_plan", "terraform_apply"}
	default:
		return nil
	}
}

// AgentStatus represents the current status of an agent.
type AgentStatus string

const (
	AgentInitializing    AgentStatus = "initializing"
	AgentIdle            AgentStatus = "idle"
	AgentActive          AgentStatus = "active"
	AgentWaitingForHuman AgentStatus = "waiting_for_human"
	AgentWaitingForAgent AgentStatus = "waiting_for_agent"
	AgentComplete        AgentStatus = "complete"
	AgentError           AgentStatus = "error"
	AgentTerminated      AgentStatus = "terminated"
)

// WorkItemStatus represents the status of a work item.
type WorkItemStatus string

const (
	WorkPending    WorkItemStatus = "pending"
	WorkAssigned   WorkItemStatus = "assigned"
	WorkInProgress WorkItemStatus = "in_progress"
	WorkInReview   WorkItemStatus = "in_review"
	WorkBlocked    WorkItemStatus = "blocked"
	WorkComplete   WorkItemStatus = "complete"
	WorkCancelled  WorkItemStatus = "cancelled"
)

// Priority represents work item priority.
type Priority string

const (
	PriorityLow      Priority = "low"
	PriorityNormal   Priority = "normal"
	PriorityHigh     Priority = "high"
	PriorityCritical Priority = "critical"
)

// ArtifactType represents the type of artifact.
type ArtifactType string

const (
	ArtifactBDR                ArtifactType = "bdr"
	ArtifactADR                ArtifactType = "adr"
	ArtifactAPISpec            ArtifactType = "api_spec"
	ArtifactDesignDoc          ArtifactType = "design_doc"
	ArtifactTestPlan           ArtifactType = "test_plan"
	ArtifactAcceptanceCriteria ArtifactType = "acceptance_criteria"
	ArtifactSecurityAudit      ArtifactType = "security_audit"
	ArtifactCode               ArtifactType = "code"
	ArtifactPullRequest        ArtifactType = "pull_request"
	ArtifactTestResults        ArtifactType = "test_results"
	ArtifactDiagram            ArtifactType = "diagram"
	ArtifactWireframe          ArtifactType = "wireframe"
	ArtifactDocument           ArtifactType = "document"
	ArtifactOther              ArtifactType = "other"
)

// ApprovalStatus represents artifact approval state.
type ApprovalStatus string

const (
	ApprovalPending     ApprovalStatus = "pending"
	ApprovalApproved    ApprovalStatus = "approved"
	ApprovalRejected    ApprovalStatus = "rejected"
	ApprovalNotRequired ApprovalStatus = "not_required"
)

// Project represents an engineering project.
type Project struct {
	ID               string        `json:"id" db:"id"`
	Name             string        `json:"name" db:"name"`
	Description      *string       `json:"description,omitempty" db:"description"`
	Phase            ProjectPhase  `json:"phase" db:"phase"`
	Status           ProjectStatus `json:"status" db:"status"`
	RepoURL          *string       `json:"repo_url,omitempty" db:"repo_url"`
	WorkingDirectory *string       `json:"working_directory,omitempty" db:"working_directory"`
	RepoSource       string        `json:"repo_source" db:"repo_source"`
	ActiveAgentIDs   []string      `json:"active_agent_ids"`
	ArtifactIDs      []string      `json:"artifact_ids"`
	Decisions        []string      `json:"decisions"`
	WorkflowID       *string       `json:"workflow_id,omitempty" db:"workflow_id"`
	InitialPrompt    *string       `json:"initial_prompt,omitempty" db:"initial_prompt"`
	CreatedAt        time.Time     `json:"created_at" db:"created_at"`
	UpdatedAt        time.Time     `json:"updated_at" db:"updated_at"`
}

// Agent represents an AI agent.
type Agent struct {
	ID                  string      `json:"id" db:"id"`
	Name                string      `json:"name" db:"name"`
	Role                AgentRole   `json:"role" db:"role"`
	Status              AgentStatus `json:"status" db:"status"`
	ProjectID           *string     `json:"project_id,omitempty" db:"project_id"`
	CurrentWorkItemID   *string     `json:"current_work_item_id,omitempty" db:"current_work_item_id"`
	ConversationHistory []string    `json:"conversation_history"`
	Context             *string     `json:"context,omitempty" db:"context"`
	CreatedAt           time.Time   `json:"created_at" db:"created_at"`
	UpdatedAt           time.Time   `json:"updated_at" db:"updated_at"`
	LastHeartbeat       *time.Time  `json:"last_heartbeat,omitempty" db:"last_heartbeat"`
	WorkflowID          *string     `json:"workflow_id,omitempty" db:"workflow_id"`
	SandboxID           *string     `json:"sandbox_id,omitempty" db:"sandbox_id"`
	TokensConsumed      int64       `json:"tokens_consumed" db:"tokens_consumed"`
}

// WorkItem represents a unit of work.
type WorkItem struct {
	ID              string         `json:"id" db:"id"`
	Title           string         `json:"title" db:"title"`
	Description     *string        `json:"description,omitempty" db:"description"`
	Status          WorkItemStatus `json:"status" db:"status"`
	Priority        Priority       `json:"priority" db:"priority"`
	ProjectID       string         `json:"project_id" db:"project_id"`
	AssignedAgentID *string        `json:"assigned_agent_id,omitempty" db:"assigned_agent_id"`
	ArtifactIDs     []string       `json:"artifact_ids"`
	DependsOn       []string       `json:"depends_on"`
	Blocks          []string       `json:"blocks"`
	BranchName      *string        `json:"branch_name,omitempty" db:"branch_name"`
	PrURL           *string        `json:"pr_url,omitempty" db:"pr_url"`
	CreatedAt       time.Time      `json:"created_at" db:"created_at"`
	UpdatedAt       time.Time      `json:"updated_at" db:"updated_at"`
	StartedAt       *time.Time     `json:"started_at,omitempty" db:"started_at"`
	CompletedAt     *time.Time     `json:"completed_at,omitempty" db:"completed_at"`
}

// Artifact represents a deliverable produced by an agent.
type Artifact struct {
	ID                string         `json:"id" db:"id"`
	Name              string         `json:"name" db:"name"`
	ArtifactType      ArtifactType   `json:"artifact_type" db:"artifact_type"`
	Description       *string        `json:"description,omitempty" db:"description"`
	ProjectID         string         `json:"project_id" db:"project_id"`
	WorkItemID        *string        `json:"work_item_id,omitempty" db:"work_item_id"`
	CreatedByAgentID  string         `json:"created_by_agent_id" db:"created_by_agent_id"`
	Content           *string        `json:"content,omitempty" db:"content"`
	StorageURL        *string        `json:"storage_url,omitempty" db:"storage_url"`
	MimeType          string         `json:"mime_type" db:"mime_type"`
	SizeBytes         int64          `json:"size_bytes" db:"size_bytes"`
	ApprovalStatus    ApprovalStatus `json:"approval_status" db:"approval_status"`
	ApprovedBy        *string        `json:"approved_by,omitempty" db:"approved_by"`
	ApprovalComment   *string        `json:"approval_comment,omitempty" db:"approval_comment"`
	Version           int            `json:"version" db:"version"`
	PreviousVersionID *string        `json:"previous_version_id,omitempty" db:"previous_version_id"`
	CreatedAt         time.Time      `json:"created_at" db:"created_at"`
	UpdatedAt         time.Time      `json:"updated_at" db:"updated_at"`
}

// CreateProjectRequest is the payload for creating a project.
type CreateProjectRequest struct {
	Name          string  `json:"name"`
	Description   *string `json:"description,omitempty"`
	RepoURL          *string `json:"repo_url,omitempty"`
	WorkingDirectory *string `json:"working_directory,omitempty"`
	InitialPrompt    *string `json:"initial_prompt,omitempty"`
}

// CreateWorkItemRequest is the payload for creating a work item.
type CreateWorkItemRequest struct {
	Title       string   `json:"title"`
	Description *string  `json:"description,omitempty"`
	Priority    Priority `json:"priority"`
	ProjectID   string   `json:"project_id"`
}

// CreateAgentRequest is the payload for creating an agent.
type CreateAgentRequest struct {
	Name      string  `json:"name"`
	Role      string  `json:"role"`
	ProjectID *string `json:"project_id,omitempty"`
}

// SendMessageRequest is the payload for sending a message to an agent.
type SendMessageRequest struct {
	Content string `json:"content"`
}

// ApproveArtifactRequest is the payload for approving/rejecting an artifact.
type ApproveArtifactRequest struct {
	Approved bool    `json:"approved"`
	Comment  *string `json:"comment,omitempty"`
	By       string  `json:"by"`
}

// ChatMessage represents a persisted chat message.
type ChatMessage struct {
	ID        string    `json:"id" db:"id"`
	ProjectID string    `json:"project_id" db:"project_id"`
	AgentID   *string   `json:"agent_id,omitempty" db:"agent_id"`
	Role      string    `json:"role" db:"role"` // "user", "assistant", "system"
	Content   string    `json:"content" db:"content"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
}

// NotificationType represents the kind of notification.
type NotificationType string

const (
	NotifActionNeeded    NotificationType = "action_needed"
	NotifStatusUpdate    NotificationType = "status_update"
	NotifApprovalRequest NotificationType = "approval_request"
	NotifInfo            NotificationType = "info"
)

// Notification represents a notification from the system to a human.
type Notification struct {
	ID        string           `json:"id" db:"id"`
	ProjectID string           `json:"project_id" db:"project_id"`
	AgentID   *string          `json:"agent_id,omitempty" db:"agent_id"`
	Type      NotificationType `json:"type" db:"type"`
	Priority  string           `json:"priority" db:"priority"`
	Title     string           `json:"title" db:"title"`
	Body      string           `json:"body" db:"body"`
	Read      bool             `json:"read" db:"read"`
	ActionURL *string          `json:"action_url,omitempty" db:"action_url"`
	CreatedAt time.Time        `json:"created_at" db:"created_at"`
}
