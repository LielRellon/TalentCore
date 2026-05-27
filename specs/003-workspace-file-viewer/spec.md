# Feature Specification: Live Workspace File Viewer (Phase 3)

**Feature Branch**: `003-workspace-file-viewer`  
**Created**: 2026-05-27  
**Status**: Draft  
**Input**: User description: "A live file workspace view for the Run Console — a file explorer + read-only viewer beside the event timeline, a typing/reveal animation for write_file so it looks like live coding, auto-select the file being written, and make Run Console the default view. Adds workspace-confined read-files backend endpoints."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Watch files appear and "type out" as the agent codes (Priority: P1)

While an AI employee works, the user sees, beside the event timeline, the files the agent is
creating/changing. When the agent writes a file, the viewer opens that file and its content reveals
progressively — as if being typed — so the run reads like live coding. The file being written is
auto-selected so the user's attention follows the agent.

**Why this priority**: This is the headline of the phase — turning the structured event stream into a
visceral "watch it code" experience the user explicitly asked for. Without it, the phase delivers nothing new.

**Independent Test**: Start a run that writes a file; confirm the file appears in the explorer, the
viewer auto-opens it, and its content animates in progressively rather than appearing all at once.

**Acceptance Scenarios**:

1. **Given** a run in progress, **When** the agent writes a file, **Then** that file appears in the
   file explorer and is auto-selected in the viewer.
2. **Given** the agent just wrote a file, **When** the viewer shows it, **Then** the content reveals
   progressively (a typing/streaming effect) and ends exactly equal to what was actually written.
3. **Given** the agent writes a second file, **When** that write occurs, **Then** the viewer switches
   focus to the newly written file.
4. **Given** the typing animation is mid-reveal, **When** the user clicks another file, **Then** the
   viewer immediately shows that file's full content (the animation never blocks interaction).

---

### User Story 2 - Browse and read workspace files anytime (Priority: P1)

The user can click any file in the explorer to see its full, current content in a read-only viewer —
during a run and after it ends, including after reopening a finished run.

**Why this priority**: The explorer is only useful if any file can be inspected on demand, not just
the one being animated. Equal-priority foundation for Story 1.

**Independent Test**: With files present (live or finished run), click each file and confirm its full
current content displays read-only.

**Acceptance Scenarios**:

1. **Given** files exist in the run's workspace, **When** the user clicks a file, **Then** its full
   current content is shown read-only.
2. **Given** a finished run is reopened, **When** the user browses the explorer, **Then** the files
   and their final content are available to view.
3. **Given** a file the agent overwrote multiple times, **When** the user opens it, **Then** the
   viewer shows the current (latest) content.
4. **Given** the viewer shows a file, **When** the user looks for an edit affordance, **Then** there
   is none — viewing is strictly read-only.

---

### User Story 3 - Run Console is the default view (Priority: P2)

Opening the app lands the user on the Run Console (the primary experience), with Chat still reachable.

**Why this priority**: Fixes the discoverability problem (the console was a subtle tab users missed),
but the console itself already works, so it ranks below the new viewer capability.

**Independent Test**: Load the app fresh; confirm the Run Console is shown first and Chat is still
reachable via a clearly visible control.

**Acceptance Scenarios**:

1. **Given** a fresh app load, **When** the page renders, **Then** the Run Console is the active view.
2. **Given** the Run Console is active, **When** the user wants Chat, **Then** a clearly visible
   control switches to it (and back).

---

### Edge Cases

- **Out-of-workspace request**: A request to read a path outside the run's workspace is refused; the
  UI shows nothing leaked and a clear "unavailable" state.
- **Binary/very large file**: A non-text or very large file is not animated; the viewer shows a clear
  "cannot display / too large" notice instead of garbling the layout.
- **File listed but unreadable**: If a file in the list cannot be read (removed, error), selecting it
  shows a clear error rather than a blank or stuck pane.
- **Run with no file writes**: A run that writes no files shows an empty explorer with a friendly
  "no files yet" state, not a broken panel.
- **Rapid successive writes**: Many quick writes still end with each file's viewer content equal to
  its actual final content (animation may be skipped/short to keep up).
- **Reopen finished run**: Files and content come from stored/worktree state; if the workspace no
  longer exists, the UI explains it rather than failing silently.
- **Backend unavailable**: If file content cannot be fetched, the viewer shows a clear error, not an
  indefinite spinner.

