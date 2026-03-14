// API client for the SWE Core API

import type { Agent, ApiResponse, Artifact, ChatMessage, Notification, Project, Settings, WorkItem } from "./types";
import { getApiBaseUrl } from "./config";

const API_URL = getApiBaseUrl();

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
  working_directory?: string;
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

// Settings
export async function getSettings(): Promise<ApiResponse<Settings>> {
  return fetchApi("/api/v1/settings");
}

export async function updateSettings(data: Settings): Promise<ApiResponse<Settings>> {
  return fetchApi("/api/v1/settings", {
    method: "PUT",
    body: JSON.stringify(data),
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

// Service Health (checks all platform services)
export async function checkServiceHealth(): Promise<ApiResponse<Record<string, string>>> {
  return fetchApi("/api/v1/health/services");
}

// Create Agent
export async function createAgent(data: {
  name: string;
  role: string;
  project_id?: string;
}): Promise<ApiResponse<Agent>> {
  return fetchApi("/api/v1/agents", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// Delete Agent
export async function deleteAgent(id: string): Promise<ApiResponse<{ deleted: string }>> {
  return fetchApi(`/api/v1/agents/${id}`, { method: "DELETE" });
}

// Cleanup stale agents for a project
export async function cleanupStaleAgents(projectId: string): Promise<ApiResponse<{ cleaned: number; total: number }>> {
  return fetchApi(`/api/v1/agents/cleanup?project_id=${projectId}`, { method: "POST" });
}

// Chat messages
export async function listChatMessages(projectId: string): Promise<ApiResponse<ChatMessage[]>> {
  return fetchApi(`/api/v1/messages?project_id=${projectId}`);
}

export async function listAgentChatMessages(agentId: string): Promise<ApiResponse<ChatMessage[]>> {
  return fetchApi(`/api/v1/agents/${agentId}/messages`);
}

// Notifications
export async function listNotifications(projectId?: string, unreadOnly?: boolean): Promise<ApiResponse<Notification[]>> {
  const params = new URLSearchParams();
  if (projectId) params.set("project_id", projectId);
  if (unreadOnly) params.set("unread_only", "true");
  return fetchApi(`/api/v1/notifications?${params}`);
}

export async function getUnreadCount(): Promise<ApiResponse<{ count: number }>> {
  return fetchApi("/api/v1/notifications/unread-count");
}

export async function markNotificationRead(id: string): Promise<ApiResponse<{ marked: string }>> {
  return fetchApi(`/api/v1/notifications/${id}/read`, { method: "PATCH" });
}

export async function markAllNotificationsRead(projectId?: string): Promise<ApiResponse<{ status: string }>> {
  const params = projectId ? `?project_id=${projectId}` : "";
  return fetchApi(`/api/v1/notifications/mark-all-read${params}`, { method: "POST" });
}
