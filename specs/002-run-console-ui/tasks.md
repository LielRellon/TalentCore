---
description: "Task list for Run Console UI (Phase 2)"
---

# Tasks: Run Console UI (Phase 2)

**Input**: Design documents from `/specs/002-run-console-ui/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Light test tasks included for the `useRun` reducer logic and per-type event rendering
(Vitest + testing-library), per the plan. The live end-to-end path is verified via quickstart.

**Organization**: Tasks grouped by user story (US1–US4). Frontend-only; backend unchanged (FR-019).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Different files, no dependency on incomplete tasks → parallelizable.
- All paths repo-relative; new UI under `src/runtime/` and `src/console/`.

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 Add the `/api/agent` dev proxy to `vite.config.js` → `http://localhost:8787` (rewrite strips `/api/agent`), preserving the existing `/api/chat` and `/api/ollama` proxies
- [X] T002 Add dev dependencies + scripts to root `package.json`: `vitest`, `@testing-library/react`, `@testing-library/dom`, `jsdom`; script `"test:ui": "vitest run"`
- [X] T003 [P] Create `vitest.config.js` (jsdom environment, React plugin) for component/hook tests

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared roster + backend clients every story uses. No story work until done.

- [X] T004 Create `src/roster.js` exporting the employee roster extracted from `src/TalentCore_v2.jsx` (`INIT_EMPLOYEES`); update `src/TalentCore_v2.jsx` to import from it (single source of truth, FR-020)
- [X] T005 [P] Create `src/runtime/api.js` — `startRun(body)`, `getRun(id)`, `decideApproval(id, callId, approved)` against base path `/api/agent`, returning parsed JSON and surfacing 409/400/404 as typed errors (contracts/backend-consumption.md)
- [X] T006 [P] Create `src/runtime/stream.js` — `subscribeRun(id, { onEvent, onConnection })` wrapping `EventSource('/api/agent/runs/:id/events')`, parsing each `data:` envelope, reporting connection state (open/reconnecting), and a `close()`; relies on native `Last-Event-ID` resume
- [X] T007 Create `src/console/useRun.js` — `useReducer`-based hook implementing RunState + actions per data-model.md (START_PENDING/FAILED, CONNECTION, EVENT with `seq` dedupe, APPROVAL_SENT, OPEN_RUN, RESET); exposes `{ state, startRun, openRun, approve, reject, reset }` wiring api.js + stream.js

**Checkpoint**: clients + roster + state hook exist and are unit-testable.

---

## Phase 3: User Story 1 - Start a run and watch it live (Priority: P1) 🎯 MVP

**Goal**: Pick employee + task → run starts → live timeline streams → final result shows.

**Independent Test**: backend up, pick employee, submit task, timeline populates live, ends with result.

### Tests for User Story 1

- [X] T008 [P] [US1] `src/test/useRun.test.jsx` — reducer accumulates events in `seq` order, ignores `seq <= lastSeq` (resume dedupe), updates status, sets result on terminal event (mock fetch + fake EventSource)
- [X] T009 [P] [US1] `src/test/eventItem.test.jsx` — each event type (thought/tool_call/tool_result/status/limit/refusal/error/result) renders a distinct, readable item

### Implementation for User Story 1

- [X] T010 [P] [US1] Create `src/console/EventItem.jsx` — per-type rendering incl. tool inputs/outputs, truncating long output with an expand affordance (edge case: long output)
- [X] T011 [P] [US1] Create `src/console/RunTimeline.jsx` — ordered list of EventItem, auto-scroll to latest with scroll-up-to-pause
- [X] T012 [P] [US1] Create `src/console/RunStatusBar.jsx` — shows run status + SSE connection state (FR-008/009)
- [X] T013 [P] [US1] Create `src/console/ResultPanel.jsx` — outcome, stop reason, changed-files list (FR-014)
- [X] T014 [US1] Create `src/console/StartRunForm.jsx` — employee picker (from `roster.js`) + task textarea with empty-task guard (FR-001/002); emits StartRunInput
- [X] T015 [US1] Create `src/console/RunConsole.jsx` — container using `useRun`: renders StartRunForm when idle, else StatusBar + Timeline + ResultPanel; handles start → live transition (FR-005/006)
- [X] T016 [US1] Create `src/console/console.css` reusing existing CSS variables/conventions; no new design system (FR-020)
- [X] T017 [US1] Create `src/AppShell.jsx` (Chat | Run Console view switch, no router) and point `src/main.jsx` at it, keeping the existing chat working

**Checkpoint**: MVP — start a run in the browser and watch it stream to a result.

---

