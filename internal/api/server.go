package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/drewpayment/swe/internal/config"
	"github.com/drewpayment/swe/internal/core"
	"github.com/drewpayment/swe/internal/db"
	"github.com/drewpayment/swe/internal/temporal/workflows"
	"github.com/gorilla/websocket"
	enumspb "go.temporal.io/api/enums/v1"
	"go.temporal.io/sdk/client"
)

// Server is the HTTP API server.
type Server struct {
	db       *db.Pool
	cfg      config.Config
	mux      *http.ServeMux
	wsHub    *wsHub
	temporal client.Client
}

// New creates a new API server.
func New(pool *db.Pool, cfg config.Config) *Server {
	s := &Server{
		db:    pool,
		cfg:   cfg,
		mux:   http.NewServeMux(),
		wsHub: newWSHub(),
	}

	// Connect to Temporal (non-fatal if it fails)
	tc, err := client.Dial(client.Options{
		HostPort:  cfg.Temporal.Address,
		Namespace: cfg.Temporal.Namespace,
	})
	if err != nil {
		slog.Warn("failed to connect to Temporal, workflow features disabled", "error", err)
	} else {
		s.temporal = tc
	}

	s.routes()
	return s
}

// Handler returns the HTTP handler with CORS middleware.
func (s *Server) Handler() http.Handler {
	return corsMiddleware(s.cfg, s.mux)
}

// ListenAndServe starts the server.
func (s *Server) ListenAndServe() error {
	addr := fmt.Sprintf("%s:%d", s.cfg.API.Host, s.cfg.API.Port)
	slog.Info("starting API server", "addr", addr)

	go s.wsHub.run()

	srv := &http.Server{
		Addr:         addr,
		Handler:      s.Handler(),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}
	return srv.ListenAndServe()
}

func (s *Server) routes() {
	// Health
	s.mux.HandleFunc("GET /health", s.healthCheck)
	s.mux.HandleFunc("GET /ready", s.readyCheck)
	s.mux.HandleFunc("GET /api/v1/health/services", s.serviceHealthCheck)

	// Projects
	s.mux.HandleFunc("GET /api/v1/projects", s.listProjects)
	s.mux.HandleFunc("POST /api/v1/projects", s.createProject)
	s.mux.HandleFunc("GET /api/v1/projects/{id}", s.getProject)
	s.mux.HandleFunc("DELETE /api/v1/projects/{id}", s.archiveProject)
	s.mux.HandleFunc("GET /api/v1/projects/{id}/status", s.getProjectStatus)

	// Agents
	s.mux.HandleFunc("GET /api/v1/agents", s.listAgents)
	s.mux.HandleFunc("POST /api/v1/agents", s.createAgent)
	s.mux.HandleFunc("GET /api/v1/agents/{id}", s.getAgent)
	s.mux.HandleFunc("POST /api/v1/agents/{id}/message", s.sendMessage)
	s.mux.HandleFunc("DELETE /api/v1/agents/{id}", s.deleteAgent)
	s.mux.HandleFunc("POST /api/v1/agents/cleanup", s.cleanupStaleAgents)

	// Work Items
	s.mux.HandleFunc("GET /api/v1/work", s.listWorkItems)
	s.mux.HandleFunc("POST /api/v1/work", s.createWorkItem)
	s.mux.HandleFunc("GET /api/v1/work/{id}", s.getWorkItem)
	s.mux.HandleFunc("PATCH /api/v1/work-items/{id}/status", s.updateWorkItemStatus)

	// Artifacts
	s.mux.HandleFunc("GET /api/v1/artifacts", s.listArtifacts)
	s.mux.HandleFunc("GET /api/v1/artifacts/{id}", s.getArtifact)
	s.mux.HandleFunc("GET /api/v1/artifacts/{id}/content", s.getArtifactContent)
	s.mux.HandleFunc("POST /api/v1/artifacts/{id}/approve", s.approveArtifact)

	// Settings
	s.mux.HandleFunc("GET /api/v1/settings", s.getSettings)
	s.mux.HandleFunc("PUT /api/v1/settings", s.updateSettings)

	// Chat messages
	s.mux.HandleFunc("GET /api/v1/messages", s.listChatMessages)
	s.mux.HandleFunc("GET /api/v1/agents/{id}/messages", s.listAgentChatMessages)

	// Notifications
	s.mux.HandleFunc("GET /api/v1/notifications", s.listNotifications)
	s.mux.HandleFunc("GET /api/v1/notifications/unread-count", s.unreadNotificationCount)
	s.mux.HandleFunc("PATCH /api/v1/notifications/{id}/read", s.markNotificationRead)
	s.mux.HandleFunc("POST /api/v1/notifications/mark-all-read", s.markAllNotificationsRead)

	// Internal (used by Temporal activities to broadcast events)
	s.mux.HandleFunc("POST /api/v1/internal/broadcast", s.internalBroadcast)

	// WebSocket
	s.mux.HandleFunc("GET /ws/stream", s.wsStream)
}

