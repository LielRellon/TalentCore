# Contract: Backend Consumption (no new endpoints)

The UI consumes the **existing** Phase 1 backend (see `specs/001-agent-runtime-core/contracts/`).
This document fixes how the frontend calls it. The backend is NOT modified (FR-019).

All browser calls use the same-origin base path **`/api/agent`**, which the Vite dev proxy forwards
to `http://localhost:8787`.

## Proxy (vite.config.js)

```js
server: {
  proxy: {
    '/api/agent': {
      target: 'http://localhost:8787',
      changeOrigin: true,
      rewrite: (p) => p.replace(/^\/api\/agent/, ''),
    },
  },
}
```

So `/api/agent/runs` → backend `/runs`, `/api/agent/runs/:id/events` → backend `/runs/:id/events`, etc.

## Calls the UI makes

| Action | Method + path (same-origin) | Body / params | Used for |
|--------|------------------------------|---------------|----------|
| Start a run | `POST /api/agent/runs` | `{ personaId, task, limits?, autoApprove? }` | StartRunForm submit (FR-005). 201 → `{ runId, status }`; 409 `run_in_progress` → FR-017; 400 → FR-018. |
| Stream events | `EventSource('/api/agent/runs/:id/events')` | native; resumes with `Last-Event-ID` | Live timeline + replay (FR-006/009/015). Each message `data:` is one event envelope; `id:` is `seq`. |
| Decide approval | `POST /api/agent/runs/:id/approvals` | `{ callId, approved }` | Approve/Reject (FR-011). 200 ok; 409 `run_not_awaiting_approval`; 404 not found. |
| Get status/result | `GET /api/agent/runs/:id` | — | Initial status when opening a run; final result fallback (FR-014/016). |

## Behaviors the UI relies on (already true in Phase 1)

- Events carry monotonic `seq`; the stream replays persisted events then streams live; finished runs
  replay the full log then close. → enables gap-free resume and post-reload replay.
- `POST /runs` returns 409 when a run is active. → single-run handling (FR-017).
- The final `result` event mirrors the stored `result.json`. → terminal render (FR-014).
- No secrets appear in any response or event. → nothing to redact in the UI.

## Capability gaps (documented, NOT worked around)

- **Listing past runs**: the backend has no "list all runs" endpoint. This phase opens a finished run
  only by known `runId` (e.g. the just-finished one, or one entered/remembered). A run-history list
  would require a new backend endpoint and is therefore deferred (out of scope; note for a later phase).
- **Cancelling a run**: no cancel endpoint exists; the UI cannot stop a run early (limits/gates are the
  only stops). Deferred.
