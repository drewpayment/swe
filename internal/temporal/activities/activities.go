package activities

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/drewpayment/swe/internal/config"
	"github.com/drewpayment/swe/internal/core"
	"github.com/drewpayment/swe/internal/db"
)

// Activities holds shared dependencies for all activity implementations.
type Activities struct {
	cfg  config.Config
	pool *db.Pool
}

// New creates a new Activities instance.
func New(cfg config.Config, pool *db.Pool) *Activities {
	return &Activities{cfg: cfg, pool: pool}
}

// CompletionRequest is the input for an LLM completion.
type CompletionRequest struct {
	Model        string            `json:"model"`
	Messages     []Message         `json:"messages"`
	SystemPrompt *string           `json:"system_prompt,omitempty"`
	MaxTokens    *int              `json:"max_tokens,omitempty"`
	Temperature  *float64          `json:"temperature,omitempty"`
	Tools        []json.RawMessage `json:"tools,omitempty"`
}

// Message is a chat message.
type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// CompletionResponse is the response from an LLM completion.
type CompletionResponse struct {
	Content      string            `json:"content"`
	ToolCalls    []json.RawMessage `json:"tool_calls,omitempty"`
	InputTokens  int               `json:"input_tokens"`
	OutputTokens int               `json:"output_tokens"`
	Model        string            `json:"model"`
	FinishReason string            `json:"finish_reason"`
}

// LLMComplete calls the LiteLLM proxy for a completion.
func (a *Activities) LLMComplete(ctx context.Context, req CompletionRequest) (*CompletionResponse, error) {
	if req.Model == "" {
		req.Model = a.cfg.LLM.DefaultModel
	}

	// Build OpenAI-compatible request — prepend system message if provided
	messages := req.Messages
	if req.SystemPrompt != nil && *req.SystemPrompt != "" {
		messages = append([]Message{{Role: "system", Content: *req.SystemPrompt}}, messages...)
	}
	body := map[string]any{
		"model":    req.Model,
		"messages": messages,
	}
	if req.MaxTokens != nil {
		body["max_tokens"] = *req.MaxTokens
	}
	if req.Temperature != nil {
		body["temperature"] = *req.Temperature
	}
	if len(req.Tools) > 0 {
		body["tools"] = req.Tools
	}

	payload, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("marshaling request: %w", err)
	}

	url := fmt.Sprintf("%s/v1/chat/completions", a.cfg.LLM.ProxyURL)
	httpReq, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	if a.cfg.LLM.APIKey != "" {
		httpReq.Header.Set("Authorization", "Bearer "+a.cfg.LLM.APIKey)
	}

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("LLM request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("reading response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("LLM returned status %d: %s", resp.StatusCode, string(respBody))
	}

	// Parse OpenAI-compatible response
	var result struct {
		Choices []struct {
			Message struct {
				Content   string            `json:"content"`
				ToolCalls []json.RawMessage `json:"tool_calls,omitempty"`
			} `json:"message"`
			FinishReason string `json:"finish_reason"`
		} `json:"choices"`
		Usage struct {
			PromptTokens     int `json:"prompt_tokens"`
			CompletionTokens int `json:"completion_tokens"`
		} `json:"usage"`
		Model string `json:"model"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("parsing response: %w", err)
	}

	if len(result.Choices) == 0 {
		return nil, fmt.Errorf("LLM returned no choices")
	}

	return &CompletionResponse{
		Content:      result.Choices[0].Message.Content,
		ToolCalls:    result.Choices[0].Message.ToolCalls,
		InputTokens:  result.Usage.PromptTokens,
		OutputTokens: result.Usage.CompletionTokens,
		Model:        result.Model,
		FinishReason: result.Choices[0].FinishReason,
	}, nil
}

// CreateSandbox creates a K8s sandbox (stub).
func (a *Activities) CreateSandbox(ctx context.Context, agentID string, role string) (string, error) {
	// Stub: would use client-go to create a K8s Job
	return fmt.Sprintf("sandbox-%s", agentID), nil
}

// DeleteSandbox deletes a K8s sandbox (stub).
func (a *Activities) DeleteSandbox(ctx context.Context, sandboxID string) error {
	// Stub
	return nil
}

// CreateArtifact creates an artifact (stub).
func (a *Activities) CreateArtifact(ctx context.Context, name string, content string) (string, error) {
	// Stub
	return "artifact-id", nil
}

// ExecuteTool executes an agent tool (stub).
func (a *Activities) ExecuteTool(ctx context.Context, toolName string, args json.RawMessage) (json.RawMessage, error) {
	// Stub
	return json.RawMessage(`{"result": "stub"}`), nil
}

// BroadcastChatInput is the input for BroadcastChat.
type BroadcastChatInput struct {
	AgentID   string `json:"agent_id"`
	AgentName string `json:"agent_name"`
	ProjectID string `json:"project_id"`
	Content   string `json:"content"`
}

// BroadcastChat sends a chat message to the WebSocket hub via the API.
func (a *Activities) BroadcastChat(ctx context.Context, input BroadcastChatInput) error {
	baseURL := a.cfg.API.InternalURL
	if baseURL == "" {
		baseURL = fmt.Sprintf("http://localhost:%d", a.cfg.API.Port)
	}
	url := baseURL + "/api/v1/internal/broadcast"
	payload, _ := json.Marshal(map[string]any{
		"type":       "chat_message",
		"agent_id":   input.AgentID,
		"agent_name": input.AgentName,
		"content":    input.Content,
		"project_id": input.ProjectID,
	})
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("broadcast failed: %w", err)
	}
	resp.Body.Close()
	return nil
}

// CreateNotificationInput is the input for CreateNotification.
type CreateNotificationInput struct {
	ProjectID string  `json:"project_id"`
	AgentID   *string `json:"agent_id,omitempty"`
	Type      string  `json:"type"`
	Priority  string  `json:"priority"`
	Title     string  `json:"title"`
	Body      string  `json:"body"`
	ActionURL *string `json:"action_url,omitempty"`
}

// CreateNotification creates a notification in the database and broadcasts it via WebSocket.
func (a *Activities) CreateNotification(ctx context.Context, input CreateNotificationInput) error {
	notif, err := a.pool.InsertNotification(ctx, core.Notification{
		ProjectID: input.ProjectID,
		AgentID:   input.AgentID,
		Type:      core.NotificationType(input.Type),
		Priority:  input.Priority,
		Title:     input.Title,
		Body:      input.Body,
		ActionURL: input.ActionURL,
	})
	if err != nil {
		return fmt.Errorf("creating notification: %w", err)
	}

	// Broadcast via internal HTTP endpoint (same pattern as BroadcastChat)
	baseURL := a.cfg.API.InternalURL
	if baseURL == "" {
		baseURL = fmt.Sprintf("http://localhost:%d", a.cfg.API.Port)
	}
	url := baseURL + "/api/v1/internal/broadcast"
	payload, _ := json.Marshal(map[string]any{
		"type":         "notification_created",
		"notification": notif,
		"project_id":   input.ProjectID,
	})
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("broadcast failed: %w", err)
	}
	resp.Body.Close()
	return nil
}

// UpdateAgentStatusInput is the input for UpdateAgentStatus.
type UpdateAgentStatusInput struct {
	AgentID string `json:"agent_id"`
	Status  string `json:"status"`
}

// UpdateAgentStatus updates an agent's status in the database.
func (a *Activities) UpdateAgentStatus(ctx context.Context, input UpdateAgentStatusInput) error {
	return a.pool.UpdateAgentStatus(ctx, input.AgentID, core.AgentStatus(input.Status))
}

// CreateWorkItemInput is the input for CreateWorkItem activity.
type CreateWorkItemInput struct {
	ProjectID   string `json:"project_id"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Priority    string `json:"priority"`
}

