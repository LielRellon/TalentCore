# Implementation Plan: Run Console UI (Phase 2)

**Branch**: `002-run-console-ui` | **Date**: 2026-05-27 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-run-console-ui/spec.md`

## Summary

Add a browser UI to the existing React 19 + Vite 8 app that drives the Phase 1 agent backend and
shows a run live. The user picks an employee, enters a task (optional limits + auto-approve), starts
a run, and watches a real-time timeline of the agent's thoughts, tool calls/results, status, gates,
limits, and final result. Gated actions surface an Approve/Reject prompt. Finished runs replay from
storage after reload. The backend is consumed unchanged (FR-019): cross-origin is solved with a Vite
dev proxy so the browser's native `EventSource` (SSE) stays same-origin and `Last-Event-ID` resume
works. All new code is frontend; state is plain React hooks.

## Technical Context

**Language/Version**: JavaScript (ES2022), React 19, Vite 8 (existing app, ESM)  
**Primary Dependencies**: React 19 + react-dom (existing); browser `EventSource` + `fetch` (built-in).
New devDependencies only: Vitest + @testing-library/react + jsdom for component/hook tests.  
**Storage**: None added in the browser. Run history/replay comes from the backend's stored logs.
Optionally remember the last run id in `localStorage` for convenience (non-essential).  
**Testing**: Vitest + @testing-library/react (jsdom), mocking `fetch` and `EventSource`. Focus on the
`useRun` reducer logic and per-type event rendering. Live path verified manually via quickstart.  
**Target Platform**: Modern browsers with `EventSource` support; local dev (Vite dev server).  
**Project Type**: Web application — this phase is the frontend layer over the Phase 1 backend.  
**Performance Goals**: New events visible within ~2s (SC-002); timeline stays readable under rapid
bursts (virtualization not required at Phase 1 volumes; cap/auto-scroll instead).  
**Constraints**: No backend changes (FR-019). Same-origin SSE via dev proxy. One active run at a time
(FR-017). Resume stream without gaps/dupes using `seq`/`Last-Event-ID` (FR-009, SC-006).  
**Scale/Scope**: Single local user, one run at a time, small-to-moderate event counts per run.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The constitution governs autonomous-agent safety; this phase adds no agent capability and no tool
execution — it only observes and relays human decisions. Relevant principles:

| Principle | Compliance |
|-----------|------------|
| I. Sandbox-First Safety | N/A to the UI — it never executes tools or touches the workspace. No change to sandbox behavior. |
| II. Explicit Tool Contracts | Unchanged — the UI does not add tools or side-effect paths; it renders what the backend reports. |
| III. Human-in-the-Loop Gates | **Strengthened**: the UI is the human's interface to approve/reject gated actions. It MUST never auto-resolve a gate except via the backend's existing auto-approve mode, and MUST never proceed on an unapproved gate (FR-010..013, SC-003). |
| IV. Observable Agent Loop | **Directly serves this**: the UI renders the full event stream and supports gap-free replay (FR-006/007/015, SC-005/006). |
| V. Bounded Autonomy | The UI exposes limits as inputs and surfaces which limit halted a run (FR-003, FR-014, US3); it cannot raise limits beyond what the user sets. |
| Tech/Security: secrets | The browser never receives the Groq key; it talks only to the backend via the proxy. The UI MUST not log or display any secret (none are exposed by the backend). |

**Result**: PASS. No violations. The one binding rule carried into design: the UI must not bypass a
human gate (enforced by routing every gate decision through the backend approvals endpoint).

## Project Structure

### Documentation (this feature)

```text
specs/002-run-console-ui/
├── plan.md              # This file
├── spec.md
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (view models + reducer states)
├── quickstart.md        # Phase 1 output (run backend + vite, drive a run)
├── contracts/
│   └── backend-consumption.md  # How the UI consumes the existing backend (no new endpoints)
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

New frontend code lives under `src/runtime/` (API + SSE clients) and `src/console/` (the RunConsole
feature). The existing chat UI (`TalentCore_v2.jsx`) is left intact; a tiny app shell adds a view
switch so both coexist.

```text
src/
├── main.jsx                  # MODIFIED: render the app shell instead of TalentCore directly
├── AppShell.jsx              # NEW: minimal in-app view switch (Chat | Run Console), no router dep
├── roster.js                 # NEW: shared employee roster (extracted from TalentCore_v2 INIT_EMPLOYEES)
├── TalentCore_v2.jsx         # MODIFIED (minimal): import roster from roster.js (single source of truth)
├── runtime/
│   ├── api.js                # fetch wrappers: startRun, getRun, decideApproval (base path /api/agent)
│   └── stream.js             # EventSource wrapper: subscribe(runId, { onEvent, onStatus, lastEventId })
└── console/
    ├── RunConsole.jsx        # feature container: holds useRun, switches start-form ↔ live view
    ├── useRun.js             # hook + reducer: start, stream, accumulate events, status, approval, result
    ├── StartRunForm.jsx      # employee picker + task + optional limits + auto-approve
    ├── RunStatusBar.jsx      # current status + connection state
    ├── RunTimeline.jsx       # ordered event list
    ├── EventItem.jsx         # per-type rendering (thought/tool_call/tool_result/…/result)
    ├── ApprovalPrompt.jsx    # Approve/Reject for a pending gated action
    ├── ResultPanel.jsx       # final outcome, reason, changed files
    └── console.css           # styles reusing existing CSS variables/conventions

src/test/
├── useRun.test.jsx           # reducer transitions: events accumulate, status, approval, result, resume
└── eventItem.test.jsx        # each event type renders distinctly

vite.config.js                # MODIFIED: add /api/agent proxy → http://localhost:8787
package.json                  # MODIFIED: add vitest/test scripts + dev deps
```

**Structure Decision**: Keep the existing entry working by introducing `AppShell.jsx` as the new
render root with a simple state-based view switch (Chat vs Run Console) — no router dependency, per
the input. Extract the roster to `roster.js` so the chat UI and the console share one source of truth
(avoids drift, satisfies FR-020). All backend access funnels through `runtime/api.js` + `stream.js`
so the single-origin/proxy detail and the SSE/`Last-Event-ID` resume live in one place.

## Complexity Tracking

> No Constitution Check violations. Section intentionally empty.
