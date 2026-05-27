# Contract: Events & Event Log

Events are the observable record of a run. Each is emitted on the in-process EventBus, streamed to
SSE subscribers, and appended as one line to `runs/<runId>/events.jsonl`.

## Envelope

```json
{
  "seq": 7,
  "ts": "2026-05-27T10:15:03.221Z",
  "runId": "a1b2c3d4",
  "type": "tool_call",
  "data": { }
}
```

- `seq` — per-run monotonically increasing integer starting at 0; no gaps.
- `ts` — ISO-8601 UTC timestamp.
- `type` — one of the types below.
- `data` — type-specific payload.

## Event types

| `type` | `data` | When emitted |
|--------|--------|--------------|
| `status` | `{ status, detail? }` | On every run status change (`pending`→`running`→…→terminal). |
| `thought` | `{ text }` | When the agent produces reasoning for a step. |
| `tool_call` | `{ callId, name, args }` | When a tool action is dispatched (inputs logged). |
| `tool_result` | `{ callId, ok, output?, error? }` | When a tool action returns (outputs logged). |
| `approval_request` | `{ callId, action, reason }` | When a gated action needs a human decision. |
| `approval_decision` | `{ callId, approved, by? }` | When a decision is recorded. |
| `limit` | `{ kind, value }` | When a ceiling is breached; `kind` ∈ `iteration_limit\|token_budget\|timeout\|file_limit`. |
| `refusal` | `{ action, reason }` | When an action is refused outright (outside workspace / destructive). |
| `error` | `{ message }` | On an unrecoverable error ending the run. |
| `result` | RunResult | Final event of every run. |

## Ordering & completeness guarantees

- Events for a run are totally ordered by `seq` and persisted append-only.
- Every `tool_call` has exactly one matching `tool_result` (same `callId`), unless the action was
  refused (`refusal`) or gated-and-rejected.
- Every run ends with exactly one terminal `status` followed by one `result` event.
- The JSONL log alone is sufficient to reconstruct the entire run (SC-008): no external state needed.

## Replay

`GET /runs/:id/events` with no live run, or reading `events.jsonl` directly, yields the full ordered
sequence. A replay reads lines in order; `seq` gaps indicate corruption.
