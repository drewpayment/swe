package temporal

import (
	"context"
	"log/slog"

	"github.com/drewpayment/swe/internal/config"
	"github.com/drewpayment/swe/internal/db"
	"github.com/drewpayment/swe/internal/temporal/activities"
	"github.com/drewpayment/swe/internal/temporal/workflows"
	"go.temporal.io/sdk/client"
	"go.temporal.io/sdk/worker"
)

// StartWorker connects to Temporal and starts the worker.
func StartWorker(ctx context.Context, cfg config.Config, pool *db.Pool) error {
	slog.Info("connecting to Temporal", "address", cfg.Temporal.Address)

	c, err := client.Dial(client.Options{
		HostPort:  cfg.Temporal.Address,
		Namespace: cfg.Temporal.Namespace,
	})
	if err != nil {
		return err
	}
	defer c.Close()

	w := worker.New(c, cfg.Temporal.TaskQueue, worker.Options{})

	// Register workflows
	w.RegisterWorkflow(workflows.ProjectWorkflow)
	w.RegisterWorkflow(workflows.AgentWorkflow)
	w.RegisterWorkflow(workflows.OrchestratorWorkflow)
	w.RegisterWorkflow(workflows.SandboxWorkflow)

	// Register activities
	act := activities.New(cfg, pool)
	w.RegisterActivity(act.LLMComplete)
	w.RegisterActivity(act.CreateSandbox)
	w.RegisterActivity(act.DeleteSandbox)
	w.RegisterActivity(act.CreateArtifact)
	w.RegisterActivity(act.ExecuteTool)
	w.RegisterActivity(act.BroadcastChat)
	w.RegisterActivity(act.UpdateAgentStatus)
	w.RegisterActivity(act.CreateWorkItem)
	w.RegisterActivity(act.UpdateProjectPhase)
	w.RegisterActivity(act.GetProjectContext)
	w.RegisterActivity(act.CreateAgent)
	w.RegisterActivity(act.AssignWorkItem)
	w.RegisterActivity(act.UpdateWorkItemStatus)
	w.RegisterActivity(act.ListProjectAgents)
	w.RegisterActivity(act.ListWorkItems)
	w.RegisterActivity(act.CreateNotification)

	slog.Info("starting Temporal worker", "taskQueue", cfg.Temporal.TaskQueue)
	return w.Run(worker.InterruptCh())
}
