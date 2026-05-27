# Feature Specification: Autonomous Agent Runtime Core (Phase 1)

**Feature Branch**: `001-agent-runtime-core`  
**Created**: 2026-05-27  
**Status**: Draft  
**Input**: User description: "Build the Phase 1 core of Talent Core's autonomous agent runtime: a single AI employee that can autonomously develop code inside an isolated sandbox, running a plan→act→observe loop with four tools, observed live via a structured event stream, bounded by hard limits and human-in-the-loop gates."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Run an autonomous coding task and watch it live (Priority: P1)

A user picks one AI employee, gives it a plain-language development task, and starts a run.
The agent works on its own — reasoning, reading and writing files, and running commands inside
its private workspace — while the user watches a live stream of what the agent is thinking and
doing. When the agent finishes, the workspace contains the resulting code changes.

**Why this priority**: This is the core value of the entire product — turning a natural-language
task into real code changes, autonomously, with the work visible as it happens. Without this,
nothing else matters. It is the minimum demonstrable proof that the concept works.

**Independent Test**: Give the agent a self-contained task (e.g. "write a function that validates
an email address and a test for it"), start the run, and confirm that (a) a live event stream
appears, (b) the agent produces the requested files in its workspace, and (c) the run ends with a
clear success result. Fully testable on its own; delivers end-to-end value.

**Acceptance Scenarios**:

1. **Given** an available AI employee and a fresh isolated workspace, **When** the user submits the
   task "create an email-validation function and a passing test", **Then** the agent produces the
   function and test files in the workspace and the run ends with a success status.
2. **Given** a run in progress, **When** the agent reasons and acts, **Then** the user sees events
   appear in real time showing the agent's thoughts, each tool action with its inputs, each result,
   and status changes — in the order they occurred.
3. **Given** a completed run, **When** the user views the result, **Then** they see a final summary
   stating success or failure, what files changed, and why the run stopped.

---

### User Story 2 - Stay safe: contained workspace and approval gates (Priority: P1)

The user trusts the agent to act on its own only because its reach is contained. All of the
agent's file changes and command execution stay inside its assigned workspace, and any action that
is irreversible or reaches beyond the workspace (publishing code, network access, installing
packages, deleting files) is held for the user's explicit approval before it can proceed.

**Why this priority**: Autonomy without containment is unacceptable — a single bad action could
damage the host machine or leak data. Safety is a precondition for letting the agent run at all,
so it ships alongside the core loop, not after it.

**Independent Test**: Instruct the agent to attempt an action outside its workspace (e.g. write to
a system path) and to attempt a gated action (e.g. delete a file). Confirm the out-of-workspace
action is refused and the gated action pauses for approval instead of executing.

**Acceptance Scenarios**:

1. **Given** a running agent, **When** it attempts to read or write a path outside its workspace,
   **Then** the action is refused and the refusal is recorded as an event, without affecting any
   file outside the workspace.
2. **Given** a running agent, **When** it attempts a gated action (publish, network call, package
   install, or file deletion), **Then** the action does not execute; instead the run pauses and
   presents the proposed action for the user to approve or reject.
3. **Given** a gated action awaiting approval, **When** the user rejects it, **Then** the action is
   abandoned and the agent is able to continue with the remaining work or report that it is blocked.
4. **Given** a configuration that pre-authorizes a specific gated action, **When** the agent
   performs that action, **Then** it proceeds without pausing, and the action is still recorded.

---

### User Story 3 - Bounded runs that always terminate (Priority: P2)

The user can start a run confident that it will always stop on its own. Every run carries hard
ceilings — how many steps it may take, how much it may "think" (token budget), how long it may run
in wall-clock time, and how many files it may change. Reaching any ceiling halts the run and
reports why, rather than letting it spin indefinitely.

**Why this priority**: Protects cost and limits blast radius, and makes runs predictable. It builds
on the core loop (Story 1) but is essential before any unattended use.

**Independent Test**: Set a low iteration (or time) limit and give the agent a task it cannot finish
within it. Confirm the run halts exactly at the limit and reports that the limit was the reason.

**Acceptance Scenarios**:

1. **Given** a run with a maximum iteration count, **When** the agent reaches that count without
   completing the task, **Then** the run halts and reports that the iteration limit was reached.
2. **Given** a run with a wall-clock time limit, **When** the elapsed time reaches the limit,
   **Then** the run halts and reports a timeout.
3. **Given** a run with a maximum number of files it may touch, **When** the agent attempts a change
   that would exceed it, **Then** the run halts and reports the file-limit breach.
4. **Given** a run with a token budget, **When** consumption reaches the budget, **Then** the run
   halts and reports budget exhaustion.

---

### User Story 4 - Inspect and replay a completed run (Priority: P3)

After a run ends, the user can open its complete event log and reconstruct exactly what happened,
step by step — every thought, every tool action with its inputs, and every result — even if they
were not watching live.

**Why this priority**: Auditability and debugging matter, but they depend on runs existing first.
Valuable for trust and troubleshooting; not required for the first demonstration.

**Independent Test**: Run a task to completion without watching, then open the stored log for that
run and confirm the full ordered sequence of events is present and sufficient to retrace the run.

**Acceptance Scenarios**:

1. **Given** a finished run, **When** the user opens its event log, **Then** the complete ordered
   sequence of events (thoughts, tool actions, results, status changes) is available.
2. **Given** a stored run log, **When** the user reads it end to end, **Then** they can determine
   what the agent did and why it stopped without consulting any other source.

---

### Edge Cases

- **Task already satisfied**: If the workspace already meets the task on the first observation, the
  run ends quickly with success and no unnecessary changes.
- **Tool failure**: When a command fails (non-zero exit, compile/test error), the failure is shown
  to the agent as an observation so it can react; the run does not crash.
- **Malformed agent action**: If the agent requests a tool that does not exist or supplies invalid
  inputs, the action is rejected with an explanatory observation rather than executing anything.
- **Empty or nonsensical task**: A run started with no actionable task ends promptly with a clear
  "nothing to do / cannot determine task" result rather than looping.
- **Repeated identical actions**: If the agent repeats the same ineffective action, the run still
  terminates via the iteration/time limits.
- **Provider/LLM unavailable**: If the reasoning provider cannot be reached, the run ends with a
  clear error status rather than hanging.
- **Workspace setup failure**: If an isolated workspace cannot be created, the run does not start
  and the user is told why.
- **Approval never given**: A gated action left unapproved does not execute indefinitely; the run
  surfaces that it is blocked and remains terminable.
- **Secrets**: Credentials are never exposed to the agent's tools, observations, or event stream.

## Requirements *(mandatory)*

### Functional Requirements

**Running a task (Story 1)**

- **FR-001**: System MUST let a user start a run by selecting one AI employee and providing a
  natural-language development task.
- **FR-002**: System MUST run exactly one agent at a time in this phase (no parallel or concurrent
  runs).
- **FR-003**: System MUST execute an autonomous loop of reason → act → observe, continuing until the
  task is complete, the agent declares completion, an error occurs, or a limit/gate halts it.
- **FR-004**: The agent MUST be able to act only through a fixed set of exactly four capabilities:
  read a file, write a file, list a directory, and run a command. No other means of acting is
  permitted.
- **FR-005**: System MUST provide the agent with the selected employee's persona so its behavior and
  responses reflect that role.
- **FR-006**: System MUST produce a final result for every run stating success or failure, a summary
  of what changed, and the reason the run stopped.
- **FR-007**: System MUST provide a minimal way to trigger a run and observe its events end to end
  (e.g. a command-line entry point or simple request endpoint) so the core is demonstrable without
  any additional user interface.

**Containment & gates (Story 2)**

- **FR-008**: Each run MUST operate within its own isolated workspace, separate from the main project
  and from any other run's workspace.
- **FR-009**: System MUST confine all of the agent's file reads and writes to within its workspace;
  any path resolving outside the workspace MUST be refused before any effect occurs.
- **FR-010**: System MUST execute the agent's commands in an isolated execution environment that
  cannot affect the host system outside the workspace.
- **FR-011**: System MUST require explicit human approval before performing any irreversible or
  outward-facing action — at minimum: publishing code externally, accessing the network, installing
  packages, and deleting files — unless that action is explicitly pre-authorized in configuration.
- **FR-012**: For a gated action, the agent MUST propose the action and wait; the action MUST NOT
  take effect unless approved (or pre-authorized).
- **FR-013**: System MUST refuse destructive operations that target anything outside the workspace
  (e.g. bulk deletion outside the workspace, force-publishing) with no exception.
- **FR-014**: System MUST keep secrets and credentials out of the agent's available tools,
  observations, and event stream.

**Limits (Story 3)**

- **FR-015**: Every run MUST enforce hard ceilings on: number of iterations, total reasoning budget
  (tokens), wall-clock duration, and number of files changed.
- **FR-016**: On reaching any ceiling, the run MUST halt and report which ceiling was reached; it
  MUST NOT continue, silently retry without bound, or raise its own limits.
- **FR-017**: Limits MUST have safe default values and MUST be adjustable per run via configuration,
  but only by the user/configuration — never by the agent.

**Observability (Stories 1 & 4)**

- **FR-018**: System MUST emit structured events as the run proceeds, including at minimum: the
  agent's reasoning ("thought"), each tool action with its inputs, each tool result, and status
  changes.
- **FR-019**: Events MUST be delivered as a live stream while the run is in progress, in the order
  they occur.
- **FR-020**: System MUST record every tool action together with its inputs and its outputs.
- **FR-021**: System MUST persist each run's complete event log so it can be retrieved and replayed
  after the run ends, sufficient to reconstruct the run without external information.

### Key Entities *(include if feature involves data)*

- **AI Employee (Persona)**: A named role with a defined behavior/voice that drives how the agent
  reasons and responds. Provided as input to a run.
- **Run**: One execution of a task by one employee. Has a task description, a workspace, a status
  (e.g. pending, running, awaiting-approval, completed, failed, halted), enforced limits, a final
  result, and an ordered collection of events.
- **Workspace**: The isolated location a run operates in; the boundary for all file and command
  activity. Belongs to exactly one run.
- **Tool Action**: One use of one of the four capabilities, with its inputs and its resulting output;
  recorded as part of the run.
- **Event**: A single time-ordered record in a run's log — a thought, a tool action, a tool result,
  a status change, an approval request/decision, or a limit/refusal notice.
- **Limit Set**: The ceilings applied to a run (iterations, token budget, wall-clock time, files
  changed), with defaults and optional per-run overrides.
- **Approval Gate**: A pending decision on a proposed irreversible/outward-facing action, with the
  proposed action and its approve/reject outcome.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can take a self-contained coding task from submission to completed code changes
  in a single run, with no manual editing of files during the run.
- **SC-002**: For a representative simple task (e.g. "write a function and a passing test"), the
  agent completes it successfully in at least 80% of attempts.
- **SC-003**: 100% of attempts by the agent to act outside its workspace are prevented, with zero
  changes occurring to any file outside the workspace across the test suite.
- **SC-004**: 100% of gated actions (publish, network, install, delete) pause for approval and never
  take effect without approval or explicit pre-authorization.
- **SC-005**: 100% of runs terminate — every run ends in a definite result (success, failure, or
  limit-halt) and none run indefinitely.
- **SC-006**: When a run exceeds a configured limit, it halts and correctly identifies which limit
  was reached in 100% of cases.
- **SC-007**: During a run, events are visible to the observer within a few seconds of occurring, so
  the user can follow progress in real time.
- **SC-008**: After any run, its stored log allows a reviewer to reconstruct the full ordered
  sequence of what the agent did and why it stopped, with no gaps, in 100% of runs.

## Assumptions

- A reasoning provider capable of deciding tool actions is available for the agent; if unreachable,
  runs end with a clear error (no offline reasoning is required in this phase).
- The host environment can create isolated workspaces and an isolated command-execution environment.
- A single user operates the system in this phase; multi-user accounts and authentication are out of
  scope.
- "One agent at a time" is acceptable; queuing or parallelism is not required now.
- The existing application already supplies employee personas; this phase consumes them and does not
  redefine them.
- Persistence is limited to what is needed to store and replay a run's events; broader cloud
  persistence is out of scope.

## Out of Scope (this phase)

- Multiple parallel agents or team delegation.
- Any visual editor/IDE driving (VS Code extension, etc.); runs are observed via the event stream.
- Native IDE integration (e.g. Xcode, Android Studio).
- Cloud/multi-device persistence beyond storing run event logs.
- User authentication and multi-user accounts.
