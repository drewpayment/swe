package db

import (
	"context"
	"time"

	"github.com/drewpayment/swe/internal/core"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// InsertChatMessage persists a chat message.
func (p *Pool) InsertChatMessage(ctx context.Context, projectID string, agentID *string, role string, content string) (*core.ChatMessage, error) {
	id := uuid.New().String()
	now := time.Now().UTC()
	_, err := p.Exec(ctx, `
		INSERT INTO chat_messages (id, project_id, agent_id, role, content, created_at)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, id, projectID, agentID, role, content, now)
	if err != nil {
		return nil, err
	}
	return &core.ChatMessage{
		ID:        id,
		ProjectID: projectID,
		AgentID:   agentID,
		Role:      role,
		Content:   content,
		CreatedAt: now,
	}, nil
}

// ListChatMessages returns chat messages for a project, ordered by time.
func (p *Pool) ListChatMessages(ctx context.Context, projectID string, limit int) ([]core.ChatMessage, error) {
	if limit <= 0 {
		limit = 100
	}
	rows, err := p.Query(ctx, `
		SELECT id, project_id, agent_id, role, content, created_at
		FROM chat_messages
		WHERE project_id = $1
		ORDER BY created_at ASC
		LIMIT $2
	`, projectID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanChatMessages(rows)
}

// ListAgentChatMessages returns chat messages for a specific agent.
func (p *Pool) ListAgentChatMessages(ctx context.Context, agentID string, limit int) ([]core.ChatMessage, error) {
	if limit <= 0 {
		limit = 100
	}
	rows, err := p.Query(ctx, `
		SELECT id, project_id, agent_id, role, content, created_at
		FROM chat_messages
		WHERE agent_id = $1
		ORDER BY created_at ASC
		LIMIT $2
	`, agentID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanChatMessages(rows)
}

func scanChatMessages(rows pgx.Rows) ([]core.ChatMessage, error) {
	var msgs []core.ChatMessage
	for rows.Next() {
		var m core.ChatMessage
		err := rows.Scan(&m.ID, &m.ProjectID, &m.AgentID, &m.Role, &m.Content, &m.CreatedAt)
		if err != nil {
			return nil, err
		}
		msgs = append(msgs, m)
	}
	if msgs == nil {
		msgs = []core.ChatMessage{}
	}
	return msgs, rows.Err()
}
