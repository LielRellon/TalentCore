---
description: "Task list for Live Workspace File Viewer (Phase 3)"
---

# Tasks: Live Workspace File Viewer (Phase 3)

**Input**: Design documents from `/specs/003-workspace-file-viewer/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included. Backend path-confinement is constitution-mandated (safety code path); the
typing-reveal invariant (final == target) and reducer file-list derivation are core correctness.

**Organization**: By user story (US1–US3). Backend + frontend this phase.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 [P] No new dependencies needed; confirm `vitest`/`node:test` still run (`npm run test:ui`, `npm run test:server`) as a baseline before changes

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Backend confined-read module + run worktree resolution + frontend clients. Blocks all stories.

- [X] T002 [P] Implement `server/src/files/workspaceFiles.js` — `listFiles(root)` (recursive, skip `.git`, return `[{path,type}]`) and `readFile(root, relPath)` (resolve via `resolveInWorkspace`; size cap from `config.maxReadBytes`; NUL-sniff → `{kind:'text'|'binary'|'too_large', content?, size?}`)
- [X] T003 Add `locateWorktree(runId)` to `server/src/files/workspaceFiles.js` — active run via run manager `workspacePath`, else `config.worktreesDir/<runId>` if it exists, else throw `workspace_unavailable`
- [X] T004 Expose active run workspace path: add `getRunWorkspace(runId)` (or reuse `getRun`) in `server/src/run/manager.js` returning `workspacePath` for the active run
- [X] T005 [P] Add `listFiles(runId)` and `readFileContent(runId, path)` to `src/runtime/api.js` (GET `/api/agent/runs/:id/files` and `/files/content?path=`), surfacing `outside_workspace`/`not_found`/`workspace_unavailable` as typed errors

**Checkpoint**: backend can list/read a worktree safely; frontend has clients.

---

## Phase 3: User Story 1 - Watch files "type out" as the agent codes (Priority: P1) 🎯 MVP

**Goal**: Files appear live; the freshly-written file auto-opens and reveals progressively.

**Independent Test**: run that writes a file → file appears, viewer auto-opens it, content animates to exact written content.

### Tests for User Story 1

- [X] T006 [P] [US1] `src/test/useTypingReveal.test.jsx` — reveal ends byte-for-byte equal to target (FR-009/SC-002); changing target or `skip()` shows full text immediately (FR-010/SC-005)
- [X] T007 [P] [US1] `src/test/useRun.files.test.jsx` — reducer derives `files` map + `currentlyWriting` from `write_file` tool_call events; dedupes by seq; last write wins

### Implementation for User Story 1

- [X] T008 [US1] Extend `src/console/useRun.js` reducer: on `tool_call` `write_file`, upsert `files[args.path]={lastWriteContent,touchedAt}` and set `currentlyWriting=args.path`; expose `files`, `currentlyWriting`
- [X] T009 [P] [US1] Create `src/console/useTypingReveal.js` — `useTypingReveal(target,{play,speed})` → `{shown,done,skip}`; timer/rAF reveal; target change/skip ⇒ shown=target
- [X] T010 [P] [US1] Create `src/console/FileViewer.jsx` — read-only monospace; if `source==='animate'` use `useTypingReveal(lastWriteContent)`, else fetch via `readFileContent`; render `text`/`binary`/`too_large`/`error`/`loading` states (FR-004/014/016)
- [X] T011 [US1] Create `src/console/FileExplorer.jsx` — list `files` (sorted), click to select, highlight `currentlyWriting`/selected (FR-001/002/003)
- [X] T012 [US1] Wire into `src/console/RunConsole.jsx` — two-pane layout: timeline left, FileExplorer+FileViewer right; auto-select `currentlyWriting` with `source='animate'` during live run unless user manually selected (FR-007/010)
- [X] T013 [US1] Update `src/console/console.css` — two-pane responsive layout (stack on narrow), explorer + viewer styles reusing existing variables

**Checkpoint**: MVP — live "watch it code" experience.

---

## Phase 4: User Story 2 - Browse and read workspace files anytime (Priority: P1)

**Goal**: Click any file → full current content, during a run and after reopening a finished run.

**Independent Test**: with files present (live or reopened), click each → full content read-only.

### Tests for User Story 2

- [X] T014 [P] [US2] `server/test/workspaceFiles.test.js` — path confinement: reject `..`, absolute, symlink escape; allow in-worktree read; `.git` excluded from listing; binary/too_large notices (FR-012/013/014, SC-004)
- [X] T015 [P] [US2] `src/test/fileViewer.test.jsx` — renders text content; renders binary/too_large notice; renders error state (mock `fetch`)

### Implementation for User Story 2

- [X] T016 [US2] Add the two endpoints to `server/src/http/server.js`: `GET /runs/:id/files` and `GET /runs/:id/files/content?path=` using `workspaceFiles` + `locateWorktree`; map errors to 403/404 per contract
- [X] T017 [US2] In `src/console/RunConsole.jsx`/FileExplorer: clicking a file sets `source='fetch'` and loads via `readFileContent` (interrupts any animation, FR-010); manual selection persists until user picks another
- [X] T018 [US2] On opening a finished run (`openRun`), call `listFiles(runId)` and merge into `files` so the explorer is populated from the worktree (FR-001 for reopened runs); handle `workspace_unavailable` with a clear notice (FR-016)

**Checkpoint**: US1 + US2 — full browse/read, live and reopened.

---

## Phase 5: User Story 3 - Run Console is the default view (Priority: P2)

**Goal**: App opens on Run Console; Chat still reachable.

**Independent Test**: fresh load shows Run Console; a visible control reaches Chat and back.

### Implementation for User Story 3

- [X] T019 [US3] Change `src/AppShell.jsx` default view state to `"console"`; keep the Chat tab clearly visible and switchable (FR-015, SC-006)

**Checkpoint**: all three stories functional.

---

## Phase 6: Polish & Cross-Cutting

- [X] T020 [P] Empty/edge states: explorer shows "no files yet" when none; viewer shows idle prompt when nothing selected (spec edge cases)
- [X] T021 [P] Update `specs/003-workspace-file-viewer/quickstart.md` if any names/paths changed
- [X] T022 Run `npm run test:ui` + `node --test 'server/test/**/*.test.js'` (all green) and walk the quickstart: live typing reveal, click-to-view, reopen a finished run, and a curl path-escape returns 403

---

## Dependencies & Execution Order

- **Setup (P1)** → **Foundational (P2, blocks stories)** → **US1 (P3, MVP)** → **US2 (P4)** → **US3 (P5)** → **Polish (P6)**.
- T008 (reducer) precedes T012 (RunConsole wiring). T002/T003 precede T016 (endpoints). T004 precedes T003's active-run branch.
- US2's endpoints (T016) depend on the foundational files module (T002/T003).

### Parallel Opportunities

- Foundational: T002 ∥ T005 (T003 after T002; T004 independent).
- US1: tests T006 ∥ T007; T009 (hook) ∥ T010/T011 (then T012 wires).
- US2: tests T014 ∥ T015.
- Polish: T020 ∥ T021.

---

## Implementation Strategy

**MVP = through T013** (US1): the live "type out" experience — the headline. Validate via quickstart,
then US2 (browse/reopen + the backend endpoints + confinement tests), US3 (default view), polish.

## Notes

- Backend path-confinement tests (T014) are mandatory (constitution safety rule).
- The typing reveal is presentation-only; its terminal state must equal the actual written content (T006 enforces).
- Live file list comes from events (no backend round-trip); endpoints serve reopen/finished + command-created files.
