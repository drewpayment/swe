package workflows

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/drewpayment/swe/internal/temporal/activities"
	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"
)

// AgentWorkflowInput is the input for an agent workflow.
type AgentWorkflowInput struct {
	AgentID           string  `json:"agent_id"`
	Name              string  `json:"name"`
	Role              string  `json:"role"`
	ProjectID         *string `json:"project_id,omitempty"`
	InitialContext    *string `json:"initial_context,omitempty"`
	InitialWorkItemID *string `json:"initial_work_item_id,omitempty"`
}

// AgentWorkflowOutput is the output of an agent workflow.
type AgentWorkflowOutput struct {
	AgentID     string   `json:"agent_id"`
	ArtifactIDs []string `json:"artifact_ids"`
	Summary     string   `json:"summary"`
}

// parsedWorkItem represents a work item extracted from LLM output.
type parsedWorkItem struct {
	Title       string `json:"title"`
	Description string `json:"description"`
}

// parseWorkItems extracts work items from an LLM response using multiple strategies.
func parseWorkItems(response string) []parsedWorkItem {
	var items []parsedWorkItem
	seen := make(map[string]bool)

	addItem := func(title, desc string) {
		title = strings.TrimSpace(title)
		desc = strings.TrimSpace(desc)
		if title == "" {
			return
		}
		// If the title is generic/placeholder, use description as title
		titleLower := strings.ToLower(title)
		if titleLower == "work item title" || titleLower == "title" || titleLower == "work item" {
			if desc != "" {
				// Use first sentence of description as title (max 80 chars)
				title = desc
				if idx := strings.IndexAny(title, ".!;\n"); idx > 0 && idx < 80 {
					title = title[:idx]
				} else if len(title) > 80 {
					title = title[:80]
				}
			} else {
				return
			}
		}
		// If duplicate, append a number
		if seen[title] {
			for i := 2; i <= 20; i++ {
				numbered := fmt.Sprintf("%s (%d)", title, i)
				if !seen[numbered] {
					title = numbered
					break
				}
			}
		}
		if seen[title] {
			return
		}
		seen[title] = true
		items = append(items, parsedWorkItem{Title: title, Description: desc})
	}

	// Strategy 1: JSON array extraction
	if jsonItems := parseWorkItemsJSON(response); len(jsonItems) > 0 {
		for _, item := range jsonItems {
			addItem(item.Title, item.Description)
		}
		if len(items) > 0 {
			return items
		}
	}

	lines := strings.Split(response, "\n")

	// Strategy 2: Markdown headers (### Title or ## Title) followed by description
	for i, line := range lines {
		line = strings.TrimSpace(line)
		if (strings.HasPrefix(line, "### ") || strings.HasPrefix(line, "## ")) && !strings.HasPrefix(line, "#### ") {
			title := strings.TrimLeft(line, "# ")
			title = strings.TrimSpace(title)
			// Collect description from subsequent non-header lines
			var descParts []string
			for j := i + 1; j < len(lines); j++ {
				next := strings.TrimSpace(lines[j])
				if next == "" {
					continue
				}
				if strings.HasPrefix(next, "## ") || strings.HasPrefix(next, "### ") {
					break
				}
				descParts = append(descParts, next)
				if len(descParts) >= 3 {
					break
				}
			}
			addItem(title, strings.Join(descParts, " "))
		}
	}
	if len(items) > 0 {
		return items
	}

	// Strategy 3: **WI: <title>** — <description> (existing format)
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if idx := strings.Index(line, "**WI:"); idx >= 0 {
			rest := line[idx+5:]
			if endIdx := strings.Index(rest, "**"); endIdx >= 0 {
				title := strings.TrimSpace(rest[:endIdx])
				desc := ""
				remainder := rest[endIdx+2:]
				if dashIdx := strings.Index(remainder, "—"); dashIdx >= 0 {
					desc = strings.TrimSpace(remainder[dashIdx+len("—"):])
				} else if dashIdx := strings.Index(remainder, "-"); dashIdx >= 0 {
					desc = strings.TrimSpace(remainder[dashIdx+1:])
				}
				addItem(title, desc)
			}
		}
	}
	if len(items) > 0 {
		return items
	}

	// Strategy 4: Numbered list with bold titles: 1. **<title>** — <description> or 1. **<title>**: <description>
	numberedBoldRe := regexp.MustCompile(`^\d+\.\s+\*\*(.+?)\*\*\s*[—:\-]\s*(.*)`)
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if m := numberedBoldRe.FindStringSubmatch(line); m != nil {
			addItem(m[1], m[2])
		}
	}
	if len(items) > 0 {
		return items
	}

	// Strategy 5: Simple numbered list: 1. <title> - <description>
	simpleNumberedRe := regexp.MustCompile(`^\d+\.\s+(.+?)(?:\s*[-—:]\s+(.*))?$`)
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if m := simpleNumberedRe.FindStringSubmatch(line); m != nil {
			title := strings.TrimSpace(m[1])
			// Skip if it looks like a paragraph or instruction rather than a work item
			if len(title) > 120 || strings.HasPrefix(title, "**") {
				continue
			}
			desc := ""
			if len(m) > 2 {
				desc = strings.TrimSpace(m[2])
			}
			addItem(title, desc)
		}
	}

	return items
}

