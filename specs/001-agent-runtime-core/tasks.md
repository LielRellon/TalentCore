---
description: "Task list for Autonomous Agent Runtime Core (Phase 1)"
---

# Tasks: Autonomous Agent Runtime Core (Phase 1)

**Input**: Design documents from `/specs/001-agent-runtime-core/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Test tasks ARE included. The constitution makes automated tests mandatory for safety
code paths (sandbox boundary, tool dispatch, gates, limits) and for agent-loop event emission.
Those tests are therefore required, not optional.

**Organization**: Tasks grouped by user story (US1–US4) for independent implementation/testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on incomplete tasks)
- **[Story]**: US1–US4 (user-story phases only)
- All paths are repo-relative; backend lives under `server/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project skeleton and config so all later work has a home.

- [X] T001 Create backend directory structure per plan: `server/src/{agent,tools,sandbox,safety,events,run,http}/` and `server/test/`
- [X] T002 Add backend scripts + the single runtime dependency to root `package.json` (`"start:server": "node server/src/http/server.js"`, `"agent": "node server/src/cli.js"`, `"test:server": "node --test server/test"`); keep ESM
- [X] T003 [P] Create `server/src/config.js` reading `GROQ_API_KEY`, model id, default `LimitSet`, run/worktree dirs, Docker image from env with safe defaults
- [X] T004 [P] Add `runs/` and `.worktrees/` to `.gitignore`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure every user story depends on. **No story work until this is done.**

- [X] T005 [P] Implement `server/src/events/bus.js` — in-process EventBus with `emit(type,data)` assigning monotonic per-run `seq` + `ts`, and `subscribe(fn)`/`unsubscribe`
- [X] T006 [P] Implement `server/src/safety/limits.js` — `LimitSet` factory (defaults + per-run overrides), and helpers `checkIterations/checkTokens/checkWallClock/checkFiles` returning breach `kind`
- [X] T007 Implement `server/src/safety/pathGuard.js` — `resolveInWorkspace(root, p)` that resolves, follows symlinks, and rejects any path outside `root` (throws `outside_workspace`)
- [X] T008 [P] Implement `server/src/agent/personas.js` — load `{id,name,role,persona}` records extracted from the frontend roster into `server/src/agent/personas.json`; `getPersona(id)`
- [X] T009 Implement `server/src/events/store.js` — append events to `runs/<id>/events.jsonl`, write `runs/<id>/result.json`, and `replay(runId)` reading the log in order (depends on T005)
- [X] T010 Implement `server/src/tools/registry.js` — closed allow-list of the 4 tools with JSON Schemas exactly per contracts/tools.md (`read_file`, `write_file`, `list_dir`, `run_command`); `getTool(name)` returns undefined for anything else

**Checkpoint**: Event bus, store, limits, path guard, personas, tool registry exist and are unit-testable.

---

## Phase 3: User Story 1 - Run a coding task and watch it live (Priority: P1) 🎯 MVP

**Goal**: One employee autonomously completes a task in an isolated worktree via a Groq-driven
plan→act→observe loop, while events stream live and a final result is produced.

**Independent Test**: CLI run of "create an email-validation function + passing test" produces the
files in the worktree, streams events, and ends `success`.

### Tests for User Story 1 ⚠️ (write first, ensure they fail)

- [X] T011 [P] [US1] `server/test/eventStore.test.js` — events append with gap-free `seq`, ordered; `replay()` returns the full ordered sequence (FR-018/021, SC-008)
- [X] T012 [P] [US1] `server/test/loop.test.js` — loop with a STUB LLM (scripts tool_calls then "done") + STUB tools: asserts reason→act→observe order, emits `thought/tool_call/tool_result/status`, ends with one terminal `status` + one `result` (FR-003, SC-007)

### Implementation for User Story 1

