package workflows

import (
	"time"

	"go.temporal.io/sdk/workflow"
)

// OrchestratorWorkflow is the global orchestrator workflow (stub).
func OrchestratorWorkflow(ctx workflow.Context) error {
	logger := workflow.GetLogger(ctx)
	logger.Info("OrchestratorWorkflow started")

	// Stub: wait for signals indefinitely
	signalChan := workflow.GetSignalChannel(ctx, "command")

	for {
		selector := workflow.NewSelector(ctx)

		selector.AddReceive(signalChan, func(c workflow.ReceiveChannel, more bool) {
			var cmd string
			c.Receive(ctx, &cmd)
			logger.Info("orchestrator received command", "command", cmd)
		})

		timerCtx, cancel := workflow.WithCancel(ctx)
		timer := workflow.NewTimer(timerCtx, 1*time.Hour)
		selector.AddFuture(timer, func(f workflow.Future) {})

		selector.Select(ctx)
		cancel()
	}
}