// --- Health ---

func (s *Server) healthCheck(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "healthy"})
}

func (s *Server) readyCheck(w http.ResponseWriter, r *http.Request) {
	if err := s.db.Ping(r.Context()); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "not ready"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ready"})
}

func (s *Server) serviceHealthCheck(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	services := map[string]string{}

	// SWE API — always healthy if we're responding
	services["SWE API"] = "healthy"

	// PostgreSQL
	if err := s.db.Ping(ctx); err != nil {
		services["PostgreSQL"] = "unhealthy"
	} else {
		services["PostgreSQL"] = "healthy"
	}

	// Temporal Server
	if s.temporal != nil {
		services["Temporal Server"] = "healthy"
	} else {
		// Try connecting
		conn, err := net.DialTimeout("tcp", s.cfg.Temporal.Address, 2*time.Second)
		if err != nil {
			services["Temporal Server"] = "unhealthy"
		} else {
			conn.Close()
			services["Temporal Server"] = "healthy"
		}
	}

	// LiteLLM Proxy
	llmCtx, llmCancel := context.WithTimeout(ctx, 2*time.Second)
	defer llmCancel()
	llmReq, _ := http.NewRequestWithContext(llmCtx, "GET", s.cfg.LLM.ProxyURL+"/health", nil)
	if resp, err := http.DefaultClient.Do(llmReq); err == nil {
		resp.Body.Close()
		services["LiteLLM Proxy"] = "healthy"
	} else {
		services["LiteLLM Proxy"] = "unhealthy"
	}

	// Redis — parse redis://host:port into host:port for TCP check
	redisAddr := "localhost:6379"
	if u := s.cfg.Redis.URL; u != "" {
		// Strip redis:// prefix
		addr := strings.TrimPrefix(u, "redis://")
		addr = strings.TrimPrefix(addr, "rediss://")
		// Remove any path/query
		if idx := strings.Index(addr, "/"); idx != -1 {
			addr = addr[:idx]
		}
		if addr != "" {
			redisAddr = addr
		}
	}
	rConn, rErr := net.DialTimeout("tcp", redisAddr, 2*time.Second)
	if rErr != nil {
		services["Redis"] = "unhealthy"
	} else {
		rConn.Close()
		services["Redis"] = "healthy"
	}

	writeJSON(w, http.StatusOK, core.SuccessResponse(services))
}

// --- Projects ---

func (s *Server) listProjects(w http.ResponseWriter, r *http.Request) {
	projects, err := s.db.ListProjects(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, core.SuccessResponse(projects))
}

