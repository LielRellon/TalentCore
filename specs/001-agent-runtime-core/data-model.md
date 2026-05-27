# Phase 1 Data Model: Autonomous Agent Runtime Core

All entities are in-process objects plus on-disk JSON/JSONL. No database this phase.

## Run

One execution of a task by one employee.

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Unique run id (e.g. `crypto.randomUUID()`); names the run directory and worktree branch. |
| `personaId` | string | Which AI employee (from the roster). |
| `task` | string | Natural-language task description. |
| `status` | enum | `pending` → `running` → (`awaiting-approval` ⇄ `running`) → `completed` \| `failed` \| `halted`. |
| `workspacePath` | string | Absolute path to this run's git worktree. |
| `branch` | string | `run/<id>` — the worktree's branch. |
| `limits` | LimitSet | Effective limits (defaults merged with per-run overrides). |
| `result` | RunResult \| null | Set when the run ends. |
| `createdAt` / `endedAt` | ISO timestamp | |

**State transitions**:
- `pending → running` when the workspace is created and the loop starts.
- `running → awaiting-approval` when a gated action is proposed; back to `running` on approve, or
  the action is dropped on reject.
- `running → completed` when the agent signals task completion (a terminal "done" tool/finish).
- `running → failed` on unrecoverable error (provider unreachable, workspace setup failure).
- `running/awaiting-approval → halted` when any limit is breached.
- Terminal states (`completed`, `failed`, `halted`) are final; `result` is populated.

## LimitSet

Hard ceilings; defaults from config, optionally overridden per run. Never mutated by the agent.

| Field | Type | Default | Breach effect |
|-------|------|---------|---------------|
| `maxIterations` | int | 25 | halt: `iteration_limit` |
| `maxTokens` | int | 100000 | halt: `token_budget` |
| `maxWallClockMs` | int | 300000 | halt: `timeout` |
| `maxFilesTouched` | int | 25 | halt: `file_limit` |

## RunResult

Final summary of a run (also written to `runs/<id>/result.json`).

| Field | Type | Notes |
|-------|------|-------|
| `outcome` | enum | `success` \| `failure` \| `halted`. |
| `reason` | string | Why the run stopped (e.g. "task complete", "iteration limit reached", "provider error"). |
| `filesChanged` | string[] | Workspace-relative paths created/modified. |
| `summary` | string | Human-readable recap (agent's final message + what changed). |
| `iterations` | int | Loop iterations used. |
| `tokensUsed` | int | Total tokens consumed. |
| `durationMs` | int | Wall-clock duration. |

## Tool & ToolCall

The closed allow-list of capabilities and a single invocation of one.

**Tool (registry entry)**: `{ name, description, inputSchema (JSON Schema), gated?: predicate }`.
Names are exactly: `read_file`, `write_file`, `list_dir`, `run_command`.

**ToolCall**:

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Correlates `tool_call` with its `tool_result`. |
| `name` | string | One of the four tool names. |
| `args` | object | Validated against the tool's `inputSchema`. |
| `result` | ToolResult | `{ ok: boolean, output?: any, error?: string }`. |

## Event

One time-ordered record in a run's log. Persisted as one JSON object per line in
`runs/<id>/events.jsonl`. Common envelope:

```json
{ "seq": 0, "ts": "2026-05-27T00:00:00.000Z", "runId": "…", "type": "…", "data": { } }
```

| `type` | `data` payload |
|--------|----------------|
| `status` | `{ status, detail? }` — run status change. |
| `thought` | `{ text }` — the agent's reasoning for this step. |
| `tool_call` | `{ callId, name, args }` — a proposed/executed tool action with inputs. |
| `tool_result` | `{ callId, ok, output?, error? }` — the result of a tool action. |
| `approval_request` | `{ callId, action, reason }` — a gated action awaiting a decision. |
| `approval_decision` | `{ callId, approved, by? }` — approve/reject outcome. |
| `limit` | `{ kind, value }` — which ceiling was breached (`iteration_limit`/`token_budget`/`timeout`/`file_limit`). |
| `refusal` | `{ action, reason }` — an action refused outright (out-of-workspace/destructive). |
| `error` | `{ message }` — unrecoverable error ending the run. |
| `result` | RunResult — emitted last; mirrors `result.json`. |

`seq` is a monotonically increasing per-run integer; together with append-only JSONL it guarantees a
gap-free, ordered, fully reconstructable log (SC-008).

## Workspace

| Field | Type | Notes |
|-------|------|-------|
| `runId` | string | Owning run. |
| `root` | string | Absolute worktree path; the confinement boundary for all file/command activity. |
| `branch` | string | `run/<id>`. |

## Persona

Loaded from the existing roster; read-only input to a run.

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | e.g. `sfe`, `sfd`. |
| `name` | string | e.g. "Lena Park". |
| `role` | string | e.g. "Software Engineer". |
| `persona` | string | System-prompt text describing behavior/voice. |

## ApprovalGate (transient)

Represents a pending decision while `status = awaiting-approval`.

| Field | Type | Notes |
|-------|------|-------|
| `callId` | string | The gated ToolCall awaiting decision. |
| `action` | string | Human-readable description of what will happen if approved. |
| `decided` | boolean | Whether a decision has arrived. |
| `approved` | boolean | The decision. |