## Requirements *(mandatory)*

### Functional Requirements

**File listing & explorer (Stories 1, 2)**

- **FR-001**: The system MUST present, beside the event timeline, a list of the files in the current
  run's workspace — at minimum every file the agent has created or modified during the run.
- **FR-002**: The file list MUST update as the run progresses so newly written files appear.
- **FR-003**: The explorer MUST let the user select any listed file to view it.

**Viewer (Stories 1, 2)**

- **FR-004**: The system MUST show a selected file's full current content in a read-only viewer using
  a clear monospace presentation.
- **FR-005**: The viewer MUST be strictly read-only — it MUST provide no means to edit or write files.
- **FR-006**: When a file is overwritten, the viewer MUST be able to show the latest content.

**Live "typing" reveal (Story 1)**

- **FR-007**: When the agent writes a file during a live run, the system MUST auto-select that file in
  the viewer.
- **FR-008**: The system MUST reveal newly written content progressively (a typing/streaming visual
  effect) rather than all at once.
- **FR-009**: The progressive reveal MUST be presentation-only: the final displayed content MUST equal
  exactly what was actually written; the effect MUST NOT alter stored content.
- **FR-010**: The animation MUST NOT block interaction — selecting another file immediately shows its
  full content and interrupts the animation.

**Backend read access (Stories 1, 2; security)**

- **FR-011**: The system MUST provide a way to list a run's workspace files and to read a single
  file's current content for display.
- **FR-012**: All workspace reads MUST be confined to the specified run's workspace; any path
  resolving outside it MUST be refused (the same containment guarantee applied to the agent's tools,
  constitution Principle I).
- **FR-013**: Workspace reads MUST NOT expose secrets or any content outside the run's workspace.
- **FR-014**: Non-text or oversized files MUST be handled gracefully (clear notice, no layout break).

**Default view (Story 3)**

- **FR-015**: The application MUST open to the Run Console by default, with the Chat view still
  reachable via a clearly visible control.

**Errors (all)**

- **FR-016**: All failure conditions (out-of-workspace, unreadable file, missing workspace, backend
  unavailable) MUST surface a clear message, never an indefinite loading state.

### Key Entities *(include if feature involves data)*

- **Workspace File (view model)**: A file in the run's workspace — its workspace-relative path, and
  (when opened) its current text content. Read-only.
- **File List**: The set of files shown in the explorer for a run, derived from the run's write events
  and/or a backend listing of the workspace.
- **Viewer State (view model)**: Which file is selected, its content, and whether a reveal animation
  is currently playing.
- **Run (existing)**: The run whose workspace is being browsed; supplies the file list source and the
  workspace identity used for confined reads.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: When the agent writes a file, it appears in the explorer and auto-opens in the viewer
  within ~2 seconds, in 100% of writes during a run.
- **SC-002**: For every written file, the viewer's final displayed content matches the actual file
  content exactly (no truncation or alteration from the animation) in 100% of cases.
- **SC-003**: A user can open any listed file and read its full current content, both during a run and
  after reopening a finished run.
- **SC-004**: 100% of attempts to read a path outside the run's workspace are refused, with no content
  outside the workspace ever displayed.
- **SC-005**: The progressive reveal can be interrupted at any time by selecting another file, which
  shows that file's full content immediately (no blocking).
- **SC-006**: On a fresh app load, the Run Console is the first view shown, and the user can reach
  Chat without instruction.
- **SC-007**: Every error condition shows a clear message within a few seconds rather than an
  indefinite spinner.

## Assumptions

- The Phase 1/2 backend and the Run Console exist and work as delivered; this phase extends them.
- The run's workspace (git worktree) is available on the host for reading during and after the run
  (it is retained after a run in the current design); if absent, the UI explains it.
- The agent's written files are text in the common case; non-text/oversized handling is a graceful
  fallback, not a primary path.
- A single local user; no authentication or multi-user concerns.
- The "typing" effect is cosmetic — the real content is whatever the agent wrote.

## Out of Scope (this phase)

- Editing files or writing back to the workspace from the UI.
- A live preview / running-app iframe of the workspace (next phase).
- VS Code extension / native IDE driving (later phase).
- Multi-agent / parallel run views.
- Heavy syntax-highlighting editor integration and version/diff views (current content only).
- Authentication, multi-user, cloud persistence.