// parseWorkItemsJSON tries to extract work items from a JSON array in the response.
func parseWorkItemsJSON(response string) []parsedWorkItem {
	// Look for JSON arrays in the response
	start := strings.Index(response, "[")
	if start < 0 {
		return nil
	}

	// Find the matching closing bracket
	depth := 0
	end := -1
	for i := start; i < len(response); i++ {
		switch response[i] {
		case '[':
			depth++
		case ']':
			depth--
			if depth == 0 {
				end = i + 1
				break
			}
		}
		if end > 0 {
			break
		}
	}
	if end <= start {
		return nil
	}

	jsonStr := response[start:end]
	var rawItems []struct {
		Title       string `json:"title"`
		Description string `json:"description"`
		Desc        string `json:"desc"`
	}
	if err := json.Unmarshal([]byte(jsonStr), &rawItems); err != nil {
		return nil
	}

	var items []parsedWorkItem
	for _, ri := range rawItems {
		desc := ri.Description
		if desc == "" {
			desc = ri.Desc
		}
		if ri.Title != "" {
			items = append(items, parsedWorkItem{Title: ri.Title, Description: desc})
		}
	}
	return items
}

// systemPromptForRole returns the system prompt for a given agent role.
func systemPromptForRole(role string, projectContext string) string {
	base := "You are an AI agent in the SWE agentic platform. "

	switch role {
	case "project_orchestrator":
		return base + `You are the Project Orchestrator — a fully autonomous project manager. Your job is to:
1. Break down project goals into concrete, actionable work items
2. Monitor project progress and ensure tasks are being completed
3. Coordinate between different agents (architect, coder, sdet, etc.)
4. Proactively identify blockers, reassign work, and advance project phases
5. Provide status updates and answer questions about the project

When given a project brief, analyze it and produce work items. You MUST format them as a JSON array:
[{"title": "Work item title", "description": "Detailed description"}]

If you cannot use JSON, use numbered items with bold titles:
1. **Title** — Description

Be concise, professional, and action-oriented.

` + projectContext

	case "architect":
		return base + `You are the Architect agent — an autonomous technical designer. Your job is to:
1. Design system architecture and make technology decisions
2. Create architecture decision records (ADRs)
3. Define API contracts and data models
4. Review designs for scalability, security, and maintainability

You work autonomously on assigned work items. Report progress regularly.
Be precise and technical. Reference specific technologies and patterns.

` + projectContext

	case "coder":
		return base + `You are the Coder agent — an autonomous software developer. Your job is to:
1. Implement features based on work items and architectural decisions
2. Write clean, well-tested, production-quality code
3. Create pull requests with clear descriptions
4. Follow project coding standards and patterns

You work autonomously on assigned work items. Report progress regularly.
Be practical and code-focused. Show actual code when relevant.

` + projectContext

	case "sdet":
		return base + `You are the SDET (Software Development Engineer in Test) agent — an autonomous QA engineer. Your job is to:
1. Create comprehensive test plans and test cases
2. Write automated tests (unit, integration, e2e)
3. Identify edge cases and potential failure modes
4. Report test results and coverage metrics

You work autonomously on assigned work items. Report progress regularly.
Be thorough and detail-oriented about quality.

` + projectContext

	default:
		return base + "You are a specialized agent. Help the team with your expertise. Work autonomously on assigned tasks. " + projectContext
	}
}

