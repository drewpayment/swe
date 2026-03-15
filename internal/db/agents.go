package db

import (
	"context"
	"time"

	"github.com/drewpayment/swe/internal/core"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// ListAgents returns agents, optionally filtered by project ID.
func (p *Pool) ListAgents(ctx context.Context, projectID *string) ([]core.Agent, error) {
	var rows pgx.Rows
	var err error

	if projectID != nil {
		rows, err = p.Query(ctx, `
			SELECT id, name, role, status, project_id, current_work_item_id, context,
				workflow_id, sandbox_id, tokens_consumed, last_heartbeat, created_at, updated_at
			FROM agents WHERE project_id = $1 ORDER BY created_at DESC
		`, *projectID)
	} else {
		rows, err = p.Query(ctx, `
			SELECT id, name, role, status, project_id, current_work_item_id, context,
				workflow_id, sandbox_id, tokens_consumed, last_heartbeat, created_at, updated_at
			FROM agents ORDER BY created_at DESC
		`)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanAgents(rows)
}

// GetAgent returns an agent by ID.
func (p *Pool) GetAgent(ctx context.Context, id string) (*core.Agent, error) {
	row := p.QueryRow(ctx, `
		SELECT id, name, role, status, project_id, current_work_item_id, context,
			workflow_id, sandbox_id, tokens_consumed, last_heartbeat, created_at, updated_at
		FROM agents WHERE id = $1
	`, id)

	agent, err := scanAgent(row)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, core.ErrAgentNotFound
		}
		return nil, err
	}
	return agent, nil
}

// InsertAgent creates a new agent.
func (p *Pool) InsertAgent(ctx context.Context, name string, role core.AgentRole, projectID *string) (*core.Agent, error) {
	id := uuid.New().String()
	now := time.Now().UTC()

	_, err := p.Exec(ctx, `
		INSERT INTO agents (id, name, role, status, project_id, tokens_consumed, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, 0, $6, $7)
	`, id, name, role, core.AgentInitializing, projectID, now, now)
	if err != nil {
		return nil, err
	}

	return p.GetAgent(ctx, id)
}

// UpdateAgentWorkflowID sets the workflow ID on an agent.
func (p *Pool) UpdateAgentWorkflowID(ctx context.Context, id string, workflowID string) error {
	_, err := p.Exec(ctx, `
		UPDATE agents SET workflow_id = $1, updated_at = $2 WHERE id = $3
	`, workflowID, time.Now().UTC(), id)
	return err
}

// UpdateAgentStatus updates an agent's status.
func (p *Pool) UpdateAgentStatus(ctx context.Context, id string, status core.AgentStatus) error {
	tag, err := p.Exec(ctx, `
		UPDATE agents SET status = $1, updated_at = $2 WHERE id = $3
	`, status, time.Now().UTC(), id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return core.ErrAgentNotFound
	}
	return nil
}

// DeleteAgent removes an agent by ID.
func (p *Pool) DeleteAgent(ctx context.Context, id string) error {
	tag, err := p.Exec(ctx, `DELETE FROM agents WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return core.ErrAgentNotFound
	}
	return nil
}

// ListAgentsByProject returns agents for a specific project.
func (p *Pool) ListAgentsByProject(ctx context.Context, projectID string) ([]core.Agent, error) {
	rows, err := p.Query(ctx, `
		SELECT id, name, role, status, project_id, current_work_item_id, context,
			workflow_id, sandbox_id, tokens_consumed, last_heartbeat, created_at, updated_at
		FROM agents WHERE project_id = $1 ORDER BY created_at DESC
	`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanAgents(rows)
}

func scanAgents(rows pgx.Rows) ([]core.Agent, error) {
	var agents []core.Agent
	for rows.Next() {
		var a core.Agent
		err := rows.Scan(
			&a.ID, &a.Name, &a.Role, &a.Status, &a.ProjectID, &a.CurrentWorkItemID,
			&a.Context, &a.WorkflowID, &a.SandboxID, &a.TokensConsumed,
			&a.LastHeartbeat, &a.CreatedAt, &a.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		if a.ConversationHistory == nil {
			a.ConversationHistory = []string{}
		}
		agents = append(agents, a)
	}
	if agents == nil {
		agents = []core.Agent{}
	}
	return agents, rows.Err()
}

func scanAgent(row pgx.Row) (*core.Agent, error) {
	var a core.Agent
	err := row.Scan(
		&a.ID, &a.Name, &a.Role, &a.Status, &a.ProjectID, &a.CurrentWorkItemID,
		&a.Context, &a.WorkflowID, &a.SandboxID, &a.TokensConsumed,
		&a.LastHeartbeat, &a.CreatedAt, &a.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	if a.ConversationHistory == nil {
		a.ConversationHistory = []string{}
	}
	return &a, nil
}
