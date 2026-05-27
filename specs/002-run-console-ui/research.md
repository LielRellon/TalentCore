# Phase 0 Research: Run Console UI

Decisions resolved from the feature input and the existing codebase. No open clarifications.

## 1. Cross-origin SSE without touching the backend

- **Decision**: Add a Vite dev-server proxy entry mapping `/api/agent/*` → `http://localhost:8787`
  (the backend). The UI calls only same-origin `/api/agent/...` paths, so `EventSource` works and
  sends `Last-Event-ID` on reconnect; the backend already replays from that seq.
- **Rationale**: FR-019 forbids backend changes (no CORS headers added there). The repo already uses
  this exact pattern for the chat (`/api/chat` → Groq), so it is idiomatic here.
- **Alternatives considered**: Add CORS to the backend (violates FR-019); call `:8787` directly
  (cross-origin EventSource blocked); run both on one port (extra coupling).

## 2. Live stream transport

- **Decision**: Browser-native `EventSource` for `GET /api/agent/runs/:id/events`. Wrap it in
  `runtime/stream.js` exposing `subscribe(runId, { onEvent, onStatus })` and a `close()`.
- **Rationale**: SSE is one-way server→client (exactly the event stream), auto-reconnects, and sends
  `Last-Event-ID` for gap-free resume — directly satisfying FR-009 / SC-006. No library needed.
- **Alternatives considered**: `fetch` + ReadableStream reader (manual reconnect/resume — more code);
  WebSocket (bidirectional, unnecessary; approvals are plain POSTs); polling (misses real-time).

## 3. Control calls

- **Decision**: `fetch` for `POST /api/agent/runs` (start), `POST /api/agent/runs/:id/approvals`
  (decision), `GET /api/agent/runs/:id` (status/result). Centralized in `runtime/api.js`.
- **Rationale**: One-shot request/response actions; keeps the base path and error shaping in one place.

## 4. State management

- **Decision**: Plain React hooks. A `useRun` hook with a `useReducer` accumulates events and derives
  status, the pending approval, connection state, and final result. No Redux/Zustand.
- **Rationale**: A single run with an append-mostly event list is a natural reducer. Adding a state
  library is unjustified scope.
- **Alternatives considered**: Context + external store (overkill for one feature/one run).

## 5. Resume / dedupe correctness

- **Decision**: Track the highest `seq` seen. On any received event with `seq <= lastSeq`, ignore it
  (idempotent). EventSource resume + this guard ⇒ no gaps, no dupes (SC-006).
- **Rationale**: The backend events carry a monotonic `seq`; dedupe on it is simple and total.

## 6. Integrating without breaking the existing entry

- **Decision**: `main.jsx` renders a new `AppShell` that toggles between the existing chat
  (`TalentCore_v2`) and the new `RunConsole` via local state (a header tab). No router.
- **Rationale**: Input requires keeping the existing entry working and avoiding a router dependency.
- **Alternatives considered**: react-router (new dep for two views — unnecessary); replacing the chat
  (loses existing feature).

## 7. Shared roster (single source of truth)

- **Decision**: Extract `INIT_EMPLOYEES` from `TalentCore_v2.jsx` into `src/roster.js`; both the chat
  and the console import it. (The backend `personas.json` mirrors the same ids.)
- **Rationale**: Avoids duplicated persona data drifting between chat and console (FR-020).

## 8. Testing approach

- **Decision**: Vitest + @testing-library/react + jsdom (new devDeps). Unit-test the `useRun` reducer
  (event accumulation, status transitions, approval set/clear, result, resume dedupe) and `EventItem`
  rendering per type, mocking `fetch` and a fake `EventSource`. Live path covered by quickstart.
- **Rationale**: Vitest is the Vite-native runner; deterministic logic tests without a real backend.
- **Alternatives considered**: Jest (non-native to Vite); only manual testing (no regression safety).

## 9. Readability under load / long output

- **Decision**: `EventItem` truncates large tool outputs with an expand affordance; the timeline
  auto-scrolls to the latest event but lets the user scroll up to pause autoscroll.
- **Rationale**: Edge cases in the spec (long output, rapid bursts) without adding virtualization at
  Phase 1 volumes.
