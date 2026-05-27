# Feature Specification: Run Console UI (Phase 2)

**Feature Branch**: `002-run-console-ui`  
**Created**: 2026-05-27  
**Status**: Draft  
**Input**: User description: "Build a frontend web UI inside the existing TalentCore React+Vite app that lets a user pick an AI employee, start an autonomous run, watch its events stream live, approve gated actions, see the final result, and replay finished runs — consuming the Phase 1 backend HTTP/SSE API without changing the backend."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Start a run and watch it live (Priority: P1)

A user opens the Talent Core app, picks one AI employee from the roster, types a development task,
and starts a run. The app immediately switches to a live run view where the agent's activity —
its thoughts, each tool action and result, and status changes — appears as a readable timeline that
updates in real time. When the agent finishes, the user sees a clear final result.

**Why this priority**: This is the whole point of the phase — turning the headless backend into
something a person can drive and watch in a browser. Without it, there is no visible product.

**Independent Test**: With the backend running, pick an employee, submit a simple task, and confirm
the timeline populates live and ends with a final result panel.

**Acceptance Scenarios**:

1. **Given** the app is open and the backend is reachable, **When** the user selects an employee,
   enters a task, and clicks Start, **Then** a run begins and the view switches to the live timeline.
2. **Given** a run is in progress, **When** the agent emits events, **Then** each new event appears
   in the timeline in order, in near-real-time, with a distinct readable rendering per event type
   (thought, tool action + inputs, tool result, status change, limit, refusal, error).
3. **Given** a run completes, **When** the final result arrives, **Then** the view shows the outcome
   (success/failure/halted), the reason it stopped, and the list of files the agent changed.
4. **Given** the backend is unreachable or the stream drops, **When** the user is on the run view,
   **Then** the UI shows a clear connection status and attempts to resume rather than failing silently.

---

### User Story 2 - Approve or reject gated actions (Priority: P1)

While a run is in progress, the agent may propose a gated action (install a package, delete a file,
push, or make a network call). The UI surfaces this as a prominent approval prompt with Approve and
Reject buttons; the run stays visibly paused until the user decides. The user can alternatively start
a run in "auto-approve" mode to skip prompts.

**Why this priority**: Human-in-the-loop is a core safety guarantee of the system (constitution
Principle III). A UI that cannot present and resolve gates cannot safely drive the agent.

**Independent Test**: Start a run with a task that triggers a gated action; confirm the prompt
appears, the status shows awaiting-approval, and choosing Approve/Reject resumes or drops the action
accordingly. Repeat with auto-approve enabled and confirm no prompt appears.

**Acceptance Scenarios**:

1. **Given** a run in progress, **When** the agent proposes a gated action, **Then** the UI shows an
   approval prompt naming the action and reason, and the run status shows awaiting-approval.
2. **Given** an approval prompt is shown, **When** the user clicks Approve, **Then** the action
   proceeds and the timeline records the decision.
3. **Given** an approval prompt is shown, **When** the user clicks Reject, **Then** the action is
   dropped and the timeline records the rejection; the run continues or reports it is blocked.
4. **Given** the user started the run in auto-approve mode, **When** the agent proposes a gated
   action, **Then** no prompt appears and the timeline shows it was pre-authorized.

---

### User Story 3 - Configure limits before starting (Priority: P2)

Before starting, the user can optionally set ceilings for the run — maximum iterations, tokens,
wall-clock time, and files changed. If left blank, sensible defaults apply. If a run halts on a
limit, the UI makes clear which limit was hit.

**Why this priority**: Gives the user control over cost and scope and surfaces the bounded-autonomy
guarantee, but the run is fully usable with defaults, so it ranks below the core flow.

**Independent Test**: Set a very low iteration limit on a task that cannot finish quickly; confirm
the run halts and the result clearly attributes the stop to that limit.

**Acceptance Scenarios**:

1. **Given** the start form, **When** the user sets one or more limits and starts, **Then** the run
   uses those limits.
2. **Given** the user leaves limits blank, **When** they start, **Then** default limits apply.
3. **Given** a run halts on a limit, **When** the result appears, **Then** the UI states which limit
   was reached.

---

### User Story 4 - Replay a finished run (Priority: P3)

A user can open a previously finished run and view its complete event timeline reconstructed from the
stored log — including after a page reload — without needing to have watched it live.

**Why this priority**: Useful for review and trust, but depends on runs existing and is not needed
for the first live demo.

**Independent Test**: Complete a run, reload the page, open that run by its identifier, and confirm
the full ordered timeline and final result render from storage.

**Acceptance Scenarios**:

1. **Given** a finished run, **When** the user opens it (including after reload), **Then** the full
   ordered timeline and final result are shown.
2. **Given** a run that is still in progress is opened, **When** the view loads, **Then** it shows
   events so far and continues streaming live.

---

### Edge Cases

- **Run already in progress**: Because the backend allows one run at a time, if a run is active and
  the user tries to start another, the UI explains a run is in progress and offers to view it instead
  of starting a new one.
- **Empty task**: Starting with no task entered is prevented with a clear inline message.
- **Backend down at start**: Attempting to start while the backend is unreachable shows a clear error,
  not a stuck spinner.
- **Stream interruption**: If the live stream drops mid-run, the UI shows a reconnecting state and
  resumes the timeline without duplicating or losing events.
- **Unknown run id**: Opening a run id that does not exist shows a clear "not found" message.
- **Long output**: Very large tool outputs (e.g. command logs) are displayed without breaking the
  layout (e.g. truncated with a way to see more).