// AgentWorkflow manages the lifecycle of an individual agent with real LLM integration.
func AgentWorkflow(ctx workflow.Context, input AgentWorkflowInput) (*AgentWorkflowOutput, error) {
	logger := workflow.GetLogger(ctx)
	logger.Info("AgentWorkflow started", "agent_id", input.AgentID, "role", input.Role)

	// Activity options for LLM calls (longer timeout)
	llmCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		StartToCloseTimeout: 120 * time.Second,
		RetryPolicy: &temporal.RetryPolicy{
			MaximumAttempts: 2,
		},
	})

	// Activity options for quick operations
	actCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		StartToCloseTimeout: 30 * time.Second,
		RetryPolicy: &temporal.RetryPolicy{
			MaximumAttempts: 3,
		},
	})

	// Activity options for OpenCode operations (longer timeout for code tasks)
	openCodeCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		StartToCloseTimeout: 5 * time.Minute,
		HeartbeatTimeout:    60 * time.Second,
		RetryPolicy: &temporal.RetryPolicy{
			MaximumAttempts: 2,
		},
	})

	phase := "initialize"
	var conversationHistory []activities.Message
	var artifactIDs []string

	// OpenCode state for specialist agents
	var openCodeServerURL string
	var openCodeSessionID string

	err := workflow.SetQueryHandler(ctx, "status", func() (map[string]any, error) {
		return map[string]any{
			"agent_id": input.AgentID,
			"phase":    phase,
			"status":   "running",
		}, nil
	})
	if err != nil {
		return nil, err
	}

	messageChan := workflow.GetSignalChannel(ctx, "message")
	cancelChan := workflow.GetSignalChannel(ctx, "cancel")

	projectID := ""
	if input.ProjectID != nil {
		projectID = *input.ProjectID
	}

	// --- Helper closures ---

	// cosmoName returns "Cosmo" for orchestrators, otherwise the agent name.
	cosmoName := func() string {
		if input.Role == "project_orchestrator" {
			return "Cosmo"
		}
		return input.Name
	}

	// broadcastReply sends a chat message to the UI.
	broadcastReply := func(content string) {
		_ = workflow.ExecuteActivity(actCtx, "BroadcastChat", activities.BroadcastChatInput{
			AgentID:   input.AgentID,
			AgentName: cosmoName(),
			ProjectID: projectID,
			Content:   content,
		}).Get(ctx, nil)
	}

	// createNotification creates a persistent notification and broadcasts it via WebSocket.
	createNotification := func(ntype, priority, title, body string) {
		_ = workflow.ExecuteActivity(actCtx, "CreateNotification", activities.CreateNotificationInput{
			ProjectID: projectID,
			AgentID:   &input.AgentID,
			Type:      ntype,
			Priority:  priority,
			Title:     title,
			Body:      body,
		}).Get(ctx, nil)
	}

	// updateStatus updates the agent status in the database.
	updateStatus := func(status string) {
		_ = workflow.ExecuteActivity(actCtx, "UpdateAgentStatus", activities.UpdateAgentStatusInput{
			AgentID: input.AgentID,
			Status:  status,
		}).Get(ctx, nil)
	}

	// fetchProjectContextFull gets the full project context struct.
	fetchProjectContextFull := func() *activities.GetProjectContextOutput {
		if projectID == "" {
			return nil
		}
		var projCtx activities.GetProjectContextOutput
		err := workflow.ExecuteActivity(actCtx, "GetProjectContext", activities.GetProjectContextInput{
			ProjectID: projectID,
		}).Get(ctx, &projCtx)
		if err != nil {
			return nil
		}
		return &projCtx
	}

	// fetchProjectContext gets latest project state as a string.
	fetchProjectContext := func() string {
		projCtx := fetchProjectContextFull()
		if projCtx == nil {
			return ""
		}
		result := fmt.Sprintf("Project: %s\nDescription: %s\nPhase: %s\nAgents: %d",
			projCtx.Name, projCtx.Description, projCtx.Phase, projCtx.AgentCount)
		if len(projCtx.WorkItems) > 0 {
			result += "\nWork Items:\n" + strings.Join(projCtx.WorkItems, "\n")
		}
		return result
	}

	// callLLM sends a message to the LLM and returns the response.
	callLLM := func(systemPrompt string, userMessage string) string {
		updateStatus("active")

		conversationHistory = append(conversationHistory, activities.Message{
			Role:    "user",
			Content: userMessage,
		})

		var resp activities.CompletionResponse
		err := workflow.ExecuteActivity(llmCtx, "LLMComplete", activities.CompletionRequest{
			Messages:     conversationHistory,
			SystemPrompt: &systemPrompt,
		}).Get(ctx, &resp)

		if err != nil {
			errMsg := fmt.Sprintf("LLM unavailable: %s. Will retry on next cycle.", err.Error())
			updateStatus("idle")
			return errMsg
		}

		conversationHistory = append(conversationHistory, activities.Message{
			Role:    "assistant",
			Content: resp.Content,
		})

		updateStatus("idle")
		return resp.Content
	}

	// listWorkItems fetches current work items for the project.
	listWorkItems := func() *activities.ListWorkItemsOutput {
		if projectID == "" {
			return nil
		}
		var out activities.ListWorkItemsOutput
		err := workflow.ExecuteActivity(actCtx, "ListWorkItems", activities.ListWorkItemsInput{
			ProjectID: projectID,
		}).Get(ctx, &out)
		if err != nil {
			return nil
		}
		return &out
	}

	// listProjectAgents fetches current agents for the project.
	listProjectAgents := func() *activities.ListProjectAgentsOutput {
		if projectID == "" {
			return nil
		}
		var out activities.ListProjectAgentsOutput
		err := workflow.ExecuteActivity(actCtx, "ListProjectAgents", activities.ListProjectAgentsInput{
			ProjectID: projectID,
		}).Get(ctx, &out)
		if err != nil {
			return nil
		}
		return &out
	}

	// createWorkItems parses work items from LLM response and creates them.
	createWorkItems := func(response string) []activities.CreateWorkItemOutput {
		parsed := parseWorkItems(response)
		var created []activities.CreateWorkItemOutput
		for _, wi := range parsed {
			var out activities.CreateWorkItemOutput
			err := workflow.ExecuteActivity(actCtx, "CreateWorkItem", activities.CreateWorkItemInput{
				ProjectID:   projectID,
				Title:       wi.Title,
				Description: wi.Description,
				Priority:    "normal",
			}).Get(ctx, &out)
			if err != nil {
				logger.Warn("failed to create work item", "title", wi.Title, "error", err)
				continue
			}
			created = append(created, out)
		}
		return created
	}

	// spawnAgent creates a new agent and starts its child workflow.
	spawnAgent := func(name, role, context string) {
		var agentOut activities.CreateAgentOutput
		err := workflow.ExecuteActivity(actCtx, "CreateAgent", activities.CreateAgentInput{
			ProjectID: projectID,
			Name:      name,
			Role:      role,
		}).Get(ctx, &agentOut)
		if err != nil {
			logger.Warn("failed to create agent", "role", role, "error", err)
			return
		}

		childCtx := workflow.WithChildOptions(ctx, workflow.ChildWorkflowOptions{
			WorkflowID: agentOut.WorkflowID,
		})
		childInput := AgentWorkflowInput{
			AgentID:        agentOut.AgentID,
			Name:           name,
			Role:           role,
			ProjectID:      &projectID,
			InitialContext: &context,
		}
		// Start as fire-and-forget — the child runs independently
		workflow.ExecuteChildWorkflow(childCtx, AgentWorkflow, childInput)
		logger.Info("spawned child agent", "agent_id", agentOut.AgentID, "role", role)
	}

	// assignWorkItemsToAgents distributes unassigned work items to available agents.
	assignWorkItemsToAgents := func(workItems []activities.CreateWorkItemOutput, agents *activities.ListProjectAgentsOutput) {
		if agents == nil || len(agents.Agents) == 0 {
			return
		}

		// Build lists of agents by role (exclude orchestrators)
		var architects, coders, sdets []activities.AgentSummary
		for _, ag := range agents.Agents {
			if ag.ID == input.AgentID {
				continue // skip self
			}
			switch ag.Role {
			case "architect":
				architects = append(architects, ag)
			case "coder":
				coders = append(coders, ag)
			case "sdet":
				sdets = append(sdets, ag)
			}
		}

		// Simple round-robin assignment: architects get first items, coders get rest
		allWorkers := append(architects, coders...)
		allWorkers = append(allWorkers, sdets...)
		if len(allWorkers) == 0 {
			return
		}

		for i, wi := range workItems {
			agent := allWorkers[i%len(allWorkers)]
			_ = workflow.ExecuteActivity(actCtx, "AssignWorkItem", activities.AssignWorkItemInput{
				WorkItemID: wi.ID,
				AgentID:    agent.ID,
			}).Get(ctx, nil)
			_ = workflow.ExecuteActivity(actCtx, "UpdateWorkItemStatus", activities.UpdateWorkItemStatusInput{
				WorkItemID: wi.ID,
				Status:     "assigned",
			}).Get(ctx, nil)
		}
	}

	// --- Build initial project context ---
	projectContextStr := fetchProjectContext()
	systemPrompt := systemPromptForRole(input.Role, projectContextStr)

	// --- Determine heartbeat interval by role ---
	heartbeatInterval := 3 * time.Minute
	if input.Role == "project_orchestrator" {
		heartbeatInterval = 2 * time.Minute
	}

	// ===========================================================================
	// INITIALIZATION PHASE
	// ===========================================================================

	if input.Role == "project_orchestrator" {
		// --- ORCHESTRATOR INITIALIZATION ---
		if input.InitialContext != nil && *input.InitialContext != "" {
			phase = "planning"
			updateStatus("active")

			// Check if the project has a codebase configured
			if projectID != "" {
				initProjCtx := fetchProjectContextFull()
				if initProjCtx != nil && initProjCtx.RepoSource == "none" {
					createNotification(
						"action_needed", "high",
						"Codebase required",
						"Hey! I need a codebase to work with. Add a repo URL or local directory path to get started.",
					)
				}
			}

			prompt := fmt.Sprintf(
				"A new project has been created with this brief:\n\n%s\n\n"+
					"Analyze this project and produce a structured implementation plan.\n"+
					"Create 3-7 specific work items. Format them as a JSON array:\n"+
					"[{\"title\": \"Work item title\", \"description\": \"Detailed description of what needs to be done\"}]\n\n"+
					"After the JSON array, provide a brief summary of the plan.",
				*input.InitialContext,
			)

			response := callLLM(systemPrompt, prompt)
			broadcastReply(response)

			// Parse and create work items
			if projectID != "" {
				created := createWorkItems(response)

				if len(created) > 0 {
					var titles []string
					for _, wi := range created {
						titles = append(titles, wi.Title)
					}
					broadcastReply(fmt.Sprintf("Created %d work items: %s", len(created), strings.Join(titles, ", ")))

					// Notify about the plan
					createNotification(
						"status_update", "normal",
						"Project plan created",
						fmt.Sprintf("Created %d work items: %s", len(created), strings.Join(titles, ", ")),
					)
				}

				// Spawn specialist agents
				spawnAgent("Architect", "architect", fmt.Sprintf("You are assigned to project. Brief: %s", *input.InitialContext))
				spawnAgent("Coder", "coder", fmt.Sprintf("You are assigned to project. Brief: %s", *input.InitialContext))

				// Give child workflows a moment to register, then assign work items
				_ = workflow.Sleep(ctx, 3*time.Second)

				if len(created) > 0 {
					agentsOut := listProjectAgents()
					assignWorkItemsToAgents(created, agentsOut)
					broadcastReply("Assigned work items to specialist agents. Project is now in progress.")
				}

				// Notify that agents are active
				createNotification(
					"info", "low",
					"Specialist agents deployed",
					"Architect and Coder agents have been spawned and assigned work items.",
				)

				// Advance to building phase
				_ = workflow.ExecuteActivity(actCtx, "UpdateProjectPhase", activities.UpdateProjectPhaseInput{
					ProjectID: projectID,
					Phase:     "building",
				}).Get(ctx, nil)
			}

			phase = "managing"
			updateStatus("idle")
		} else {
			phase = "managing"
			updateStatus("idle")
			broadcastReply("Project Orchestrator is online. Send me a project brief or instructions to get started.")
		}
	} else {
		// --- SPECIALIST AGENT INITIALIZATION ---
		phase = "working"
		updateStatus("active")

		if input.InitialContext != nil && *input.InitialContext != "" {
			response := callLLM(systemPrompt, fmt.Sprintf(
				"You've been assigned to a project. Here's the context:\n\n%s\n\n"+
					"Acknowledge your assignment and describe how you'll approach your role. "+
					"If you have assigned work items, start working on the highest priority one.",
				*input.InitialContext,
			))
			broadcastReply(response)
		}

		// Check for initially assigned work item
		if input.InitialWorkItemID != nil && *input.InitialWorkItemID != "" {
			_ = workflow.ExecuteActivity(actCtx, "UpdateWorkItemStatus", activities.UpdateWorkItemStatusInput{
				WorkItemID: *input.InitialWorkItemID,
				Status:     "in_progress",
			}).Get(ctx, nil)
		}

		// Start OpenCode server and session if a repo is available
		if projectID != "" {
			specProjCtx := fetchProjectContextFull()
			if specProjCtx != nil && specProjCtx.WorkingDirectory != "" && specProjCtx.RepoSource != "none" {
				var serverOut activities.StartOpenCodeServerOutput
				serverErr := workflow.ExecuteActivity(openCodeCtx, "StartOpenCodeServer", activities.StartOpenCodeServerInput{
					ProjectID:        projectID,
					WorkingDirectory: specProjCtx.WorkingDirectory,
				}).Get(ctx, &serverOut)
				if serverErr == nil {
					openCodeServerURL = serverOut.ServerURL
					var sessionOut activities.CreateOpenCodeSessionOutput
					sessionErr := workflow.ExecuteActivity(actCtx, "CreateOpenCodeSession", activities.CreateOpenCodeSessionInput{
						ServerURL: openCodeServerURL,
					}).Get(ctx, &sessionOut)
					if sessionErr == nil {
						openCodeSessionID = sessionOut.SessionID
						logger.Info("OpenCode session established", "server_url", openCodeServerURL, "session_id", openCodeSessionID)
						broadcastReply(fmt.Sprintf("[%s] Connected to OpenCode for real coding in %s", input.Role, specProjCtx.WorkingDirectory))
					} else {
						logger.Warn("failed to create OpenCode session, falling back to LLM-only", "error", sessionErr)
					}
				} else {
					logger.Warn("failed to start OpenCode server, falling back to LLM-only", "error", serverErr)
				}
			}
		}

		updateStatus("idle")
	}

	// ===========================================================================
	// MAIN EVENT LOOP
	// ===========================================================================

	for {
		selector := workflow.NewSelector(ctx)

		// --- Message handler ---
		selector.AddReceive(messageChan, func(c workflow.ReceiveChannel, more bool) {
			var msg string
			c.Receive(ctx, &msg)
			logger.Info("agent received message", "message", msg)

			// Refresh project context for every message
			projectContextStr = fetchProjectContext()
			systemPrompt = systemPromptForRole(input.Role, projectContextStr)

			if input.Role == "project_orchestrator" {
				// Orchestrator handles user messages with full context
				response := callLLM(systemPrompt, msg)
				broadcastReply(response)

				// Check if the response contains new work items to create
				if projectID != "" {
					msgLower := strings.ToLower(msg)
					if strings.Contains(msgLower, "create") || strings.Contains(msgLower, "add") ||
						strings.Contains(msgLower, "work item") || strings.Contains(msgLower, "task") {
						created := createWorkItems(response)
						if len(created) > 0 {
							var titles []string
							for _, wi := range created {
								titles = append(titles, wi.Title)
							}
							broadcastReply(fmt.Sprintf("Created %d new work items: %s", len(created), strings.Join(titles, ", ")))

							agentsOut := listProjectAgents()
							assignWorkItemsToAgents(created, agentsOut)
						}
					}

					// Check if user asked to spawn agents
					if strings.Contains(msgLower, "spawn") || strings.Contains(msgLower, "create agent") ||
						strings.Contains(msgLower, "add agent") || strings.Contains(msgLower, "hire") {
						if strings.Contains(msgLower, "architect") {
							spawnAgent("Architect", "architect", "Spawned by orchestrator on user request.")
						}
						if strings.Contains(msgLower, "coder") || strings.Contains(msgLower, "developer") {
							spawnAgent("Coder", "coder", "Spawned by orchestrator on user request.")
						}
						if strings.Contains(msgLower, "sdet") || strings.Contains(msgLower, "test") || strings.Contains(msgLower, "qa") {
							spawnAgent("SDET", "sdet", "Spawned by orchestrator on user request.")
						}
					}
				}
			} else {
				// Specialist agents respond with context of their current work
				if openCodeServerURL != "" && openCodeSessionID != "" {
					// Forward user message to OpenCode session with context
					var codeOut activities.ExecuteCodeTaskOutput
					codeErr := workflow.ExecuteActivity(openCodeCtx, "ExecuteCodeTask", activities.ExecuteCodeTaskInput{
						ServerURL:      openCodeServerURL,
						SessionID:      openCodeSessionID,
						AgentRole:      input.Role,
						TaskPrompt:     fmt.Sprintf("The user says: %s. Continue working on your current task.", msg),
						ProjectContext: projectContextStr,
					}).Get(ctx, &codeOut)
					if codeErr == nil && codeOut.Success {
						broadcastReply(codeOut.Response)
					} else {
						// Fall back to LLM if OpenCode fails
						response := callLLM(systemPrompt, msg)
						broadcastReply(response)
					}
				} else {
					response := callLLM(systemPrompt, msg)
					broadcastReply(response)
				}
			}
		})

		// --- Cancel handler ---
		selector.AddReceive(cancelChan, func(c workflow.ReceiveChannel, more bool) {
			var reason string
			c.Receive(ctx, &reason)
			logger.Info("agent cancelled", "reason", reason)
			phase = "teardown"
		})

		// --- Heartbeat timer ---
		timerCtx, cancel := workflow.WithCancel(ctx)
		timer := workflow.NewTimer(timerCtx, heartbeatInterval)
		selector.AddFuture(timer, func(f workflow.Future) {
			if input.Role == "project_orchestrator" {
				orchestratorHeartbeat(ctx, actCtx, llmCtx, input, projectID, &conversationHistory, &systemPrompt, &phase, broadcastReply, updateStatus, callLLM, listWorkItems, listProjectAgents, spawnAgent, createNotification)
			} else {
				specialistHeartbeat(ctx, actCtx, openCodeCtx, llmCtx, input, projectID, &conversationHistory, &artifactIDs, &systemPrompt, &phase, &openCodeServerURL, &openCodeSessionID, broadcastReply, updateStatus, callLLM, listWorkItems, createNotification)
			}
		})

		selector.Select(ctx)
		cancel()

		if phase == "teardown" {
			break
		}
	}

	// --- Cleanup ---
	updateStatus("terminated")

	summary := fmt.Sprintf("Agent %s (%s) completed.", input.Name, input.Role)
	return &AgentWorkflowOutput{
		AgentID:     input.AgentID,
		ArtifactIDs: artifactIDs,
		Summary:     summary,
	}, nil
}

