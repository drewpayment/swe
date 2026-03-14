package db

import (
	"context"
	"encoding/json"
	"time"

	"github.com/drewpayment/swe/internal/core"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// ListProjects returns all projects ordered by created_at DESC.
func (p *Pool) ListProjects(ctx context.Context) ([]core.Project, error) {
	rows, err := p.Query(ctx, `
		SELECT id, name, description, phase, status, repo_url, working_directory, repo_source, decisions, workflow_id, created_at, updated_at
		FROM projects ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanProjects(rows)
}

// GetProject returns a project by ID.
func (p *Pool) GetProject(ctx context.Context, id string) (*core.Project, error) {
	row := p.QueryRow(ctx, `
		SELECT id, name, description, phase, status, repo_url, working_directory, repo_source, decisions, workflow_id, created_at, updated_at
		FROM projects WHERE id = $1
	`, id)

	proj, err := scanProject(row)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, core.ErrProjectNotFound
		}
		return nil, err
	}
	return proj, nil
}

// InsertProject creates a new project.
func (p *Pool) InsertProject(ctx context.Context, req core.CreateProjectRequest) (*core.Project, error) {
	id := uuid.New().String()
	now := time.Now().UTC()
	decisionsJSON, _ := json.Marshal([]string{})

	_, err := p.Exec(ctx, `
		INSERT INTO projects (id, name, description, phase, status, repo_url, decisions, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`, id, req.Name, req.Description, core.PhasePlanning, core.StatusActive, req.RepoURL, decisionsJSON, now, now)
	if err != nil {
		return nil, err
	}

	return p.GetProject(ctx, id)
}

// UpdateProjectStatus updates a project's status.
func (p *Pool) UpdateProjectStatus(ctx context.Context, id string, status core.ProjectStatus) error {
	tag, err := p.Exec(ctx, `
		UPDATE projects SET status = $1, updated_at = $2 WHERE id = $3
	`, status, time.Now().UTC(), id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return core.ErrProjectNotFound
	}
	return nil
}

// UpdateProjectPhase updates a project's phase.
func (p *Pool) UpdateProjectPhase(ctx context.Context, id string, phase core.ProjectPhase) error {
	tag, err := p.Exec(ctx, `
		UPDATE projects SET phase = $1, updated_at = $2 WHERE id = $3
	`, phase, time.Now().UTC(), id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return core.ErrProjectNotFound
	}
	return nil
}

// UpdateProjectWorkflowID sets the workflow ID on a project.
func (p *Pool) UpdateProjectWorkflowID(ctx context.Context, id string, workflowID string) error {
	_, err := p.Exec(ctx, `
		UPDATE projects SET workflow_id = $1, updated_at = $2 WHERE id = $3
	`, workflowID, time.Now().UTC(), id)
	return err
}

// ArchiveProject archives a project.
func (p *Pool) ArchiveProject(ctx context.Context, id string) (*core.Project, error) {
	tag, err := p.Exec(ctx, `
		UPDATE projects SET status = $1, phase = $2, updated_at = $3 WHERE id = $4
	`, core.StatusCancelled, core.PhaseArchived, time.Now().UTC(), id)
	if err != nil {
		return nil, err
	}
	if tag.RowsAffected() == 0 {
		return nil, core.ErrProjectNotFound
	}
	return p.GetProject(ctx, id)
}

// UpdateProjectRepoInfo updates repo source and working directory for a project.
func (p *Pool) UpdateProjectRepoInfo(ctx context.Context, id string, repoSource string, workingDir *string) error {
	tag, err := p.Exec(ctx, `
		UPDATE projects SET repo_source = $1, working_directory = $2, updated_at = $3 WHERE id = $4
	`, repoSource, workingDir, time.Now().UTC(), id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return core.ErrProjectNotFound
	}
	return nil
}

func scanProjects(rows pgx.Rows) ([]core.Project, error) {
	var projects []core.Project
	for rows.Next() {
		var proj core.Project
		var decisionsJSON []byte
		err := rows.Scan(
			&proj.ID, &proj.Name, &proj.Description, &proj.Phase, &proj.Status,
			&proj.RepoURL, &proj.WorkingDirectory, &proj.RepoSource, &decisionsJSON, &proj.WorkflowID, &proj.CreatedAt, &proj.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		if decisionsJSON != nil {
			_ = json.Unmarshal(decisionsJSON, &proj.Decisions)
		}
		if proj.Decisions == nil {
			proj.Decisions = []string{}
		}
		if proj.ActiveAgentIDs == nil {
			proj.ActiveAgentIDs = []string{}
		}
		if proj.ArtifactIDs == nil {
			proj.ArtifactIDs = []string{}
		}
		projects = append(projects, proj)
	}
	if projects == nil {
		projects = []core.Project{}
	}
	return projects, rows.Err()
}

func scanProject(row pgx.Row) (*core.Project, error) {
	var proj core.Project
	var decisionsJSON []byte
	err := row.Scan(
		&proj.ID, &proj.Name, &proj.Description, &proj.Phase, &proj.Status,
		&proj.RepoURL, &proj.WorkingDirectory, &proj.RepoSource, &decisionsJSON, &proj.WorkflowID, &proj.CreatedAt, &proj.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	if decisionsJSON != nil {
		_ = json.Unmarshal(decisionsJSON, &proj.Decisions)
	}
	if proj.Decisions == nil {
		proj.Decisions = []string{}
	}
	if proj.ActiveAgentIDs == nil {
		proj.ActiveAgentIDs = []string{}
	}
	if proj.ArtifactIDs == nil {
		proj.ArtifactIDs = []string{}
	}
	return &proj, nil
}