- **Rapid event bursts**: Many events arriving quickly still render in order and remain readable.

## Requirements *(mandatory)*

### Functional Requirements

**Starting a run (Story 1, 3)**

- **FR-001**: The UI MUST let the user select exactly one AI employee from the existing roster before
  starting a run.
- **FR-002**: The UI MUST let the user enter a free-text development task and prevent starting with an
  empty task.
- **FR-003**: The UI MUST let the user optionally specify run limits (max iterations, max tokens, max
  wall-clock time, max files) and apply defaults when they are not provided.
- **FR-004**: The UI MUST let the user choose auto-approve mode when starting a run.
- **FR-005**: On start, the UI MUST begin a run via the backend and transition to the live run view.

**Watching live (Story 1)**

- **FR-006**: The UI MUST subscribe to the run's live event stream and append events to a timeline in
  the order received, in near-real-time.
- **FR-007**: The UI MUST render each event type distinctly and readably: thought, tool action (with
  its inputs), tool result (success/error and output), status change, approval request, approval
  decision, limit, refusal, error, and final result.
- **FR-008**: The UI MUST display the run's current status at all times (e.g. running,
  awaiting-approval, completed, failed, halted).
- **FR-009**: When the stream is interrupted, the UI MUST indicate the connection state and attempt to
  resume the stream from where it left off, without duplicating or dropping events.

**Approvals (Story 2)**

- **FR-010**: When the agent proposes a gated action, the UI MUST present an approval prompt that
  names the action and its reason, and MUST reflect that the run is awaiting approval.
- **FR-011**: The UI MUST let the user approve or reject a pending gated action, and MUST send that
  decision to the backend.
- **FR-012**: After a decision, the UI MUST reflect the outcome in the timeline and resume showing
  live progress.
- **FR-013**: In auto-approve mode, the UI MUST NOT prompt and MUST indicate that gated actions were
  pre-authorized.

**Result & replay (Story 1, 4)**

- **FR-014**: When a run ends, the UI MUST show the final outcome, the stop reason, and the list of
  files the agent changed.
- **FR-015**: The UI MUST let the user open a finished run and view its complete ordered timeline and
  final result reconstructed from stored data, including after a page reload.
- **FR-016**: Opening a run that is still in progress MUST show events so far and then continue live.

**Constraints & errors (all stories)**

- **FR-017**: The UI MUST handle the single-active-run constraint: if a run is already active, it MUST
  inform the user and offer to view the active run rather than starting another.
- **FR-018**: The UI MUST show clear, non-blocking error messages for unreachable backend, unknown run
  id, and failed start, instead of indefinite loading states.
- **FR-019**: The UI MUST NOT require any change to the backend; it consumes the existing run-start,
  event-stream, approval-decision, and run-status capabilities only. Any capability gap discovered
  MUST be documented, not worked around by changing the backend.
- **FR-020**: The UI MUST reuse the existing application shell, styling conventions, and employee
  roster rather than introducing a separate look and feel.

### Key Entities *(include if feature involves data)*

- **Run (view model)**: The browser's representation of a backend run — id, selected employee, task,
  current status, ordered list of received events, pending approval (if any), and final result.
- **Timeline Event (view model)**: One rendered entry derived from a backend event — its type, the
  data needed to display it, and its order/sequence.
- **Pending Approval (view model)**: The currently displayed gated action awaiting a decision — the
  action description, its reason, and the identifier needed to send the decision.
- **Employee (existing)**: A persona from the existing roster, used to choose who runs the task.
- **Run Limits (input model)**: Optional ceilings the user sets before starting.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time user can go from opening the app to a running, visibly-streaming task in
  under 60 seconds, without reading documentation.
- **SC-002**: During a run, new events appear in the timeline within ~2 seconds of occurring.
- **SC-003**: 100% of gated actions surface an approval prompt (in non-auto-approve mode) and the run
  never proceeds on a gated action the user did not approve.
- **SC-004**: 100% of completed runs show a final result with outcome, stop reason, and changed-files
  list.
- **SC-005**: After a page reload, a finished run's full timeline can be reopened and matches what was
  shown live, with no missing or duplicated events.
- **SC-006**: When the live stream is interrupted and restored, the timeline resumes with no missing
  or duplicated events in 100% of tested interruptions.
- **SC-007**: Attempting to start a second run while one is active never starts a second run; the user
  is always informed and offered the active run.
- **SC-008**: Every error condition (backend down, unknown run, empty task) produces a visible message
  within a few seconds rather than an indefinite loading state.

## Assumptions

- The Phase 1 backend is running and reachable from the browser during use; its run-start,
  live-event-stream, approval-decision, run-status, and stored-run-replay capabilities behave as
  delivered in Phase 1.
- The browser's standard event-streaming mechanism (and its resume-after-reconnect behavior) is
  available in target browsers.
- The existing roster of 12 employees is the source of selectable personas.
- A single user operates the app locally; no authentication or multi-user concerns this phase.
- One run at a time is acceptable, matching the backend.

## Out of Scope (this phase)

- Any change to the backend runtime, its endpoints, or its behavior.
- Multiple parallel agents or team-delegation views.
- VS Code extension or native IDE driving.
- Authentication, user accounts, multi-user.
- Cloud persistence beyond what the backend already stores.
- A file-diff or in-browser editor view of the worktree (the changed-files list suffices this phase).
