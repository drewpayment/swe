# UI Audit Remediation Plan

**Date**: 2026-03-15
**Scope**: Web UI quality improvements across accessibility, responsiveness, theming, performance, and design system consistency.
**Source**: Comprehensive audit of all 18 files in `web/src/`.

---

## Phase 1: Harden (Critical Safety & Accessibility)

### 1.1 Add ARIA labels to all interactive elements
- Notification bell button in `sidebar.tsx` — add `aria-label="Notifications"`
- Tab switcher in `projects/[id]/page.tsx` — add `role="tablist"`, `role="tab"`, `aria-selected`
- Agent spawn menu button — add `aria-label="Add agent"`
- Chat input — add `aria-label="Send message"`
- All icon-only buttons (plus, refresh, delete) — add `aria-label`
- Notification badge count — add `aria-live="polite"`

### 1.2 Fix color-only status indicators
- Agent status dots — add text label or icon alongside color (e.g., checkmark for active, x for error)
- Work item kanban columns — add status text, not just color-coded borders
- Connection status dot in sidebar — add "Connected"/"Disconnected" text
- Badge variants — ensure icon or text differentiator beyond color

### 1.3 Add keyboard navigation to dropdowns
- Notification dropdown — Escape to close, arrow keys to navigate items
- Agent spawn menu — Escape to close, arrow keys to navigate roles
- Consider extracting a reusable `Dropdown` component

### 1.4 Add error boundaries
- Create `error.tsx` in each route segment: `(app)/`, `dashboard/`, `projects/`, `projects/[id]/`, `agents/[agentId]/`, `settings/`
- Include retry button and meaningful error message

### 1.5 Fix API client auth
- Add auth header support to `fetchApi` in `api.ts` (BetterAuth session cookie or token)
- Handle 401 responses with redirect to login

### 1.6 Add semantic HTML landmarks
- Replace outer `<div>` wrappers with `<main>`, `<section>`, `<article>` where appropriate
- Add `aria-current="page"` to active nav link in sidebar
- Use `<nav>` for tab navigation in project detail

### 1.7 Add form validation
- Settings page inputs — validate URL formats, required fields
- New project form — validate required fields before submit
- Show inline error messages below invalid fields

### 1.8 Remove hard-coded `.orb.local` domain
- Move to environment variable or config in `config.ts`

---

## Phase 2: Extract (Code Deduplication & Component Splitting)

### 2.1 Extract shared utilities to `lib/utils.ts`
- `timeAgo()` — remove from dashboard, projects, agent detail pages
- `phaseVariant` mapping — move to `lib/types.ts` alongside `STATUS_COLOR`, `ROLE_EMOJI`

### 2.2 Create `<Input>` component
- Extract common input styling into `components/ui/input.tsx`
- Support variants: text, select, textarea
- Replace duplicated input classes in `projects/new/page.tsx`, `settings/page.tsx`, `projects/[id]/page.tsx`

### 2.3 Break up `projects/[id]/page.tsx` (1,060 lines)
- Extract `AgentsSidebar` component (agent list + spawn menu)
- Extract `KanbanBoard` component (work items by status)
- Extract `ChatPanel` component (messages + input)
- Extract `InboxPanel` component (notifications/interactions)
- Extract `ArtifactsPanel` component (artifact list)
- Main page becomes composition of these + tab state management

### 2.4 Break up `agents/[agentId]/page.tsx` (472 lines)
- Extract `CodeActivity` component (file change tracking)
- Extract `ConversationPanel` component (chat messages)
- Extract `extractCodeActivity()` to a utility

### 2.5 Break up `settings/page.tsx` (288 lines)
- Extract `LLMConfigSection` component
- Extract `K8sConfigSection` component
- Extract `PlatformStatusSection` component

---

## Phase 3: Adapt (Responsive Design)

### 3.1 Add mobile navigation
- Make sidebar collapsible with hamburger toggle on `md:` breakpoint
- Sidebar overlays content on mobile (or drawer pattern)
- Add close-on-navigate behavior