func (s *Server) createProject(w http.ResponseWriter, r *http.Request) {
	var req core.CreateProjectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, core.ErrorResponse[any]("invalid request body"))
		return
	}
	if req.Name == "" {
		writeJSON(w, http.StatusBadRequest, core.ErrorResponse[any]("name is required"))
		return
	}
	project, err := s.db.InsertProject(r.Context(), req)
	if err != nil {
		writeError(w, err)
		return
	}

	// Start a Temporal workflow for the project if Temporal is connected
	if s.temporal != nil {
		workflowID := fmt.Sprintf("project-%s", project.ID)
		_, err := s.temporal.ExecuteWorkflow(r.Context(), client.StartWorkflowOptions{
			ID:        workflowID,
			TaskQueue: s.cfg.Temporal.TaskQueue,
		}, workflows.ProjectWorkflow, workflows.ProjectWorkflowInput{
			ProjectID:     project.ID,
			Name:          project.Name,
			Description:   project.Description,
			RepoURL:       project.RepoURL,
			InitialPrompt: req.InitialPrompt,
		})
		if err != nil {
			slog.Warn("failed to start project workflow", "error", err)
		} else {
			// Update project with workflow ID
			s.db.UpdateProjectWorkflowID(r.Context(), project.ID, workflowID)
			project.WorkflowID = &workflowID
		}
	}

	// Auto-create a project orchestrator agent
	orchestrator, orchErr := s.db.InsertAgent(r.Context(), "Project Orchestrator", core.RoleProjectOrchestrator, &project.ID)
	if orchErr != nil {
		slog.Warn("failed to create project orchestrator", "error", orchErr)
	} else if s.temporal != nil {
		orchWorkflowID := fmt.Sprintf("agent-%s", orchestrator.ID)
		_, orchWfErr := s.temporal.ExecuteWorkflow(r.Context(), client.StartWorkflowOptions{
			ID:        orchWorkflowID,
			TaskQueue: s.cfg.Temporal.TaskQueue,
		}, workflows.AgentWorkflow, workflows.AgentWorkflowInput{
			AgentID:        orchestrator.ID,
			Name:           orchestrator.Name,
			ProjectID:      &project.ID,
			Role:           string(orchestrator.Role),
			InitialContext: req.InitialPrompt,
		})
		if orchWfErr != nil {
			slog.Warn("failed to start orchestrator workflow", "error", orchWfErr)
		} else {
			s.db.UpdateAgentWorkflowID(r.Context(), orchestrator.ID, orchWorkflowID)
			s.db.UpdateAgentStatus(r.Context(), orchestrator.ID, core.AgentIdle)
		}
	}

	writeJSON(w, http.StatusCreated, core.SuccessResponse(project))
}

func (s *Server) getProject(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	project, err := s.db.GetProject(r.Context(), id)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, core.SuccessResponse(project))
}

func (s *Server) archiveProject(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	project, err := s.db.ArchiveProject(r.Context(), id)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, core.SuccessResponse(project))
}

func (s *Server) getProjectStatus(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	project, err := s.db.GetProject(r.Context(), id)
	if err != nil {
		writeError(w, err)
		return
	}
	status := map[string]any{
		"phase":  project.Phase,
		"status": project.Status,
	}
	writeJSON(w, http.StatusOK, core.SuccessResponse(status))
}

// --- Agents ---

func (s *Server) listAgents(w http.ResponseWriter, r *http.Request) {
	var projectID *string
	if pid := r.URL.Query().Get("project_id"); pid != "" {
		projectID = &pid
	}
	agents, err := s.db.ListAgents(r.Context(), projectID)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, core.SuccessResponse(agents))
}

func (s *Server) createAgent(w http.ResponseWriter, r *http.Request) {
	var req core.CreateAgentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, core.ErrorResponse[any]("invalid request body"))
		return
	}
	if req.Name == "" || req.Role == "" {
		writeJSON(w, http.StatusBadRequest, core.ErrorResponse[any]("name and role are required"))
		return
	}

	agent, err := s.db.InsertAgent(r.Context(), req.Name, core.AgentRole(req.Role), req.ProjectID)
	if err != nil {
		writeError(w, err)
		return
	}

	// Start agent workflow via Temporal
	if s.temporal != nil {
		workflowID := fmt.Sprintf("agent-%s", agent.ID)
		_, err := s.temporal.ExecuteWorkflow(r.Context(), client.StartWorkflowOptions{
			ID:        workflowID,
			TaskQueue: s.cfg.Temporal.TaskQueue,
		}, workflows.AgentWorkflow, workflows.AgentWorkflowInput{
			AgentID:   agent.ID,
			Name:      agent.Name,
			Role:      string(agent.Role),
			ProjectID: agent.ProjectID,
		})
		if err != nil {
			slog.Warn("failed to start agent workflow", "error", err)
		} else {
			s.db.UpdateAgentWorkflowID(r.Context(), agent.ID, workflowID)
			agent.WorkflowID = &workflowID
		}

		// Update agent status to idle
		s.db.UpdateAgentStatus(r.Context(), agent.ID, core.AgentIdle)
		agent.Status = core.AgentIdle
	}

	// Broadcast agent status event via WebSocket
	s.wsHub.BroadcastEvent(map[string]any{
		"type":       "agent_status",
		"agent_id":   agent.ID,
		"status":     agent.Status,
		"role":       agent.Role,
		"project_id": agent.ProjectID,
	})

	writeJSON(w, http.StatusCreated, core.SuccessResponse(agent))
}