// orchestratorHeartbeat runs periodically for the project orchestrator to manage the project.
func orchestratorHeartbeat(
	ctx workflow.Context,
	actCtx workflow.Context,
	llmCtx workflow.Context,
	input AgentWorkflowInput,
	projectID string,
	conversationHistory *[]activities.Message,
	systemPrompt *string,
	phase *string,
	broadcastReply func(string),
	updateStatus func(string),
	callLLM func(string, string) string,
	listWorkItems func() *activities.ListWorkItemsOutput,
	listProjectAgents func() *activities.ListProjectAgentsOutput,
	spawnAgent func(string, string, string),
	createNotification func(string, string, string, string),
) {
	if projectID == "" {
		return
	}

	// Fetch current state
	workItems := listWorkItems()
	agents := listProjectAgents()
	if workItems == nil {
		return
	}

	// Refresh project context
	var projCtx activities.GetProjectContextOutput
	err := workflow.ExecuteActivity(actCtx, "GetProjectContext", activities.GetProjectContextInput{
		ProjectID: projectID,
	}).Get(ctx, &projCtx)
	if err != nil {
		return
	}
	projectContextStr := fmt.Sprintf("Project: %s\nDescription: %s\nPhase: %s\nAgents: %d",
		projCtx.Name, projCtx.Description, projCtx.Phase, projCtx.AgentCount)
	if len(projCtx.WorkItems) > 0 {
		projectContextStr += "\nWork Items:\n" + strings.Join(projCtx.WorkItems, "\n")
	}
	*systemPrompt = systemPromptForRole(input.Role, projectContextStr)

	// --- Check for stalled agents ---
	var stalledAgents []string
	if agents != nil {
		for _, ag := range agents.Agents {
			if ag.ID == input.AgentID {
				continue
			}
			if ag.Status == "error" || ag.Status == "terminated" {
				stalledAgents = append(stalledAgents, fmt.Sprintf("%s (%s, status: %s)", ag.Name, ag.Role, ag.Status))
			}
		}
	}

	// --- Check for stuck work items ---
	var stuckItems []string
	var pendingItems []string
	var completedCount, totalCount int
	for _, wi := range workItems.Items {
		totalCount++
		switch wi.Status {
		case "complete":
			completedCount++
		case "assigned":
			stuckItems = append(stuckItems, fmt.Sprintf("%s (assigned but not started)", wi.Title))
		case "pending":
			pendingItems = append(pendingItems, wi.ID)
		}
	}

	// --- If all work items are complete, advance project phase ---
	if totalCount > 0 && completedCount == totalCount {
		// Skip if project is already complete or archived — don't spam notifications
		if projCtx.Phase == "complete" || projCtx.Phase == "archived" {
			return
		}
		nextPhase := advancePhase(projCtx.Phase)
		if nextPhase != projCtx.Phase {
			_ = workflow.ExecuteActivity(actCtx, "UpdateProjectPhase", activities.UpdateProjectPhaseInput{
				ProjectID: projectID,
				Phase:     nextPhase,
			}).Get(ctx, nil)
			broadcastReply(fmt.Sprintf("All work items complete. Project phase advanced to: %s", nextPhase))
			createNotification(
				"status_update", "normal",
				fmt.Sprintf("Phase advanced to %s", nextPhase),
				fmt.Sprintf("All %d work items are complete. Project has moved from %s to %s.", totalCount, projCtx.Phase, nextPhase),
			)
		}
		// Don't create duplicate "all complete" notifications — the phase advance notification is sufficient.
		// If phase can't advance further (already at "complete"), we return early above.
		return
	}

	// --- Build assessment prompt if there are issues ---
	var issues []string
	if len(stalledAgents) > 0 {
		issues = append(issues, fmt.Sprintf("Stalled agents: %s", strings.Join(stalledAgents, "; ")))
	}
	if len(stuckItems) > 0 {
		issues = append(issues, fmt.Sprintf("Stuck work items: %s", strings.Join(stuckItems, "; ")))
	}
	if len(pendingItems) > 0 {
		issues = append(issues, fmt.Sprintf("%d work items still pending (unassigned)", len(pendingItems)))
	}

	if len(issues) > 0 {
		assessment := callLLM(*systemPrompt, fmt.Sprintf(
			"Project health check. Current issues:\n%s\n\n"+
				"Progress: %d/%d work items complete.\n"+
				"Assess the situation and recommend actions. Be brief.",
			strings.Join(issues, "\n"), completedCount, totalCount,
		))
		broadcastReply(fmt.Sprintf("[Health Check] %s", assessment))

		// Notify about stalled agents if any
		if len(stalledAgents) > 0 {
			createNotification(
				"action_needed", "high",
				"Agents need attention",
				fmt.Sprintf("The following agents appear stalled: %s. Attempting to respawn them.", strings.Join(stalledAgents, "; ")),
			)
		}

		// If there are stalled agents, try to respawn them
		if agents != nil {
			for _, ag := range agents.Agents {
				if ag.ID == input.AgentID {
					continue
				}
				if ag.Status == "error" || ag.Status == "terminated" {
					spawnAgent(ag.Name+" (respawned)", ag.Role, "You are respawning because the previous agent stalled. Continue working on assigned tasks.")
				}
			}
		}

		// Assign any pending items if there are available agents
		if len(pendingItems) > 0 && agents != nil {
			for _, wiID := range pendingItems {
				// Find an idle non-orchestrator agent
				for _, ag := range agents.Agents {
					if ag.ID == input.AgentID {
						continue
					}
					if ag.Status == "idle" || ag.Status == "active" {
						_ = workflow.ExecuteActivity(actCtx, "AssignWorkItem", activities.AssignWorkItemInput{
							WorkItemID: wiID,
							AgentID:    ag.ID,
						}).Get(ctx, nil)
						_ = workflow.ExecuteActivity(actCtx, "UpdateWorkItemStatus", activities.UpdateWorkItemStatusInput{
							WorkItemID: wiID,
							Status:     "assigned",
						}).Get(ctx, nil)
						break
					}
				}
			}
		}
	} else {
		// Periodic status broadcast even when things are going well
		broadcastReply(fmt.Sprintf("[Status] %d/%d work items complete. Project phase: %s.", completedCount, totalCount, projCtx.Phase))
	}
}