- [X] T013 [US1] Implement `server/src/sandbox/workspace.js` — `createWorkspace(runId)` (`git worktree add .worktrees/<id> -b run/<id>`) and `removeWorkspace(runId)`; returns `{root,branch}` (FR-008)
- [X] T014 [P] [US1] Implement `server/src/tools/readFile.js` and `server/src/tools/listDir.js` using `pathGuard` (FR-004/009)
- [X] T015 [P] [US1] Implement `server/src/tools/writeFile.js` using `pathGuard`, creating parent dirs, returning `{path,bytesWritten,created}` (FR-004/009)
- [X] T016 [US1] Implement `server/src/tools/runCommand.js` via `server/src/sandbox/docker.js` (`docker run --rm --network none -v <root>:/workspace -w /workspace <image> sh -lc`), capturing exitCode/stdout/stderr with a per-call timeout; fail closed if Docker missing (FR-004/010)
- [X] T017 [US1] Implement `server/src/tools/dispatch.js` — the single choke point: registry check → arg-schema validation → pathGuard → (gate hook, filled in US2) → execute → emit `tool_call`/`tool_result`; unknown/invalid → error result, no execution (FR-004/020; Principle II)
- [X] T018 [US1] Implement `server/src/agent/llm.js` — Groq adapter via `fetch` to chat-completions with `tools` from the registry; maps assistant `tool_calls`↔our ToolCall; injectable for tests; never logs the API key (FR-005/014)
- [X] T019 [US1] Implement `server/src/agent/loop.js` — plan→act→observe: build system prompt from persona+task, call llm, dispatch tool_calls, feed results back, detect completion, emit events each step (FR-003/006, depends on T017/T018)
- [X] T020 [US1] Implement `server/src/run/manager.js` — single-run lifecycle: enforce one-run-at-a-time, create workspace, run loop, set status, write `result.json` with `filesChanged`/`reason`/summary (FR-002/006)
- [X] T021 [US1] Implement `server/src/cli.js` — `run --persona --task [limit flags]`, print streamed events, exit 0/1/2 on success/failure/halted (FR-007)
- [X] T022 [US1] Implement `server/src/http/server.js` (node:http) — `POST /runs` (409 if active), `GET /runs/:id/events` SSE with `Last-Event-ID` replay, `GET /runs/:id` per contracts/http-api.md (FR-007/019)

**Checkpoint**: MVP — an end-to-end autonomous run works from CLI and HTTP, events stream, files land in the worktree.

---

## Phase 4: User Story 2 - Containment & approval gates (Priority: P1)

**Goal**: All effects stay in the workspace; gated actions pause for human approval; out-of-workspace
destructive actions are refused.

**Independent Test**: agent attempt to write outside workspace → `refusal`, no external change;
attempt to delete/install → `approval_request`, no effect until approved.

### Tests for User Story 2 ⚠️ (mandatory per constitution)

- [X] T023 [P] [US2] `server/test/pathGuard.test.js` — `..`, absolute outside paths, and symlink escapes all rejected; in-workspace paths allowed (FR-009, SC-003)
- [X] T024 [P] [US2] `server/test/gates.test.js` — classifier flags git push / package installs / network / deletions as gated; benign commands not gated (FR-011)
- [X] T025 [P] [US2] `server/test/dispatch.test.js` — gated action emits `approval_request` and does NOT execute until approved; rejection drops it; pre-authorized config executes; out-of-workspace destructive → `refusal` (FR-012/013, SC-004)

### Implementation for User Story 2

- [X] T026 [US2] Implement `server/src/safety/gates.js` — `classify(action)` per contracts/tools.md (push/install/network/delete), plus pre-authorization (`autoApprove`/config) and outright-refusal rules for out-of-workspace destructive ops (FR-011/013)
- [X] T027 [US2] Wire gates into `server/src/tools/dispatch.js` — on gated action emit `approval_request`, set run `awaiting-approval`, await decision/pre-auth before executing; emit `approval_decision`/`refusal` (FR-011/012, depends on T017/T026)
- [X] T028 [US2] Add `POST /runs/:id/approvals` to `server/src/http/server.js` and a CLI y/N prompt in `server/src/cli.js`, feeding decisions into the waiting dispatch (FR-012)
- [X] T029 [US2] Ensure secrets never reach tools/events: redact env, exclude API key from llm logs and event payloads; add assertion in `server/test/dispatch.test.js` (FR-014)

**Checkpoint**: US1 + US2 — autonomous runs are now contained and gated.

---

## Phase 5: User Story 3 - Bounded runs that always terminate (Priority: P2)

**Goal**: Every run halts on hitting any of iteration/token/wall-clock/file ceilings, reporting which.

**Independent Test**: low `--max-iterations` on an unfinishable task → `limit` event `iteration_limit` + `halted` result.

### Tests for User Story 3 ⚠️ (mandatory per constitution)

- [X] T030 [P] [US3] `server/test/limits.test.js` — each ceiling (iterations/tokens/wallclock/files) breach is detected and reports the correct `kind` (FR-015/016, SC-006)
- [X] T031 [P] [US3] `server/test/loop.test.js` (extend) — loop with `maxIterations:2` on a never-completing stub LLM halts at 2 with `limit kind:iteration_limit` and `halted` result (SC-005)

