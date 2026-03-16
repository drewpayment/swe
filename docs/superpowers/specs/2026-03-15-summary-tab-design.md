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
- Agents: count of agents excluding `"terminated"` and `"complete"` status (same filter as the page's existing `orchestrator` logic)
- Duration: time since `project.created_at` (human-readable, e.g. "2h 15m")

**Output location** — always visible:
- If `project.repo_source === "local"` and `project.working_directory`: show folder icon + path (copyable)
- If `project.repo_source === "remote"` and `project.repo_url`: show external link icon + URL (clickable)
- If `project.repo_source === "none"` or undefined: show "No repository configured" muted text

**Artifacts list** — if any artifacts exist:
- Each artifact shows: type icon (GitPullRequest for PRs, FileText for others), name, approval status badge
- If no artifacts yet: "No artifacts produced yet" muted text

### Complete Mode (phase === "complete")

Shown when the project is finished. Same sections as active mode, plus:

**Completion banner** — top of the panel:
- Green success background (subtle, not overwhelming)
- Checkmark icon + "Project Complete"
- Duration: total time from `project.created_at` to the latest `completed_at` among work items. If no work items have `completed_at`, fall back to `project.updated_at` (acknowledged as an approximation — it reflects the last metadata change, not necessarily the exact completion moment).

**Work summary** — below artifacts:
- Compact list of all work items showing: title, assigned agent emoji + role label, completion time
- Sorted by `completed_at` (earliest first). Items without `completed_at` sort to the end.

---

## Page Integration

### File: `web/src/app/(app)/projects/[id]/page.tsx`

**Tab changes:**
- Add "Summary" as a third tab option: `boardTab: "board" | "inbox" | "summary"`
- Tab order: Board | Inbox | Summary
- Default tab logic: `useState` initializes to `"board"`. A `useEffect` watches for `project` to load — when `project` is non-null and `project.phase === "complete"`, set `boardTab` to `"summary"` (only on initial load, not on subsequent phase changes during the session). Use a ref to track whether the initial default has been applied.
- The Summary tab should show a green dot indicator when `project.phase === "complete"` and the user is NOT currently on the Summary tab (draws attention, disappears when they view it — same pattern as the Inbox unread dot).

**Rendering:**
- When `boardTab === "summary"`: render `<SummaryPanel>` with project, agents, artifacts, workItems props

---

## Cosmo Offline Messaging

### File: `web/src/components/project/cosmo-chat-panel.tsx`

Current behavior: when orchestrator is terminated/complete, the input is disabled with placeholder "Cosmo is offline."

**Change:** Add a `projectPhase` prop (string) to `CosmoChatPanel`. Use it to distinguish offline states:
- If `orchestrator` is non-null and `orchestrator.status === "complete"`: show header status "Completed", placeholder "Cosmo has finished"
- If `orchestrator` is non-null and `orchestrator.status === "terminated"`: show "Offline", placeholder "Cosmo is offline"
- If `orchestrator` is null and `projectPhase === "complete"`: show "Completed", placeholder "Cosmo has finished"
- If `orchestrator` is null otherwise: show "Offline", placeholder "Cosmo is offline"

Input remains disabled in all offline states. No functional change to send behavior.

---

## Light/Dark Mode

All new components must support both themes using `dark:` variants, consistent with the recent theme migration (commit `b01e10d`).

---

## Data Flow

No new data fetching. The SummaryPanel receives all data as props from the page component, which already fetches and maintains: `project`, `agents`, `artifacts`, `workItems`.

**Note:** Artifacts also appear on the Board tab via `ArtifactsPanel`. This duplication is intentional — the Board tab shows artifacts in the context of work items, while the Summary tab shows them as consolidated output. The existing loading skeleton already renders three tab placeholders, which coincidentally matches the new tab count.

## Out of Scope

- Backend changes to keep Cosmo alive post-completion
- Restart Cosmo functionality
- Artifact content viewing (existing feature on artifact detail pages)
- Export/download of project output