// CreateWorkItemOutput is the output for CreateWorkItem activity.
type CreateWorkItemOutput struct {
	ID    string `json:"id"`
	Title string `json:"title"`
}

// CreateWorkItem creates a work item in the database.
func (a *Activities) CreateWorkItem(ctx context.Context, input CreateWorkItemInput) (*CreateWorkItemOutput, error) {
	desc := input.Description
	priority := core.Priority(input.Priority)
	if priority == "" {
		priority = core.PriorityNormal
	}
	item, err := a.pool.InsertWorkItem(ctx, core.CreateWorkItemRequest{
		Title:       input.Title,
		Description: &desc,
		Priority:    priority,
		ProjectID:   input.ProjectID,
	})
	if err != nil {
		return nil, fmt.Errorf("creating work item: %w", err)
	}
	return &CreateWorkItemOutput{ID: item.ID, Title: item.Title}, nil
}

// CreateAgentInput is the input for CreateAgent activity.
type CreateAgentInput struct {
	ProjectID string `json:"project_id"`
	Name      string `json:"name"`
	Role      string `json:"role"`
}

// CreateAgentOutput is the output for CreateAgent activity.
type CreateAgentOutput struct {
	AgentID    string `json:"agent_id"`
	WorkflowID string `json:"workflow_id"`
}

// CreateAgent creates a new agent in the database.
func (a *Activities) CreateAgent(ctx context.Context, input CreateAgentInput) (*CreateAgentOutput, error) {
	agent, err := a.pool.InsertAgent(ctx, input.Name, core.AgentRole(input.Role), &input.ProjectID)
	if err != nil {
		return nil, fmt.Errorf("creating agent: %w", err)
	}
	workflowID := fmt.Sprintf("agent-%s", agent.ID)
	return &CreateAgentOutput{
		AgentID:    agent.ID,
		WorkflowID: workflowID,
	}, nil
}

// AssignWorkItemInput is the input for AssignWorkItem activity.
type AssignWorkItemInput struct {
	WorkItemID string `json:"work_item_id"`
	AgentID    string `json:"agent_id"`
}

// AssignWorkItem assigns a work item to an agent.
func (a *Activities) AssignWorkItem(ctx context.Context, input AssignWorkItemInput) error {
	return a.pool.UpdateWorkItemAssignment(ctx, input.WorkItemID, &input.AgentID)
}

