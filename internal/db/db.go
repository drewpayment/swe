package db

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Pool wraps pgxpool.Pool for database operations.
type Pool struct {
	*pgxpool.Pool
}

// New creates a new database connection pool.
func New(ctx context.Context, databaseURL string, maxConns int32) (*Pool, error) {
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parsing database URL: %w", err)
	}
	config.MaxConns = maxConns

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("creating connection pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("pinging database: %w", err)
	}

	return &Pool{pool}, nil
}