### Implementation for User Story 3

- [X] T032 [US3] Enforce iteration/token/wall-clock ceilings in `server/src/agent/loop.js` — check each cycle, emit `limit` + halt on breach (FR-015/016, depends on T019/T006)
- [X] T033 [US3] Enforce `maxFilesTouched` in `server/src/tools/dispatch.js` — track distinct written paths, refuse the write that would exceed it, emit `limit kind:file_limit`, halt (FR-015, depends on T017/T006)
- [X] T034 [US3] Surface limits in `result.json` (`outcome:halted`, `reason`) and accept per-run overrides via CLI flags / `POST /runs` body; agent cannot alter them (FR-017)

**Checkpoint**: US1–US3 — runs are contained, gated, and guaranteed to terminate.

---

## Phase 6: User Story 4 - Inspect and replay a completed run (Priority: P3)

**Goal**: After a run, its full ordered event log is retrievable and sufficient to reconstruct the run.

**Independent Test**: run a task un-watched, then read the stored log and retrace every step.

### Tests for User Story 4

- [X] T035 [P] [US4] `server/test/eventStore.test.js` (extend) — `replay(runId)` of a finished run yields the complete ordered sequence ending in terminal `status` + `result`, no `seq` gaps (FR-021, SC-008)

### Implementation for User Story 4

- [X] T036 [US4] Make `GET /runs/:id/events` replay `events.jsonl` in order for a finished run (then close), in addition to live streaming (FR-021)
- [X] T037 [P] [US4] Add `node server/src/cli.js show <runId>` to print `events.jsonl` (human-readable + `--json`) and `result.json`

**Checkpoint**: All four user stories independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T038 [P] Add `server/test/integration.test.js` — opt-in (`RUN_INTEGRATION=1`): real worktree + Docker, run the email-validation task end-to-end and assert success + files present (SC-001/002)
- [X] T039 [P] Update `specs/001-agent-runtime-core/quickstart.md` if any command/flag names changed during implementation
- [X] T040 [P] Add `server/README.md` documenting architecture, the 4 tools, gates, limits, and how to run
- [X] T041 Run `node --test server/test` and the quickstart validation steps; confirm all acceptance scenarios pass

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (P1)**: no deps.
- **Foundational (P2)**: after Setup. **Blocks all user stories.**
- **US1 (P3)**: after Foundational. MVP.
- **US2 (P4)**: after Foundational; wires into US1's dispatch (T027 depends on T017).
- **US3 (P5)**: after Foundational; enforces in US1's loop/dispatch (T032/T033 depend on T019/T017).
- **US4 (P6)**: after US1 (needs runs + store).
- **Polish (P7)**: after desired stories complete.

### Within Each Story

- Tests written first and failing → implementation.
- registry/pathGuard/limits (foundational) → tools → dispatch → loop → manager → cli/http.

### Parallel Opportunities

- Setup: T003, T004 in parallel.
- Foundational: T005, T006, T008 in parallel (T007 independent; T009 after T005; T010 independent).
- US1 tests T011/T012 in parallel; tools T014/T015 in parallel (T016 after docker.js).
- US2 tests T023/T024/T025 in parallel.
- US3 tests T030/T031 in parallel.
- Polish T038/T039/T040 in parallel.

---

## Parallel Example: User Story 1

```bash
# Tests first (parallel):
Task: "eventStore.test.js — append/replay ordering"
Task: "loop.test.js — reason/act/observe with stub LLM"

# Then independent tools (parallel):
Task: "readFile.js + listDir.js with pathGuard"
Task: "writeFile.js with pathGuard"
```

---

## Implementation Strategy

### MVP First (US1)

1. Phase 1 Setup → 2. Phase 2 Foundational → 3. Phase 3 US1 → **STOP & validate**: run the
   email-validation task end-to-end from the CLI. That is a demonstrable MVP.

### Incremental Delivery

US1 (MVP, autonomous run) → US2 (safety: containment + gates) → US3 (bounded termination) →
US4 (replay/inspect) → Polish. Note: although US1 is the MVP for *demonstration*, the constitution
makes US2 (Sandbox-First Safety, NON-NEGOTIABLE) required before any unattended/real use.

---

## Notes

- [P] = different files, no incomplete-task dependency.
- Safety tests (pathGuard/gates/dispatch/limits) and event-emission tests are mandatory (constitution).
- Commit after each task or logical group.
- Stop at any checkpoint to validate a story independently.
