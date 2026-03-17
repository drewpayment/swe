package db

import (
	"context"
	"fmt"
	"time"

	"github.com/drewpayment/swe/internal/core"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// InsertNotification creates a new notification.
func (p *Pool) InsertNotification(ctx context.Context, n core.Notification) (*core.Notification, error) {
	if n.ID == "" {
		n.ID = uuid.New().String()
	}
	if n.CreatedAt.IsZero() {
		n.CreatedAt = time.Now().UTC()
	}
	if n.Priority == "" {
		n.Priority = "normal"
	}

	_, err := p.Exec(ctx, `
		INSERT INTO notifications (id, project_id, agent_id, type, priority, title, body, read, action_url, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	`, n.ID, n.ProjectID, n.AgentID, n.Type, n.Priority, n.Title, n.Body, n.Read, n.ActionURL, n.CreatedAt)
	if err != nil {
		return nil, err
	}

	return &n, nil
}

// ListNotifications returns notifications for a project with pagination.
func (p *Pool) ListNotifications(ctx context.Context, projectID string, limit, offset int) ([]core.Notification, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := p.Query(ctx, `
		SELECT id, project_id, agent_id, type, priority, title, body, read, action_url, created_at
		FROM notifications
		WHERE project_id = $1
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3
	`, projectID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanNotifications(rows)
}

// ListNotificationsFiltered returns notifications with optional project and unread filters, plus total count.
// If projectID is empty, returns notifications across all projects.
func (p *Pool) ListNotificationsFiltered(ctx context.Context, projectID string, unreadOnly bool, limit, offset int) ([]core.Notification, int, error) {
	if limit <= 0 {
		limit = 50
	}

	args := []any{}
	where := "WHERE 1=1"
	argIdx := 1

	if projectID != "" {
		where += fmt.Sprintf(" AND project_id = $%d", argIdx)
		args = append(args, projectID)
		argIdx++
	}
	if unreadOnly {
		where += " AND read = FALSE"
	}

	// Get total count
	var total int
	if err := p.QueryRow(ctx, "SELECT COUNT(*) FROM notifications "+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	// Get paginated results
	query := fmt.Sprintf(`
		SELECT id, project_id, agent_id, type, priority, title, body, read, action_url, created_at
		FROM notifications
		%s
		ORDER BY created_at DESC
		LIMIT $%d OFFSET $%d`, where, argIdx, argIdx+1)
	args = append(args, limit, offset)

	rows, err := p.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	notifications, err := scanNotifications(rows)
	if err != nil {
		return nil, 0, err
	}

	return notifications, total, nil
}

// UnreadNotificationCount returns the count of unread notifications for a project.
func (p *Pool) UnreadNotificationCount(ctx context.Context, projectID string) (int, error) {
	var count int
	err := p.QueryRow(ctx, `
		SELECT COUNT(*) FROM notifications WHERE project_id = $1 AND read = FALSE
	`, projectID).Scan(&count)
	return count, err
}

// MarkNotificationRead marks a single notification as read.
func (p *Pool) MarkNotificationRead(ctx context.Context, id string) error {
	tag, err := p.Exec(ctx, `
		UPDATE notifications SET read = TRUE WHERE id = $1
	`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return core.ErrNotificationNotFound
	}
	return nil
}

// MarkAllNotificationsRead marks all notifications for a project as read.
func (p *Pool) MarkAllNotificationsRead(ctx context.Context, projectID string) (int64, error) {
	tag, err := p.Exec(ctx, `
		UPDATE notifications SET read = TRUE WHERE project_id = $1 AND read = FALSE
	`, projectID)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

func scanNotifications(rows pgx.Rows) ([]core.Notification, error) {
	var notifications []core.Notification
	for rows.Next() {
		var n core.Notification
		err := rows.Scan(
			&n.ID, &n.ProjectID, &n.AgentID, &n.Type, &n.Priority,
			&n.Title, &n.Body, &n.Read, &n.ActionURL, &n.CreatedAt,
		)
		if err != nil {
			return nil, err
		}
		notifications = append(notifications, n)
	}
	if notifications == nil {
		notifications = []core.Notification{}
	}
	return notifications, rows.Err()
}
