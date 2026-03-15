package main

import (
	"context"
	"log/slog"
	"os"

	"github.com/drewpayment/swe/internal/config"
	"github.com/drewpayment/swe/internal/db"
	"github.com/drewpayment/swe/internal/temporal"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	})))

	cfg := config.LoadFromEnv()

	ctx := context.Background()

	pool, err := db.New(ctx, cfg.Database.URL, int32(cfg.Database.MaxConnections))
	if err != nil {
		slog.Error("failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	if err := temporal.StartWorker(ctx, cfg, pool); err != nil {
		slog.Error("worker failed", "error", err)
		os.Exit(1)
	}
}