### 3.2 Fix grid layouts for mobile
- Project detail: stack `col-span-3`/`col-span-9` to full width below `lg:`
- Dashboard stats: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`
- Settings: `grid-cols-1 md:grid-cols-2`
- New project form: full width on mobile

### 3.3 Fix kanban board overflow
- Stack kanban columns vertically on mobile
- Add horizontal scroll indicator on tablet
- Ensure `min-w-[160px]` doesn't force overflow

### 3.4 Fix touch targets
- Ensure all interactive elements are minimum 44x44px on touch devices
- Increase padding on badge buttons, notification items, status indicators

### 3.5 Fix notification dropdown positioning
- Use fixed/portal positioning to prevent clipping on small screens
- Consider full-screen notification panel on mobile

---

## Phase 4: Normalize (Design System & Theming)

### 4.1 Establish CSS custom property token system
- Define color tokens in `globals.css` for both light and dark themes
- Map Tailwind classes to CSS variables: `--color-bg-primary`, `--color-bg-secondary`, `--color-accent`, etc.
- Replace scattered `zinc-*`, `blue-*` references with token classes

### 4.2 Add light mode
- Define light theme CSS variables in `globals.css`
- Add theme toggle component (persist preference in localStorage)
- Update `layout.tsx` to support dynamic theme class
- Fix `button.tsx` `ring-offset-zinc-900` to use theme-aware token

### 4.3 Fix color inconsistencies
- Standardize on one green scale (`green-*` or `emerald-*`, not both)
- Standardize blue accent shades (pick 2-3 from the blue scale, not 4+)
- Standardize yellow/orange usage

### 4.4 Add Firefox scrollbar support
- Add `scrollbar-width: thin; scrollbar-color` to `globals.css`

### 4.5 Standardize border radius
- Pick one: `rounded-lg` everywhere, or define token scale (`--radius-sm`, `--radius-md`, `--radius-lg`)
- Fix card (`rounded-xl`) vs button (`rounded-lg`) inconsistency

### 4.6 Upgrade typography
- Replace Inter with a distinctive font pairing per design principles
- Or: if Inter stays, lean into it with proper weight scale and fluid sizing

### 4.7 Replace emoji indicators with proper UI
- Replace status emoji (🟢🔴⚪) with styled indicator dots using Lucide icons or CSS
- Consider replacing role emoji with custom icons or styled badges
- Keep emoji in display names if desired, but remove from functional UI elements

---

## Phase 5: Optimize (Performance)

### 5.1 Replace notification polling with WebSocket
- Use existing WebSocket connection to push unread count updates
- Remove 15s `setInterval` in `sidebar.tsx`
- Remove 15s `refreshAll` polling in project detail (use WS events to trigger refresh)

### 5.2 Add memoization
- `useMemo` for `statusIndicator()`, kanban column filtering, chat message mapping
- `React.memo` for extracted sub-components (AgentsSidebar, KanbanBoard, etc.)
- `useCallback` for event handlers passed as props

### 5.3 Fix WebSocket reconnection
- Implement exponential backoff in `ws.ts` (replace fixed 5s delay)
- Add max retry limit with user-visible reconnection UI

### 5.4 Remove console.log from production code
- Remove `console.log` in `ws.ts:26`

### 5.5 Remove artificial 3s delay
- Remove hardcoded `setTimeout(3000)` in `agents/[agentId]/page.tsx:165`
- Replace with proper loading state or WebSocket-driven update

---

## Phase 6: Polish (Visual Quality)

### 6.1 Add loading skeletons
- Create skeleton components for cards, lists, stats
- Replace spinner-only loading states in dashboard, project detail, agent detail

### 6.2 Improve hover states
- Add background change on card hover (not just border)
- Add pressed/active state to buttons
- Add hover state to notification items and list rows

### 6.3 Add custom favicon
- Replace default Next.js favicon with SWE brand icon

### 6.4 Fix outdated comment
- `types.ts:1` — update "matching Rust types" to "matching Go types"

---

## Phase 7: Animate (Micro-interactions)

### 7.1 Tab transition animation
- Add smooth content transition on tab switch in project detail

### 7.2 Notification badge animation
- Animate count badge when value changes (scale pulse)

### 7.3 Page load staggered reveal
- Add subtle staggered entrance animation for card grids and lists

---

## Phase 8: Onboard (Empty States)

### 8.1 Design empty states
- Dashboard with no projects — "Create your first project" CTA
- Project with no agents — explain how to spawn agents
- Empty artifact list — explain what artifacts are
- Empty work items — explain the workflow
- Empty chat — prompt for first message

---

## Execution Notes

- **Phases 1-2 are prerequisites** — harden and extract before other work to avoid rework
- **Phases 3-5 can run in parallel** after extraction is complete
- **Phases 6-8 are polish** — do last
- Each phase task can be worked as an independent unit
- Run `bun run build` and `bun run lint` after each phase to verify no regressions
