package workflows

import (
	"time"

	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"
)

// SandboxWorkflowInput is the input for a sandbox lifecycle workflow.
type SandboxWorkflowInput struct {
	AgentID   string `json:"agent_id"`
	Role      string `json:"role"`
	Namespace string `json:"namespace"`
	Image     string `json:"image"`
	Timeout   int    `json:"timeout_seconds"`
}

// SandboxWorkflow manages the lifecycle of a K8s sandbox (stub).
func SandboxWorkflow(ctx workflow.Context, input SandboxWorkflowInput) error {
	logger := workflow.GetLogger(ctx)
	logger.Info("SandboxWorkflow started", "agent_id", input.AgentID)

	ao := workflow.ActivityOptions{
		StartToCloseTimeout: time.Duration(input.Timeout) * time.Second,
		RetryPolicy: &temporal.RetryPolicy{
			MaximumAttempts: 3,
		},
	}
	ctx = workflow.WithActivityOptions(ctx, ao)

	// Stub: create sandbox, wait for completion, cleanup
	logger.Info("sandbox workflow completed (stub)")
	return nil
}
