-- migrations/003_cosmo_opencode.sql
-- Cosmo + OpenCode integration: notifications, project repo fields

ALTER TABLE projects ADD COLUMN IF NOT EXISTS working_directory TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS repo_source TEXT NOT NULL DEFAULT 'none'
  CHECK (repo_source IN ('local', 'remote', 'none'));

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK (type IN ('action_needed', 'status_update', 'approval_request', 'info')),
    priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'critical')),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    read BOOLEAN NOT NULL DEFAULT FALSE,
    action_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_project ON notifications(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(read, created_at DESC) WHERE read = FALSE;
