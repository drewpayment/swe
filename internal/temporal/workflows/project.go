package workflows

import (
	"time"

	"go.temporal.io/sdk/workflow"
)

// ProjectWorkflowInput is the input for a project workflow.
type ProjectWorkflowInput struct {
	ProjectID     string  `json:"project_id"`
	Name          string  `json:"name"`
	Description   *string `json:"description,omitempty"`
	RepoURL       *string `json:"repo_url,omitempty"`
	InitialPrompt *string `json:"initial_prompt,omitempty"`
}

// ProjectWorkflowOutput is the output of a project workflow.
type ProjectWorkflowOutput struct {
	ProjectID   string   `json:"project_id"`
	Summary     string   `json:"summary"`
	ArtifactIDs []string `json:"artifact_ids"`
}

// ProjectWorkflow manages the lifecycle of a project.
func ProjectWorkflow(ctx workflow.Context, input ProjectWorkflowInput) (*ProjectWorkflowOutput, error) {
	logger := workflow.GetLogger(ctx)
	logger.Info("ProjectWorkflow started", "project_id", input.ProjectID)

	// Set up query handler for status
	var currentPhase string = "planning"
	err := workflow.SetQueryHandler(ctx, "status", func() (map[string]any, error) {
		return map[string]any{
			"project_id": input.ProjectID,
			"phase":      currentPhase,
			"status":     "running",
		}, nil
	})
	if err != nil {
		return nil, err
	}

	// Wait for signals (advance_phase, human_input, abort)
	signalChan := workflow.GetSignalChannel(ctx, "advance_phase")
	abortChan := workflow.GetSignalChannel(ctx, "abort")

	for {
		selector := workflow.NewSelector(ctx)

		selector.AddReceive(signalChan, func(c workflow.ReceiveChannel, more bool) {
			var nextPhase string
			c.Receive(ctx, &nextPhase)
			logger.Info("advancing phase", "from", currentPhase, "to", nextPhase)
			currentPhase = nextPhase
		})

		selector.AddReceive(abortChan, func(c workflow.ReceiveChannel, more bool) {
			var reason string
			c.Receive(ctx, &reason)
			logger.Info("project aborted", "reason", reason)
			currentPhase = "archived"
		})

		// Timeout to check if we should complete
		timerCtx, cancel := workflow.WithCancel(ctx)
		timer := workflow.NewTimer(timerCtx, 24*time.Hour)
		selector.AddFuture(timer, func(f workflow.Future) {
			// Periodic check
		})

		selector.Select(ctx)
		cancel()

		if currentPhase == "complete" || currentPhase == "archived" {
			break
		}
	}

	return &ProjectWorkflowOutput{
		ProjectID:   input.ProjectID,
		Summary:     "Project completed",
		ArtifactIDs: []string{},
	}, nil
}
