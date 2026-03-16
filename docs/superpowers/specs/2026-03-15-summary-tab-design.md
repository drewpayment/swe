# Summary Tab — Design Spec

## Goal

Add a persistent "Summary" tab to the project detail page's board panel that shows project stats, artifacts, and output location during active work, and transitions to a completion view when the project finishes. Auto-select this tab on page load when the project phase is "complete."

## Context

When a project reaches "Phase: Complete," users currently see done cards in the kanban but have no consolidated view of what was produced, where the code lives, or what to do next. This tab fills that gap while also providing useful live stats during active work.

## Scope

- Frontend only (Next.js component + page integration)
- No new API endpoints required — all data already available from existing state (project, agents, artifacts, workItems)
- Cosmo offline messaging tweak (frontend only — no backend restart logic)

---

## Component

### File: `web/src/components/project/summary-panel.tsx`

**Props:**
```typescript
interface SummaryPanelProps {
  project: Project;
  agents: Agent[];
  artifacts: Artifact[];
  workItems: WorkItem[];
}
```

### Active Work Mode (phase != "complete")

Shown when the project is still in progress.

**Stats row** — horizontal row of 3 stat cards:
- Items: `{completed}/{total}` with progress percentage
- Agents: count of active (non-terminated) agents
- Duration: time since `project.created_at` (human-readable, e.g. "2h 15m")

**Output location** — always visible:
- If `project.repo_source === "local"` and `project.working_directory`: show folder icon + path (copyable)
- If `project.repo_source === "remote"` and `project.repo_url`: show external link icon + URL (clickable)
- If neither: show "No repository configured" muted text

**Artifacts list** — if any artifacts exist:
- Each artifact shows: type icon (GitPullRequest for PRs, FileText for others), name, approval status badge
- If no artifacts yet: "No artifacts produced yet" muted text

### Complete Mode (phase === "complete")

Shown when the project is finished. Same sections as active mode, plus:

**Completion banner** — top of the panel:
- Green success background (subtle, not overwhelming)
- Checkmark icon + "Project Complete"
- Duration: total time from `project.created_at` to last work item's `completed_at` (or `project.updated_at`)

**Work summary** — below artifacts:
- Compact list of all work items showing: title, assigned agent emoji + role label, completion time
- Sorted by completion time (earliest first)

---

## Page Integration

### File: `web/src/app/(app)/projects/[id]/page.tsx`

**Tab changes:**
- Add "Summary" as a third tab option: `boardTab: "board" | "inbox" | "summary"`
- Tab order: Board | Inbox | Summary
- Default tab on page load:
  - If `project.phase === "complete"` → default to `"summary"`
  - Otherwise → default to `"board"` (current behavior)
- The tab should show a small indicator when project is complete (e.g. a green dot, similar to the inbox unread dot)

**Rendering:**
- When `boardTab === "summary"`: render `<SummaryPanel>` with project, agents, artifacts, workItems props

---

## Cosmo Offline Messaging

### File: `web/src/components/project/cosmo-chat-panel.tsx`

Current behavior: when orchestrator is terminated/complete, the input is disabled with placeholder "Cosmo is offline."

**Change:** Keep the input visually present but disabled. Update the placeholder to: `"Cosmo is offline"`. Update the header status text from "Offline" to "Completed" when the orchestrator's status is specifically "complete" (vs "terminated" which stays as "Offline").

This is a minor copy change, no functional change to the disabled input behavior.

---

## Light/Dark Mode

All new components must support both themes using `dark:` variants, consistent with the recent theme migration (commit `b01e10d`).

---

## Data Flow

No new data fetching. The SummaryPanel receives all data as props from the page component, which already fetches and maintains: `project`, `agents`, `artifacts`, `workItems`.

## Out of Scope

- Backend changes to keep Cosmo alive post-completion
- Restart Cosmo functionality
- Artifact content viewing (existing feature on artifact detail pages)
- Export/download of project output