func (s *Server) getAgent(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	agent, err := s.db.GetAgent(r.Context(), id)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, core.SuccessResponse(agent))
}

func (s *Server) sendMessage(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var req core.SendMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, core.ErrorResponse[any]("invalid request body"))
		return
	}

	// Verify agent exists
	agent, err := s.db.GetAgent(r.Context(), id)
	if err != nil {
		writeError(w, err)
		return
	}

	// Persist the user's message
	if agent.ProjectID != nil {
		_, _ = s.db.InsertChatMessage(r.Context(), *agent.ProjectID, &agent.ID, "user", req.Content)
	}

	// Send message via Temporal signal if agent has a workflow
	if s.temporal != nil && agent.WorkflowID != nil {
		err := s.temporal.SignalWorkflow(r.Context(), *agent.WorkflowID, "", "message", req.Content)
		if err != nil {
			slog.Warn("failed to signal agent workflow", "error", err, "agent_id", id)
		}
	}

	resp := map[string]any{
		"agent_id": agent.ID,
		"status":   "message_sent",
		"content":  req.Content,
	}
	writeJSON(w, http.StatusOK, core.SuccessResponse(resp))
}

func (s *Server) deleteAgent(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	// Get agent first to check workflow
	agent, err := s.db.GetAgent(r.Context(), id)
	if err != nil {
		writeError(w, err)
		return
	}

	// Terminate Temporal workflow if exists
	if s.temporal != nil && agent.WorkflowID != nil {
		_ = s.temporal.TerminateWorkflow(r.Context(), *agent.WorkflowID, "", "agent deleted via API")
	}

	if err := s.db.DeleteAgent(r.Context(), id); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, core.SuccessResponse(map[string]any{"deleted": id}))
}

func (s *Server) cleanupStaleAgents(w http.ResponseWriter, r *http.Request) {
	projectID := r.URL.Query().Get("project_id")
	if projectID == "" {
		writeJSON(w, http.StatusBadRequest, core.ErrorResponse[any]("project_id is required"))
		return
	}

	agents, err := s.db.ListAgents(r.Context(), &projectID)
	if err != nil {
		writeError(w, err)
		return
	}

	cleaned := 0
	for _, agent := range agents {
		if agent.WorkflowID == nil {
			// No workflow — mark as terminated
			_ = s.db.UpdateAgentStatus(r.Context(), agent.ID, core.AgentTerminated)
			cleaned++
			continue
		}
		if s.temporal != nil {
			desc, err := s.temporal.DescribeWorkflowExecution(r.Context(), *agent.WorkflowID, "")
			if err != nil {
				// Workflow doesn't exist — mark terminated
				_ = s.db.UpdateAgentStatus(r.Context(), agent.ID, core.AgentTerminated)
				cleaned++
			} else if desc.WorkflowExecutionInfo.Status != enumspb.WORKFLOW_EXECUTION_STATUS_RUNNING {
				// Workflow not running — mark terminated
				_ = s.db.UpdateAgentStatus(r.Context(), agent.ID, core.AgentTerminated)
				cleaned++
			}
		}
	}

	writeJSON(w, http.StatusOK, core.SuccessResponse(map[string]any{
		"cleaned": cleaned,
		"total":   len(agents),
	}))
}

