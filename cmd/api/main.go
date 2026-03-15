package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/drewpayment/swe/internal/api"
	"github.com/drewpayment/swe/internal/config"
	"github.com/drewpayment/swe/internal/db"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	})))

	cfg := config.LoadFromEnv()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	pool, err := db.New(ctx, cfg.Database.URL, int32(cfg.Database.MaxConnections))
	if err != nil {
		slog.Error("failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	srv := api.New(pool, cfg)

	// Graceful shutdown
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		slog.Info("shutting down")
		cancel()
		srv.Shutdown(ctx)
		os.Exit(0)
	}()

	if err := srv.ListenAndServe(); err != nil {
		slog.Error("server error", "error", err)
		os.Exit(1)
	}
}
