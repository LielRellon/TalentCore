# Contract: CLI & HTTP API

Two entry points expose the runtime: a CLI (primary for Phase 1 demo) and a minimal HTTP server
(so the React frontend can consume it later). Both drive the same run manager. One run at a time.

## CLI

```
node server/src/cli.js run --persona <personaId> --task "<task>" [--max-iterations N]
                            [--max-tokens N] [--max-wallclock-ms N] [--max-files N]
                            [--auto-approve]   # pre-authorize gated actions (explicit opt-in)
```

- Starts a run, prints each event to stdout as it streams (human-readable + `--json` for raw JSONL).
- On an `approval_request` (without `--auto-approve`), prompts y/n on the terminal and posts the
  decision back into the run.
- Exits with code `0` on `success`, `1` on `failure`, `2` on `halted`.

## HTTP API (node:http)

### `POST /runs`

Start a run. Rejected with `409` if a run is already active (single-run constraint).

- **Body**: `{ "personaId": string, "task": string, "limits"?: Partial<LimitSet>, "autoApprove"?: boolean }`
- **201**: `{ "runId": string, "status": "running" }`
- **409**: `{ "error": "run_in_progress" }`
- **400**: `{ "error": "invalid_request", "detail": "..." }`

### `GET /runs/:id/events`  (Server-Sent Events)

Stream the run's events live; if the run is finished, replays the full log then closes.

- **Headers**: `Content-Type: text/event-stream`.
- **Each event**: SSE `data:` line containing one Event envelope JSON. `id:` set to `seq`.
- Supports `Last-Event-ID` to resume from a given `seq` (replays missed events from JSONL).

### `GET /runs/:id`

- **200**: `{ runId, status, result | null, limits, createdAt, endedAt }`

### `POST /runs/:id/approvals`

Decide a pending gated action.

- **Body**: `{ "callId": string, "approved": boolean }`
- **200**: `{ "ok": true }`
- **404**: no such pending approval. **409**: run not awaiting approval.

## Errors (shared)

JSON body `{ "error": <code>, "detail"?: string }`; codes are stable strings
(`run_in_progress`, `invalid_request`, `not_found`, `run_not_awaiting_approval`).

## Auth / secrets

No authentication this phase (single local user). The Groq API key is read from the server
environment (`.env`, git-ignored) and is never returned in any response, event, or log.
