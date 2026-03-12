-- Projects
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    phase TEXT NOT NULL DEFAULT 'planning',
    status TEXT NOT NULL DEFAULT 'active',
    repo_url TEXT,
    decisions JSONB NOT NULL DEFAULT '[]',
    workflow_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Agents
CREATE TABLE IF NOT EXISTS agents (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'initializing',
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    current_work_item_id UUID,
    context TEXT,
    workflow_id TEXT,
    sandbox_id TEXT,
    tokens_consumed BIGINT NOT NULL DEFAULT 0,
    last_heartbeat TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Work items
CREATE TABLE IF NOT EXISTS work_items (
    id UUID PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    priority TEXT NOT NULL DEFAULT 'normal',
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    assigned_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    depends_on JSONB NOT NULL DEFAULT '[]',
    blocks JSONB NOT NULL DEFAULT '[]',
    branch_name TEXT,
    pr_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- Artifacts
CREATE TABLE IF NOT EXISTS artifacts (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    artifact_type TEXT NOT NULL,
    description TEXT,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    work_item_id UUID REFERENCES work_items(id) ON DELETE SET NULL,
    created_by_agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    content TEXT,
    storage_url TEXT,
    mime_type TEXT NOT NULL DEFAULT 'text/plain',
    size_bytes BIGINT NOT NULL DEFAULT 0,
    approval_status TEXT NOT NULL DEFAULT 'pending',
    approved_by TEXT,
    approval_comment TEXT,
    version INT NOT NULL DEFAULT 1,
    previous_version_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agents_project_id ON agents(project_id);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_work_items_project_id ON work_items(project_id);
CREATE INDEX IF NOT EXISTS idx_work_items_status ON work_items(status);
CREATE INDEX IF NOT EXISTS idx_work_items_assigned_agent ON work_items(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_project_id ON artifacts(project_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_type ON artifacts(artifact_type);
CREATE INDEX IF NOT EXISTS idx_artifacts_approval ON artifacts(approval_status);
