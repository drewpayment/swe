package db

import (
	"context"
	"fmt"
	"time"

	"github.com/drewpayment/swe/internal/core"
	"github.com/jackc/pgx/v5"
)

// ListArtifacts returns artifacts, optionally filtered by project ID and/or type.
func (p *Pool) ListArtifacts(ctx context.Context, projectID *string, artifactType *string) ([]core.Artifact, error) {
	query := `SELECT id, name, artifact_type, description, project_id, work_item_id,
		created_by_agent_id, content, storage_url, mime_type, size_bytes,
		approval_status, approved_by, approval_comment, version, previous_version_id,
		created_at, updated_at
		FROM artifacts WHERE 1=1`
	args := []any{}
	argIdx := 1

	if projectID != nil {
		query += fmt.Sprintf(" AND project_id = $%d", argIdx)
		args = append(args, *projectID)
		argIdx++
	}
	if artifactType != nil {
		query += fmt.Sprintf(" AND artifact_type = $%d", argIdx)
		args = append(args, *artifactType)
		argIdx++
	}
	query += " ORDER BY created_at DESC"

	rows, err := p.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanArtifacts(rows)
}

// GetArtifact returns an artifact by ID.
func (p *Pool) GetArtifact(ctx context.Context, id string) (*core.Artifact, error) {
	row := p.QueryRow(ctx, `
		SELECT id, name, artifact_type, description, project_id, work_item_id,
			created_by_agent_id, content, storage_url, mime_type, size_bytes,
			approval_status, approved_by, approval_comment, version, previous_version_id,
			created_at, updated_at
		FROM artifacts WHERE id = $1
	`, id)

	a, err := scanArtifact(row)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, core.ErrArtifactNotFound
		}
		return nil, err
	}
	return a, nil
}

// UpdateArtifactApproval updates an artifact's approval status.
func (p *Pool) UpdateArtifactApproval(ctx context.Context, id string, approved bool, by string, comment *string) (*core.Artifact, error) {
	status := core.ApprovalApproved
	if !approved {
		status = core.ApprovalRejected
	}

	tag, err := p.Exec(ctx, `
		UPDATE artifacts SET approval_status = $1, approved_by = $2, approval_comment = $3, updated_at = $4
		WHERE id = $5
	`, status, by, comment, time.Now().UTC(), id)
	if err != nil {
		return nil, err
	}
	if tag.RowsAffected() == 0 {
		return nil, core.ErrArtifactNotFound
	}

	return p.GetArtifact(ctx, id)
}

func scanArtifacts(rows pgx.Rows) ([]core.Artifact, error) {
	var artifacts []core.Artifact
	for rows.Next() {
		var a core.Artifact
		err := rows.Scan(
			&a.ID, &a.Name, &a.ArtifactType, &a.Description, &a.ProjectID, &a.WorkItemID,
			&a.CreatedByAgentID, &a.Content, &a.StorageURL, &a.MimeType, &a.SizeBytes,
			&a.ApprovalStatus, &a.ApprovedBy, &a.ApprovalComment, &a.Version, &a.PreviousVersionID,
			&a.CreatedAt, &a.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		artifacts = append(artifacts, a)
	}
	if artifacts == nil {
		artifacts = []core.Artifact{}
	}
	return artifacts, rows.Err()
}

func scanArtifact(row pgx.Row) (*core.Artifact, error) {
	var a core.Artifact
	err := row.Scan(
		&a.ID, &a.Name, &a.ArtifactType, &a.Description, &a.ProjectID, &a.WorkItemID,
		&a.CreatedByAgentID, &a.Content, &a.StorageURL, &a.MimeType, &a.SizeBytes,
		&a.ApprovalStatus, &a.ApprovedBy, &a.ApprovalComment, &a.Version, &a.PreviousVersionID,
		&a.CreatedAt, &a.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &a, nil
}