## Phase 4: User Story 2 - Approve or reject gated actions (Priority: P1)

**Goal**: Gated actions surface Approve/Reject; run pauses until decided; auto-approve skips prompts.

**Independent Test**: trigger a gated task → prompt appears, status awaiting-approval, decide resumes/drops; with auto-approve no prompt.

### Tests for User Story 2

- [X] T018 [P] [US2] `src/test/useRun.test.jsx` (extend) — `approval_request` sets `pendingApproval` + status awaiting-approval; reducer never clears it except on `approval_decision`/APPROVAL_SENT (SC-003)

### Implementation for User Story 2

- [X] T019 [US2] Create `src/console/ApprovalPrompt.jsx` — shows action + reason, Approve/Reject buttons (FR-010)
- [X] T020 [US2] Wire ApprovalPrompt into `src/console/RunConsole.jsx`: render when `pendingApproval` set; Approve/Reject call `useRun.approve/reject` → `POST /api/agent/runs/:id/approvals` (FR-011/012)
- [X] T021 [US2] Add auto-approve toggle to `src/console/StartRunForm.jsx`; pass through to `startRun` body; show "pre-authorized" rendering for auto-approved gates (FR-004/013)

**Checkpoint**: US1 + US2 — human-in-the-loop gates work in the browser.

---

## Phase 5: User Story 3 - Configure limits before starting (Priority: P2)

**Goal**: Optional per-run limits; defaults when blank; halt reason names the limit.

**Independent Test**: low iteration limit on an unfinishable task → halts, result names the limit.

### Implementation for User Story 3

- [X] T022 [US3] Add optional limit inputs (max iterations/tokens/wallclock/files) to `src/console/StartRunForm.jsx`; omit blanks so backend defaults apply (FR-003)
- [X] T023 [US3] Ensure `src/console/ResultPanel.jsx` / EventItem clearly render a `limit` halt and which limit was hit (FR-014, US3 acceptance)

**Checkpoint**: US1–US3 — bounded runs configurable and surfaced.

---

## Phase 6: User Story 4 - Replay a finished run (Priority: P3)

**Goal**: Open a finished run by id (incl. after reload); full timeline + result from storage.

**Independent Test**: finish a run, reload, open by id → full ordered timeline + result render.

### Tests for User Story 4

- [X] T024 [P] [US4] `src/test/useRun.test.jsx` (extend) — `openRun(id)` resets then replays streamed-from-storage events to the same final state (no dupes)

### Implementation for User Story 4

- [X] T025 [US4] Add "open run by id" affordance in `src/console/RunConsole.jsx` (input or remembered last run id in `localStorage`); calls `useRun.openRun` which subscribes — backend replays a finished run then closes (FR-015/016)
- [X] T026 [US4] Handle unknown run id with a clear "not found" message (FR-018, edge case)

**Checkpoint**: all four stories functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T027 [P] Single-run handling: on `POST /runs` 409, RunConsole informs the user and offers to view the active run instead of starting another (FR-017, SC-007)
- [X] T028 [P] Error states: backend unreachable / failed start show a visible message, never an indefinite spinner (FR-018, SC-008)
- [X] T029 [P] Update `specs/002-run-console-ui/quickstart.md` if any names/scripts changed during build
- [X] T030 Run `npm run test:ui` (all green) and walk the quickstart end-to-end with the backend up (live run + an approval gate + a reload replay)

---

## Dependencies & Execution Order

- **Setup (P1)** → **Foundational (P2, blocks all stories)** → **US1 (P3, MVP)** → US2 → US3 → US4 → **Polish (P7)**.
- US2 depends on US1's RunConsole/StartRunForm (T020/T021 edit T014/T015).
- US3 edits StartRunForm/ResultPanel (after US1).
- US4 uses `useRun.openRun` (T007) + RunConsole (US1).

### Parallel Opportunities

- Setup: T003 ∥ rest. Foundational: T005 ∥ T006 (T007 after both).
- US1 tests T008 ∥ T009; presentational components T010/T011/T012/T013 ∥ (then T014/T015 wire them).
- Polish T027/T028/T029 ∥.

---

## Implementation Strategy

**MVP = through T017** (US1): start a run and watch it stream live in the browser. Stop and validate
with the quickstart, then layer US2 (gates — the key safety interaction), US3 (limits), US4 (replay),
then polish. Each story is independently demoable.

## Notes

- Frontend only. No backend changes (FR-019); documented gaps (run-list, cancel) stay deferred.
- The one hard rule: the UI must never advance past a gate without a backend approval (SC-003).
- Commit after each story/logical group.