func (s *Server) internalBroadcast(w http.ResponseWriter, r *http.Request) {
	var event map[string]any
	if err := json.NewDecoder(r.Body).Decode(&event); err != nil {
		writeJSON(w, http.StatusBadRequest, core.ErrorResponse[any]("invalid event"))
		return
	}

	// Persist chat_message events from agents
	if event["type"] == "chat_message" {
		projectID, _ := event["project_id"].(string)
		agentID, _ := event["agent_id"].(string)
		content, _ := event["content"].(string)
		if projectID != "" && content != "" {
			var aid *string
			if agentID != "" {
				aid = &agentID
			}
			_, _ = s.db.InsertChatMessage(r.Context(), projectID, aid, "assistant", content)
		}
	}

	s.wsHub.BroadcastEvent(event)
	writeJSON(w, http.StatusOK, core.SuccessResponse(map[string]any{"broadcast": true}))
}

// --- Chat Messages ---

func (s *Server) listChatMessages(w http.ResponseWriter, r *http.Request) {
	projectID := r.URL.Query().Get("project_id")
	if projectID == "" {
		writeJSON(w, http.StatusBadRequest, core.ErrorResponse[any]("project_id is required"))
		return
	}
	msgs, err := s.db.ListChatMessages(r.Context(), projectID, 200)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, core.SuccessResponse(msgs))
}

func (s *Server) listAgentChatMessages(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	msgs, err := s.db.ListAgentChatMessages(r.Context(), id, 200)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, core.SuccessResponse(msgs))
}

// --- Notifications ---

func (s *Server) listNotifications(w http.ResponseWriter, r *http.Request) {
	projectID := r.URL.Query().Get("project_id")
	if projectID == "" {
		writeJSON(w, http.StatusBadRequest, core.ErrorResponse[any]("project_id is required"))
		return
	}

	limit := 50
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			limit = parsed
		}
	}
	if limit > 200 {
		limit = 200
	}

	offset := 0
	if o := r.URL.Query().Get("offset"); o != "" {
		if parsed, err := strconv.Atoi(o); err == nil && parsed >= 0 {
			offset = parsed
		}
	}

	unreadOnly := r.URL.Query().Get("unread_only") == "true"

	notifications, total, err := s.db.ListNotificationsFiltered(r.Context(), projectID, unreadOnly, limit, offset)
	if err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"data":    notifications,
		"total":   total,
	})
}

func (s *Server) unreadNotificationCount(w http.ResponseWriter, r *http.Request) {
	projectID := r.URL.Query().Get("project_id")
	if projectID == "" {
		writeJSON(w, http.StatusBadRequest, core.ErrorResponse[any]("project_id is required"))
		return
	}

	count, err := s.db.UnreadNotificationCount(r.Context(), projectID)
	if err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, core.SuccessResponse(map[string]any{
		"unread_count": count,
	}))
}

func (s *Server) markNotificationRead(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := s.db.MarkNotificationRead(r.Context(), id); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, core.SuccessResponse(map[string]any{
		"id":   id,
		"read": true,
	}))
}

