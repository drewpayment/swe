package db

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/drewpayment/swe/internal/core"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// ListWorkItems returns work items, optionally filtered by project ID and/or status.
func (p *Pool) ListWorkItems(ctx context.Context, projectID *string, status *string) ([]core.WorkItem, error) {
	query := `SELECT id, title, description, status, priority, project_id, assigned_agent_id,
		depends_on, blocks, branch_name, pr_url, created_at, updated_at, started_at, completed_at
		FROM work_items WHERE 1=1`
	args := []any{}
	argIdx := 1

	if projectID != nil {
		query += fmt.Sprintf(" AND project_id = $%d", argIdx)
		args = append(args, *projectID)
		argIdx++
	}
	if status != nil {
		query += fmt.Sprintf(" AND status = $%d", argIdx)
		args = append(args, *status)
		argIdx++
	}
	query += " ORDER BY created_at DESC"

	rows, err := p.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanWorkItems(rows)
}

// GetWorkItem returns a work item by ID.
func (p *Pool) GetWorkItem(ctx context.Context, id string) (*core.WorkItem, error) {
	row := p.QueryRow(ctx, `
		SELECT id, title, description, status, priority, project_id, assigned_agent_id,
			depends_on, blocks, branch_name, pr_url, created_at, updated_at, started_at, completed_at
		FROM work_items WHERE id = $1
	`, id)

	item, err := scanWorkItem(row)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, core.ErrWorkItemNotFound
		}
		return nil, err
	}
	return item, nil
}

// InsertWorkItem creates a new work item.
func (p *Pool) InsertWorkItem(ctx context.Context, req core.CreateWorkItemRequest) (*core.WorkItem, error) {
	id := uuid.New().String()
	now := time.Now().UTC()
	emptyJSON, _ := json.Marshal([]string{})

	_, err := p.Exec(ctx, `
		INSERT INTO work_items (id, title, description, status, priority, project_id, depends_on, blocks, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	`, id, req.Title, req.Description, core.WorkPending, req.Priority, req.ProjectID, emptyJSON, emptyJSON, now, now)
	if err != nil {
		return nil, err
	}

	return p.GetWorkItem(ctx, id)
}

func scanWorkItems(rows pgx.Rows) ([]core.WorkItem, error) {
	var items []core.WorkItem
	for rows.Next() {
		item, err := scanWorkItemFromRow(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, *item)
	}
	if items == nil {
		items = []core.WorkItem{}
	}
	return items, rows.Err()
}

func scanWorkItemFromRow(row pgx.Row) (*core.WorkItem, error) {
	var w core.WorkItem
	var dependsOnJSON, blocksJSON []byte
	err := row.Scan(
		&w.ID, &w.Title, &w.Description, &w.Status, &w.Priority, &w.ProjectID,
		&w.AssignedAgentID, &dependsOnJSON, &blocksJSON, &w.BranchName, &w.PrURL,
		&w.CreatedAt, &w.UpdatedAt, &w.StartedAt, &w.CompletedAt,
	)
	if err != nil {
		return nil, err
	}
	if dependsOnJSON != nil {
		_ = json.Unmarshal(dependsOnJSON, &w.DependsOn)
	}
	if blocksJSON != nil {
		_ = json.Unmarshal(blocksJSON, &w.Blocks)
	}
	if w.DependsOn == nil {
		w.DependsOn = []string{}
	}
	if w.Blocks == nil {
		w.Blocks = []string{}
	}
	if w.ArtifactIDs == nil {
		w.ArtifactIDs = []string{}
	}
	return &w, nil
}

func scanWorkItem(row pgx.Row) (*core.WorkItem, error) {
	return scanWorkItemFromRow(row)
}

// UpdateWorkItemStatus updates a work item's status, setting started_at/completed_at as appropriate.
func (p *Pool) UpdateWorkItemStatus(ctx context.Context, id string, status core.WorkItemStatus) error {
	now := time.Now().UTC()

	var query string
	var args []any

	switch status {
	case core.WorkInProgress:
		query = `UPDATE work_items SET status = $1, started_at = $2, updated_at = $3 WHERE id = $4`
		args = []any{status, now, now, id}
	case core.WorkComplete:
		query = `UPDATE work_items SET status = $1, completed_at = $2, updated_at = $3 WHERE id = $4`
		args = []any{status, now, now, id}
	default:
		query = `UPDATE work_items SET status = $1, updated_at = $2 WHERE id = $3`
		args = []any{status, now, id}
	}

	tag, err := p.Exec(ctx, query, args...)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return core.ErrWorkItemNotFound
	}
	return nil
}

// UpdateWorkItemAssignment assigns a work item to an agent and sets status to "assigned".
func (p *Pool) UpdateWorkItemAssignment(ctx context.Context, id string, agentID *string) error {
	now := time.Now().UTC()
	tag, err := p.Exec(ctx, `
		UPDATE work_items SET assigned_agent_id = $1, status = $2, updated_at = $3 WHERE id = $4
	`, agentID, core.WorkAssigned, now, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return core.ErrWorkItemNotFound
	}
	return nil
}

// ListWorkItemsByAgent returns work items assigned to a specific agent.
func (p *Pool) ListWorkItemsByAgent(ctx context.Context, agentID string) ([]core.WorkItem, error) {
	rows, err := p.Query(ctx, `
		SELECT id, title, description, status, priority, project_id, assigned_agent_id,
			depends_on, blocks, branch_name, pr_url, created_at, updated_at, started_at, completed_at
		FROM work_items WHERE assigned_agent_id = $1 ORDER BY created_at DESC
	`, agentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanWorkItems(rows)
}