// specialistHeartbeat runs periodically for specialist agents to do autonomous work.
func specialistHeartbeat(
	ctx workflow.Context,
	actCtx workflow.Context,
	openCodeCtx workflow.Context,
	llmCtx workflow.Context,
	input AgentWorkflowInput,
	projectID string,
	conversationHistory *[]activities.Message,
	artifactIDs *[]string,
	systemPrompt *string,
	phase *string,
	openCodeServerURL *string,
	openCodeSessionID *string,
	broadcastReply func(string),
	updateStatus func(string),
	callLLM func(string, string) string,
	listWorkItems func() *activities.ListWorkItemsOutput,
	createNotification func(string, string, string, string),
) {
	logger := workflow.GetLogger(ctx)

	if projectID == "" {
		return
	}

	// Fetch work items to find assigned ones
	workItems := listWorkItems()
	if workItems == nil {
		return
	}

	// Find work items assigned to this agent
	var myItems []activities.WorkItemSummary
	for _, wi := range workItems.Items {
		if wi.AssignedTo != nil && *wi.AssignedTo == input.AgentID {
			myItems = append(myItems, wi)
		}
	}

	if len(myItems) == 0 {
		return
	}

	// Refresh context
	var projCtx activities.GetProjectContextOutput
	var projectContextStr string
	err := workflow.ExecuteActivity(actCtx, "GetProjectContext", activities.GetProjectContextInput{
		ProjectID: projectID,
	}).Get(ctx, &projCtx)
	if err == nil {
		projectContextStr = fmt.Sprintf("Project: %s\nDescription: %s\nPhase: %s",
			projCtx.Name, projCtx.Description, projCtx.Phase)
		if len(projCtx.WorkItems) > 0 {
			projectContextStr += "\nWork Items:\n" + strings.Join(projCtx.WorkItems, "\n")
		}
		*systemPrompt = systemPromptForRole(input.Role, projectContextStr)
	}

	// Work on the first non-complete item
	for _, wi := range myItems {
		if wi.Status == "complete" || wi.Status == "cancelled" {
			continue
		}

		// Mark as in progress if it's just assigned
		if wi.Status == "assigned" || wi.Status == "pending" {
			_ = workflow.ExecuteActivity(actCtx, "UpdateWorkItemStatus", activities.UpdateWorkItemStatusInput{
				WorkItemID: wi.ID,
				Status:     "in_progress",
			}).Get(ctx, nil)
		}

		// Use OpenCode if available, otherwise fall back to LLM-only
		if *openCodeServerURL != "" && *openCodeSessionID != "" {
			// Build a coding task prompt with work item context and role-specific instructions
			taskPrompt := fmt.Sprintf(
				"Work Item: %s\nPriority: %s\nRole: %s\n\n"+
					"Implement this work item. Write the actual code, make changes to files, and commit your work.\n"+
					"When you are completely done with this task, include the text WORK_ITEM_COMPLETE in your final message.",
				wi.Title, wi.Priority, input.Role,
			)

			updateStatus("active")
			broadcastReply(fmt.Sprintf("[%s] Coding: %s (via OpenCode)", input.Role, wi.Title))

			var codeOut activities.ExecuteCodeTaskOutput
			codeErr := workflow.ExecuteActivity(openCodeCtx, "ExecuteCodeTask", activities.ExecuteCodeTaskInput{
				ServerURL:      *openCodeServerURL,
				SessionID:      *openCodeSessionID,
				AgentRole:      input.Role,
				TaskPrompt:     taskPrompt,
				ProjectContext: projectContextStr,
			}).Get(ctx, &codeOut)

			if codeErr != nil {
				// Handle activity-level failure
				logger.Warn("OpenCode ExecuteCodeTask activity failed", "error", codeErr)
				updateStatus("idle")

				// Try to restart the server and retry once
				var serverOut activities.StartOpenCodeServerOutput
				restartErr := workflow.ExecuteActivity(openCodeCtx, "StartOpenCodeServer", activities.StartOpenCodeServerInput{
					ProjectID:        projectID,
					WorkingDirectory: projCtx.WorkingDirectory,
				}).Get(ctx, &serverOut)
				if restartErr == nil {
					*openCodeServerURL = serverOut.ServerURL
					var sessionOut activities.CreateOpenCodeSessionOutput
					sessErr := workflow.ExecuteActivity(actCtx, "CreateOpenCodeSession", activities.CreateOpenCodeSessionInput{
						ServerURL: *openCodeServerURL,
					}).Get(ctx, &sessionOut)
					if sessErr == nil {
						*openCodeSessionID = sessionOut.SessionID
						logger.Info("OpenCode server restarted successfully", "server_url", *openCodeServerURL)
					} else {
						logger.Warn("failed to recreate OpenCode session after restart", "error", sessErr)
					}
				} else {
					logger.Warn("failed to restart OpenCode server", "error", restartErr)
				}

				// Don't crash — will retry on next heartbeat
				break
			}

			if !codeOut.Success {
				// OpenCode returned an error in its response
				logger.Warn("OpenCode task returned error", "error", codeOut.Error)
				broadcastReply(fmt.Sprintf("[%s] OpenCode error on %s: %s. Will retry.", input.Role, wi.Title, codeOut.Error))
				updateStatus("idle")
				break
			}

			// Build a result summary
			resultMsg := fmt.Sprintf("[%s] Working on: %s\n\n%s", input.Role, wi.Title, codeOut.Response)
			if len(codeOut.FilesChanged) > 0 {
				resultMsg += fmt.Sprintf("\n\nFiles changed: %s", strings.Join(codeOut.FilesChanged, ", "))
			}
			if len(codeOut.Commits) > 0 {
				resultMsg += fmt.Sprintf("\nCommits: %s", strings.Join(codeOut.Commits, ", "))
			}
			broadcastReply(resultMsg)
			updateStatus("idle")

			// Check if the task is complete
			if strings.Contains(codeOut.Response, "WORK_ITEM_COMPLETE") {
				_ = workflow.ExecuteActivity(actCtx, "UpdateWorkItemStatus", activities.UpdateWorkItemStatusInput{
					WorkItemID: wi.ID,
					Status:     "complete",
				}).Get(ctx, nil)
				broadcastReply(fmt.Sprintf("[%s] Completed work item: %s", input.Role, wi.Title))
				createNotification(
					"status_update", "normal",
					fmt.Sprintf("Work item completed: %s", wi.Title),
					fmt.Sprintf("Agent %s has completed work item \"%s\".", input.Name, wi.Title),
				)
			}
		} else {
			// LLM-only fallback (no OpenCode session available)
			prompt := fmt.Sprintf(
				"You are working on: \"%s\" (priority: %s, status: %s)\n\n"+
					"Continue making progress on this work item. Describe what you've done and what the next steps are. "+
					"If you believe this work item is complete, say \"WORK_ITEM_COMPLETE\" in your response.",
				wi.Title, wi.Priority, wi.Status,
			)

			response := callLLM(*systemPrompt, prompt)
			broadcastReply(fmt.Sprintf("[%s] Working on: %s\n\n%s", input.Role, wi.Title, response))

			// Check if the agent considers the work item complete
			if strings.Contains(response, "WORK_ITEM_COMPLETE") {
				_ = workflow.ExecuteActivity(actCtx, "UpdateWorkItemStatus", activities.UpdateWorkItemStatusInput{
					WorkItemID: wi.ID,
					Status:     "complete",
				}).Get(ctx, nil)
				broadcastReply(fmt.Sprintf("[%s] Completed work item: %s", input.Role, wi.Title))
			}
		}

		// Only work on one item per heartbeat
		break
	}
}

// advancePhase determines the next project phase.
func advancePhase(current string) string {
	switch current {
	case "planning":
		return "designing"
	case "designing":
		return "building"
	case "building":
		return "testing"
	case "testing":
		return "deploying"
	case "deploying":
		return "complete"
	default:
		return current
	}
}