func (s *Server) markAllNotificationsRead(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ProjectID string `json:"project_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, core.ErrorResponse[any]("invalid request body"))
		return
	}
	if req.ProjectID == "" {
		writeJSON(w, http.StatusBadRequest, core.ErrorResponse[any]("project_id is required"))
		return
	}

	count, err := s.db.MarkAllNotificationsRead(r.Context(), req.ProjectID)
	if err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, core.SuccessResponse(map[string]any{
		"marked_read": count,
	}))
}

// --- Work Items ---

func (s *Server) listWorkItems(w http.ResponseWriter, r *http.Request) {
	var projectID, status *string
	if pid := r.URL.Query().Get("project_id"); pid != "" {
		projectID = &pid
	}
	if st := r.URL.Query().Get("status"); st != "" {
		status = &st
	}
	items, err := s.db.ListWorkItems(r.Context(), projectID, status)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, core.SuccessResponse(items))
}

func (s *Server) createWorkItem(w http.ResponseWriter, r *http.Request) {
	var req core.CreateWorkItemRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, core.ErrorResponse[any]("invalid request body"))
		return
	}
	if req.Title == "" || req.ProjectID == "" {
		writeJSON(w, http.StatusBadRequest, core.ErrorResponse[any]("title and project_id are required"))
		return
	}
	item, err := s.db.InsertWorkItem(r.Context(), req)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, core.SuccessResponse(item))
}

func (s *Server) getWorkItem(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	item, err := s.db.GetWorkItem(r.Context(), id)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, core.SuccessResponse(item))
}

func (s *Server) updateWorkItemStatus(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var req struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, core.ErrorResponse[any]("invalid request body"))
		return
	}
	if req.Status == "" {
		writeJSON(w, http.StatusBadRequest, core.ErrorResponse[any]("status is required"))
		return
	}

	// Get work item first to retrieve project_id for the broadcast
	item, err := s.db.GetWorkItem(r.Context(), id)
	if err != nil {
		writeError(w, err)
		return
	}

	if err := s.db.UpdateWorkItemStatus(r.Context(), id, core.WorkItemStatus(req.Status)); err != nil {
		writeError(w, err)
		return
	}

	// Broadcast WebSocket event
	s.wsHub.BroadcastEvent(map[string]any{
		"type":         "work_item_update",
		"work_item_id": id,
		"status":       req.Status,
		"project_id":   item.ProjectID,
	})

	writeJSON(w, http.StatusOK, core.SuccessResponse(map[string]any{
		"id":     id,
		"status": req.Status,
	}))
}

// --- Artifacts ---

func (s *Server) listArtifacts(w http.ResponseWriter, r *http.Request) {
	var projectID, artifactType *string
	if pid := r.URL.Query().Get("project_id"); pid != "" {
		projectID = &pid
	}
	if at := r.URL.Query().Get("artifact_type"); at != "" {
		artifactType = &at
	}
	artifacts, err := s.db.ListArtifacts(r.Context(), projectID, artifactType)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, core.SuccessResponse(artifacts))
}

func (s *Server) getArtifact(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	artifact, err := s.db.GetArtifact(r.Context(), id)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, core.SuccessResponse(artifact))
}

func (s *Server) getArtifactContent(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	artifact, err := s.db.GetArtifact(r.Context(), id)
	if err != nil {
		writeError(w, err)
		return
	}
	if artifact.Content == nil {
		writeJSON(w, http.StatusNotFound, core.ErrorResponse[any]("artifact has no inline content"))
		return
	}
	w.Header().Set("Content-Type", artifact.MimeType)
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(*artifact.Content))
}

func (s *Server) approveArtifact(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var req core.ApproveArtifactRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, core.ErrorResponse[any]("invalid request body"))
		return
	}
	artifact, err := s.db.UpdateArtifactApproval(r.Context(), id, req.Approved, req.By, req.Comment)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, core.SuccessResponse(artifact))
}

// --- Settings ---

func (s *Server) getSettings(w http.ResponseWriter, r *http.Request) {
	cfg, err := config.LoadDefault()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, core.ErrorResponse[any](err.Error()))
		return
	}
	writeJSON(w, http.StatusOK, core.SuccessResponse(cfg))
}

func (s *Server) updateSettings(w http.ResponseWriter, r *http.Request) {
	var cfg config.Config
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		writeJSON(w, http.StatusBadRequest, core.ErrorResponse[any]("invalid request body"))
		return
	}
	configPath := config.DirsPath() + "/config.toml"
	if err := cfg.Save(configPath); err != nil {
		writeJSON(w, http.StatusInternalServerError, core.ErrorResponse[any](err.Error()))
		return
	}
	saved, err := config.LoadDefault()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, core.ErrorResponse[any](err.Error()))
		return
	}
	writeJSON(w, http.StatusOK, core.SuccessResponse(saved))
}

// --- WebSocket ---

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

func (s *Server) wsStream(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Error("websocket upgrade failed", "error", err)
		return
	}

	client := &wsClient{
		hub:  s.wsHub,
		conn: conn,
		send: make(chan []byte, 256),
	}
	s.wsHub.register <- client

	go client.writePump()
	go client.readPump()
}

// --- WebSocket Hub ---

type wsHub struct {
	clients    map[*wsClient]bool
	broadcast  chan []byte
	register   chan *wsClient
	unregister chan *wsClient
	mu         sync.Mutex
}

func newWSHub() *wsHub {
	return &wsHub{
		clients:    make(map[*wsClient]bool),
		broadcast:  make(chan []byte),
		register:   make(chan *wsClient),
		unregister: make(chan *wsClient),
	}
}

func (h *wsHub) run() {
	heartbeatTicker := time.NewTicker(30 * time.Second)
	defer heartbeatTicker.Stop()

	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()
		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
			h.mu.Unlock()
		case msg := <-h.broadcast:
			h.mu.Lock()
			for client := range h.clients {
				select {
				case client.send <- msg:
				default:
					close(client.send)
					delete(h.clients, client)
				}
			}
			h.mu.Unlock()
		case <-heartbeatTicker.C:
			hb, _ := json.Marshal(map[string]any{
				"type":      "heartbeat",
				"timestamp": time.Now().UTC().Format(time.RFC3339),
			})
			h.mu.Lock()
			for client := range h.clients {
				select {
				case client.send <- hb:
				default:
					close(client.send)
					delete(h.clients, client)
				}
			}
			h.mu.Unlock()
		}
	}
}

// BroadcastEvent sends an event to all connected WebSocket clients.
func (h *wsHub) BroadcastEvent(event any) {
	data, err := json.Marshal(event)
	if err != nil {
		slog.Error("failed to marshal event", "error", err)
		return
	}
	h.broadcast <- data
}

type wsClient struct {
	hub  *wsHub
	conn *websocket.Conn
	send chan []byte
}

func (c *wsClient) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()
	c.conn.SetReadLimit(4096)
	c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})
	for {
		_, _, err := c.conn.ReadMessage()
		if err != nil {
			break
		}
	}
}

func (c *wsClient) writePump() {
	ticker := time.NewTicker(54 * time.Second)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()
	for {
		select {
		case msg, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// --- Helpers ---

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, err error) {
	status := http.StatusInternalServerError

	if errors.Is(err, core.ErrProjectNotFound) || errors.Is(err, core.ErrAgentNotFound) ||
		errors.Is(err, core.ErrWorkItemNotFound) || errors.Is(err, core.ErrArtifactNotFound) ||
		errors.Is(err, core.ErrNotificationNotFound) {
		status = http.StatusNotFound
	} else if errors.Is(err, core.ErrInvalidState) {
		status = http.StatusBadRequest
	} else if errors.Is(err, core.ErrPermissionDenied) {
		status = http.StatusForbidden
	}

	var coreErr *core.Error
	if errors.As(err, &coreErr) {
		switch coreErr.Kind {
		case core.ErrKindNotFound:
			status = http.StatusNotFound
		case core.ErrKindBadRequest:
			status = http.StatusBadRequest
		case core.ErrKindPermission:
			status = http.StatusForbidden
		}
	}

	writeJSON(w, status, core.ErrorResponse[any](err.Error()))
}

func corsMiddleware(cfg config.Config, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if cfg.API.CORSEnabled {
			origin := r.Header.Get("Origin")
			allowed := false
			for _, o := range cfg.API.CORSOrigins {
				if o == "*" || o == origin {
					allowed = true
					break
				}
			}
			if !allowed && len(cfg.API.CORSOrigins) == 0 {
				allowed = true
			}
			if allowed {
				w.Header().Set("Access-Control-Allow-Origin", origin)
			}
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			w.Header().Set("Access-Control-Max-Age", "86400")

			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusNoContent)
				return
			}
		}

		if r.URL.Path != "/" && strings.HasSuffix(r.URL.Path, "/") {
			r.URL.Path = strings.TrimSuffix(r.URL.Path, "/")
		}

		next.ServeHTTP(w, r)
	})
}

// Shutdown gracefully shuts down the server.
func (s *Server) Shutdown(ctx context.Context) error {
	if s.temporal != nil {
		s.temporal.Close()
	}
	return nil
}