// UpdateWorkItemStatusInput is the input for UpdateWorkItemStatus activity.
type UpdateWorkItemStatusInput struct {
	WorkItemID string `json:"work_item_id"`
	Status     string `json:"status"`
}

// UpdateWorkItemStatus updates a work item's status.
func (a *Activities) UpdateWorkItemStatus(ctx context.Context, input UpdateWorkItemStatusInput) error {
	return a.pool.UpdateWorkItemStatus(ctx, input.WorkItemID, core.WorkItemStatus(input.Status))
}

// ListProjectAgentsInput is the input for ListProjectAgents activity.
type ListProjectAgentsInput struct {
	ProjectID string `json:"project_id"`
}

// ListProjectAgentsOutput is the output for ListProjectAgents activity.
type ListProjectAgentsOutput struct {
	Agents []AgentSummary `json:"agents"`
}

// AgentSummary is a lightweight representation of an agent.
type AgentSummary struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Role   string `json:"role"`
	Status string `json:"status"`
}

// ListProjectAgents lists agents for a project.
func (a *Activities) ListProjectAgents(ctx context.Context, input ListProjectAgentsInput) (*ListProjectAgentsOutput, error) {
	agents, err := a.pool.ListAgentsByProject(ctx, input.ProjectID)
	if err != nil {
		return nil, fmt.Errorf("listing agents: %w", err)
	}
	summaries := make([]AgentSummary, len(agents))
	for i, ag := range agents {
		summaries[i] = AgentSummary{
			ID:     ag.ID,
			Name:   ag.Name,
			Role:   string(ag.Role),
			Status: string(ag.Status),
		}
	}
	return &ListProjectAgentsOutput{Agents: summaries}, nil
}

// ListWorkItemsInput is the input for ListWorkItems activity.
type ListWorkItemsInput struct {
	ProjectID string `json:"project_id"`
}

// ListWorkItemsOutput is the output for ListWorkItems activity.
type ListWorkItemsOutput struct {
	Items []WorkItemSummary `json:"items"`
}

// WorkItemSummary is a lightweight representation of a work item.
type WorkItemSummary struct {
	ID         string  `json:"id"`
	Title      string  `json:"title"`
	Status     string  `json:"status"`
	Priority   string  `json:"priority"`
	AssignedTo *string `json:"assigned_to,omitempty"`
}

// ListWorkItems lists work items for a project.
func (a *Activities) ListWorkItems(ctx context.Context, input ListWorkItemsInput) (*ListWorkItemsOutput, error) {
	items, err := a.pool.ListWorkItems(ctx, &input.ProjectID, nil)
	if err != nil {
		return nil, fmt.Errorf("listing work items: %w", err)
	}
	summaries := make([]WorkItemSummary, len(items))
	for i, item := range items {
		summaries[i] = WorkItemSummary{
			ID:         item.ID,
			Title:      item.Title,
			Status:     string(item.Status),
			Priority:   string(item.Priority),
			AssignedTo: item.AssignedAgentID,
		}
	}
	return &ListWorkItemsOutput{Items: summaries}, nil
}

// UpdateProjectPhaseInput is the input for UpdateProjectPhase activity.
type UpdateProjectPhaseInput struct {
	ProjectID string `json:"project_id"`
	Phase     string `json:"phase"`
}

// UpdateProjectPhase updates a project's phase.
func (a *Activities) UpdateProjectPhase(ctx context.Context, input UpdateProjectPhaseInput) error {
	return a.pool.UpdateProjectPhase(ctx, input.ProjectID, core.ProjectPhase(input.Phase))
}

// GetProjectContextInput is the input for GetProjectContext.
type GetProjectContextInput struct {
	ProjectID string `json:"project_id"`
}

// GetProjectContextOutput contains project details for agent context.
type GetProjectContextOutput struct {
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Phase       string   `json:"phase"`
	WorkItems   []string `json:"work_items"`
	AgentCount  int      `json:"agent_count"`
}

// GetProjectContext retrieves project information for agent context building.
func (a *Activities) GetProjectContext(ctx context.Context, input GetProjectContextInput) (*GetProjectContextOutput, error) {
	project, err := a.pool.GetProject(ctx, input.ProjectID)
	if err != nil {
		return nil, err
	}

	workItems, err := a.pool.ListWorkItems(ctx, &input.ProjectID, nil)
	if err != nil {
		return nil, err
	}

	agents, err := a.pool.ListAgents(ctx, &input.ProjectID)
	if err != nil {
		return nil, err
	}

	var itemSummaries []string
	for _, wi := range workItems {
		summary := fmt.Sprintf("[%s] %s (%s)", wi.Status, wi.Title, wi.Priority)
		itemSummaries = append(itemSummaries, summary)
	}

	desc := ""
	if project.Description != nil {
		desc = *project.Description
	}

	return &GetProjectContextOutput{
		Name:        project.Name,
		Description: desc,
		Phase:       string(project.Phase),
		WorkItems:   itemSummaries,
		AgentCount:  len(agents),
	}, nil
}
