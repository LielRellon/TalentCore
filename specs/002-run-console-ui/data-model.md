# Phase 1 Data Model: Run Console UI (view models)

All client-side, in-memory. No persistence beyond an optional last-run-id in `localStorage`.

## RunState (the `useRun` reducer state)

| Field | Type | Notes |
|-------|------|-------|
| `runId` | string \| null | Active/opened run id. |
| `status` | enum | Mirrors backend: `idle` (no run) \| `running` \| `awaiting-approval` \| `completed` \| `failed` \| `halted`. |
| `connection` | enum | `connecting` \| `open` \| `reconnecting` \| `closed` — SSE transport state for the status bar. |
| `events` | TimelineEvent[] | Accumulated in `seq` order. |
| `lastSeq` | number | Highest `seq` applied; used to dedupe on resume. |
| `pendingApproval` | PendingApproval \| null | Set when an `approval_request` arrives and not yet decided. |
| `result` | RunResult \| null | Set on the terminal `result` event. |
| `error` | string \| null | User-facing error (start failed, backend down, unknown run). |

### Reducer actions / transitions

| Action | Effect |
|--------|--------|
| `START_PENDING` | status→`running`, clear events/result/error, set runId. |
| `START_FAILED` | status→`idle`, set `error`. |
| `CONNECTION` | set `connection`. |
| `EVENT(e)` | if `e.seq <= lastSeq` ignore; else push to `events`, set `lastSeq`. Then derive: `status` events update `status`; `approval_request` sets `pendingApproval`; `approval_decision`/resume clears it; `result` sets `result` and terminal status. |
| `APPROVAL_SENT` | clear `pendingApproval` (status returns to `running` on next status event). |
| `OPEN_RUN(id)` | reset, set runId, status derived from replay. |
| `RESET` | back to `idle`. |

State rule (SC-003): the reducer NEVER clears `pendingApproval` or advances past a gate on its own;
it clears only on an explicit `approval_decision` event from the backend or `APPROVAL_SENT`.

## TimelineEvent

The backend event envelope, rendered per type.

| Field | Type | Notes |
|-------|------|-------|
| `seq` | number | Order + dedupe key. |
| `ts` | string | Timestamp for display. |
| `type` | enum | `status\|thought\|tool_call\|tool_result\|approval_request\|approval_decision\|limit\|refusal\|error\|result`. |
| `data` | object | Type-specific payload (see Phase 1 events contract). |

## PendingApproval

| Field | Type | Notes |
|-------|------|-------|
| `callId` | string | Identifies the gated action to the backend approvals endpoint. |
| `action` | string | Human-readable description (e.g. "run_command: npm install x"). |
| `reason` | string | Gate kind (e.g. package_install, delete, network, git_push). |

## RunResult

| Field | Type | Notes |
|-------|------|-------|
| `outcome` | enum | `success\|failure\|halted`. |
| `reason` | string | Why it stopped. |
| `filesChanged` | string[] | Paths the agent changed. |
| `summary` | string | Final recap. |
| `iterations` / `tokensUsed` / `durationMs` | number | Run stats. |

## StartRunInput (form model)

| Field | Type | Notes |
|-------|------|-------|
| `personaId` | string | Selected employee (from shared roster). Required. |
| `task` | string | Free text. Required, non-empty. |
| `autoApprove` | boolean | Default false. |
| `limits` | object | Optional `{ maxIterations?, maxTokens?, maxWallClockMs?, maxFilesTouched? }`; blank ⇒ backend defaults. |

## Employee (existing, from `src/roster.js`)

`{ id, name, role, dept, avatar, color, persona }` — selectable persona; the console uses
`id`/`name`/`role` for display and sends `id` to the backend.
