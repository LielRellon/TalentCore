<!--
SYNC IMPACT REPORT
==================
Version change: (uninitialized template) → 1.0.0
Bump rationale: Initial ratification of the project constitution (MAJOR baseline).

Modified principles: N/A (first definition)
Added principles:
  - I. Sandbox-First Safety (NON-NEGOTIABLE)
  - II. Explicit Tool Contracts
  - III. Human-in-the-Loop Gates
  - IV. Observable Agent Loop
  - V. Bounded Autonomy
Added sections:
  - Technology & Security Constraints
  - Development Workflow & Quality Gates
  - Governance

Removed sections: None (template placeholders replaced)

Templates requiring updates:
  - .specify/templates/plan-template.md ............. ✅ reviewed (generic Constitution Check gate; no edit required)
  - .specify/templates/spec-template.md ............. ✅ reviewed (no constitution-coupled placeholders)
  - .specify/templates/tasks-template.md ............ ✅ reviewed (task categories cover safety/observability work)
  - .claude/commands/speckit.*.md ................... ✅ reviewed (no outdated agent-only references blocking generic use)

Follow-up TODOs: None. All placeholders resolved.
-->

# Talent Core Constitution

Talent Core is a system in which AI "employees" (LLM-driven personas) autonomously develop
software. Because these agents write files and execute commands on real machines, this
constitution exists primarily to keep autonomous action **safe, auditable, and bounded**.
These principles are binding on every feature, every agent run, and every contributor.

## Core Principles

### I. Sandbox-First Safety (NON-NEGOTIABLE)

Every autonomous agent action that writes files or runs commands MUST execute inside an
isolated sandbox.

- File operations MUST be confined to the agent's assigned workspace (a dedicated git
  worktree at minimum). Any path resolving outside the workspace root MUST be rejected
  before execution.
- Shell/command execution MUST run inside a Docker container (or equivalent OS-level
  isolation), never directly on the host, unless an explicit, logged operator override is
  in effect.
- Destructive or exfiltrating operations are prohibited: no `rm -rf` (or equivalent) outside
  the workspace, no force-push, no reading or transmitting secrets/credentials, no writing
  outside the sandbox boundary.

**Rationale**: Autonomous agents act faster than humans can supervise. The blast radius of a
mistake or a manipulated prompt MUST be physically contained, not merely discouraged.

### II. Explicit Tool Contracts

Agents act on the world ONLY through a fixed, audited set of tools — initially `read_file`,
`write_file`, `list_dir`, and `run_command`.

- The tool set is a closed allow-list. New capabilities require a new, reviewed tool; agents
  MUST NOT gain side effects through any other path.
- Every tool invocation MUST be logged with its full inputs and outputs.
- Tools MUST have no hidden side effects: a tool does exactly what its contract states and
  nothing more.

**Rationale**: Constraining agents to a small, inspectable interface makes their behavior
predictable and reviewable, and makes the sandbox boundary enforceable at a single choke point.

### III. Human-in-the-Loop Gates

Irreversible or outward-facing actions require explicit human approval by default.

- Actions gated by default include: `git push`, any network call, package installation,
  and file deletion.
- Agents PROPOSE such actions; a human CONFIRMS them. Gates MAY be pre-authorized in
  configuration, but pre-authorization MUST be explicit and scoped.
- A denied gate halts that action without aborting the agent's ability to report and replan.

**Rationale**: Reversibility is the safety net. Where an action cannot be cheaply undone or
reaches beyond the sandbox, a human decision MUST stand between intent and effect.

### IV. Observable Agent Loop

The plan → act → observe loop MUST be fully observable.

- Each iteration MUST emit structured, streamable events: at minimum `thought`, `tool_call`,
  `tool_result`, and `status`.
- The complete event log of a run MUST be sufficient to reconstruct exactly what the agent
  did, in order, without consulting external state.
- Events MUST be emitted as they occur (streamable), not only as a post-hoc summary.

**Rationale**: Trust in autonomy comes from after-the-fact accountability and real-time
visibility. An action that cannot be observed cannot be reviewed, debugged, or trusted.

### V. Bounded Autonomy

Every agent run operates under hard, enforced limits.

- Each run MUST declare and enforce ceilings on: iterations, total tokens, wall-clock time,
  and number of files touched.
- On reaching any limit, the run MUST halt and report its state — it MUST NOT silently
  continue, retry unbounded, or escalate its own limits.
- Limits have safe defaults and MAY be tuned per run via configuration, never by the agent
  itself.

**Rationale**: Unbounded loops waste cost and can cause unbounded damage. Hard ceilings
guarantee that a run terminates and surfaces control to a human.

## Technology & Security Constraints

- **Frontend**: React 19 + Vite 8 (existing application).
- **Backend / agent runtime**: Node.js.
- **LLM provider**: Groq API using `llama-3.3-70b-versatile` with native tool-calling.
- **Sandboxing**: git worktrees for workspace isolation; Docker for command execution
  isolation.
- **Secrets**: API keys and credentials MUST live only in `.env` (git-ignored) and MUST NOT
  be exposed to agent tools, logs, or event streams.
- **Network**: Agent containers default to no outbound network access; network access is a
  Human-in-the-Loop gated capability (Principle III).

## Development Workflow & Quality Gates

- Every feature follows the Spec-Driven flow: constitution → specify → plan → tasks →
  implement.
- The `/speckit.plan` Constitution Check gate MUST pass before design proceeds; any violation
  MUST be recorded in the plan's Complexity Tracking with justification, or the design MUST be
  revised to comply.
- Safety-relevant code paths (sandbox enforcement, tool boundary, gate enforcement, limit
  enforcement) MUST have automated tests; these tests are mandatory, not optional.
- Tool-call logging and agent-loop event emission MUST be covered by tests asserting that
  events are produced and complete.

## Governance

- This constitution supersedes other development practices where they conflict.
- **Amendments** require: a written change description, a version bump per the policy below,
  and an update to the Sync Impact Report at the top of this file.
- **Versioning policy** (semantic):
  - MAJOR — backward-incompatible governance changes or removal/redefinition of a principle.
  - MINOR — a new principle or section, or materially expanded guidance.
  - PATCH — clarifications, wording, or non-semantic refinements.
- **Compliance review**: every plan and implementation MUST verify compliance with these
  principles; the NON-NEGOTIABLE principle (I) admits no exceptions.

**Version**: 1.0.0 | **Ratified**: 2026-05-27 | **Last Amended**: 2026-05-27
