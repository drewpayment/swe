// API client for the SWE Core API

import type { Agent, ApiResponse, Artifact, Project, WorkItem } from "./types";

function getApiUrl(): string {
  // Use env var if set
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  // In browser: derive from current hostname (OrbStack domains, etc.)
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    // OrbStack: swe-web.swe.orb.local → swe-api.swe.orb.local
    if (host.endsWith(".orb.local")) {
      return `http://swe-api.swe.orb.local`;
    }
    return "http://localhost:8080";
  }
  // Server-side: use Docker internal network or localhost
  return "http://swe-api:8080";
}

const API_URL = getApiUrl();

async function fetchApi<T>(path: string, options?: RequestInit): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
      ...options,
    });
    return await res.json();
  } catch {
    return { success: false, error: "Failed to connect to SWE API" };
  }
}

// Projects
export async function listProjects(): Promise<ApiResponse<Project[]>> {
  return fetchApi("/api/v1/projects");
}

export async function getProject(id: string): Promise<ApiResponse<Project>> {
  return fetchApi(`/api/v1/projects/${id}`);
}

export async function createProject(data: {
  name: string;
  description?: string;
  repo_url?: string;
  initial_prompt?: string;
}): Promise<ApiResponse<Project>> {
  return fetchApi("/api/v1/projects", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// Agents
export async function listAgents(projectId?: string): Promise<ApiResponse<Agent[]>> {
  const params = projectId ? `?project_id=${projectId}` : "";
  return fetchApi(`/api/v1/agents${params}`);
}

export async function getAgent(id: string): Promise<ApiResponse<Agent>> {
  return fetchApi(`/api/v1/agents/${id}`);
}

export async function sendMessage(agentId: string, content: string): Promise<ApiResponse<{ message_id: string; acknowledged: boolean }>> {
  return fetchApi(`/api/v1/agents/${agentId}/message`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}

// Work Items
export async function listWorkItems(projectId?: string): Promise<ApiResponse<WorkItem[]>> {
  const params = projectId ? `?project_id=${projectId}` : "";
  return fetchApi(`/api/v1/work${params}`);
}

export async function createWorkItem(data: {
  project_id: string;
  title: string;
  description?: string;
  priority?: string;
}): Promise<ApiResponse<WorkItem>> {
  return fetchApi("/api/v1/work", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// Artifacts
export async function listArtifacts(projectId?: string): Promise<ApiResponse<Artifact[]>> {
  const params = projectId ? `?project_id=${projectId}` : "";
  return fetchApi(`/api/v1/artifacts${params}`);
}

export async function getArtifactContent(id: string): Promise<ApiResponse<{ content: string }>> {
  return fetchApi(`/api/v1/artifacts/${id}/content`);
}

export async function approveArtifact(id: string, approved: boolean, comment?: string): Promise<ApiResponse<Artifact>> {
  return fetchApi(`/api/v1/artifacts/${id}/approve`, {
    method: "POST",
    body: JSON.stringify({ approved, comment, approved_by: "user" }),
  });
}

// Health
export async function checkHealth(): Promise<{ status: string; version: string } | null> {
  try {
    const res = await fetch(`${API_URL}/health`);
    if (res.ok) return await res.json();
    return null;
  } catch {
    return null;
  }
}
