# Implementation Plan: Autonomous Agent Runtime Core (Phase 1)

**Branch**: `001-agent-runtime-core` | **Date**: 2026-05-27 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-agent-runtime-core/spec.md`

## Summary

Deliver a headless Node.js runtime that lets one AI "employee" autonomously complete a coding task
inside an isolated workspace. The runtime drives a plan→act→observe loop powered by the Groq API
(`llama-3.3-70b-versatile`) with native tool-calling. The agent acts only through four tools
(`read_file`, `write_file`, `list_dir`, `run_command`), all routed through a single audited dispatch
choke point that enforces the workspace boundary, human-in-the-loop gates, and per-call logging.
Each run executes in a dedicated git worktree; `run_command` executes inside a Docker container
bound to that worktree. The loop is bounded by hard limits (iterations, tokens, wall-clock, files
touched) and emits a structured event stream that is both streamed live (SSE) and persisted as
JSONL for replay. A CLI entry point and a minimal HTTP server make the core demonstrable end-to-end.

## Technical Context

**Language/Version**: Node.js ≥ 20 (ESM; `package.json` already `"type": "module"`)  
**Primary Dependencies**: Groq Chat Completions API (tool-calling); Node built-ins (`node:child_process`,
`node:fs`, `node:path`, `node:http`, `node:crypto`); `git` CLI (worktrees); Docker CLI (command
sandbox). No web framework — HTTP/SSE via `node:http`. Minimal third-party footprint (only the Groq
SDK, or plain `fetch` to the Groq REST endpoint).  
**Storage**: Local filesystem. One directory per run under `runs/<runId>/` containing `events.jsonl`
(append-only event log) and `result.json` (final summary). Worktrees created under `.worktrees/<runId>/`.  
**Testing**: Node built-in test runner (`node:test` + `node:assert`). Groq and Docker are stubbed via
injected adapters in unit tests; one opt-in integration test exercises the real loop.  
**Target Platform**: Local developer machine (macOS/Linux) with `git` and Docker installed.  
**Project Type**: Web application (existing React+Vite frontend + new Node backend). This phase
delivers the backend only; frontend consumes the SSE stream later.  
**Performance Goals**: Live events visible to a consumer within ~2s of occurring (SC-007). Loop
overhead negligible relative to LLM latency.  
**Constraints**: Single agent run at a time (FR-002). All file/command effects confined to the
run's worktree (FR-009, FR-010). Gated actions never execute without approval/pre-auth (FR-011/012).
Every run terminates (SC-005). Secrets never reach tools/events (FR-014).  
**Scale/Scope**: One user, one concurrent run; small tasks (single feature/file + test). Not built
for multi-tenant scale this phase.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | How this plan complies |
|-----------|------------------------|
| I. Sandbox-First Safety (NON-NEGOTIABLE) | Each run gets its own git worktree; the tool dispatch resolves and validates every path against the worktree root and rejects escapes. `run_command` runs only inside a Docker container mounting the worktree, with no host access and (by default) no network. Destructive/outside-workspace ops refused outright. |
| II. Explicit Tool Contracts | Exactly four tools, defined as a closed allow-list in one registry. All tool effects pass through a single `dispatchTool()` choke point; no other side-effect path exists. Every call logged with inputs + outputs. |
| III. Human-in-the-Loop Gates | A gate policy classifies actions (git push, network, package install, file deletion) as gated. The dispatcher pauses the run and emits an `approval_request` event; the action executes only on approval or explicit config pre-authorization. |
| IV. Observable Agent Loop | The loop emits `thought`, `tool_call`, `tool_result`, `status`, `approval_request`, `approval_decision`, `limit`, and `error` events through one EventBus, streamed via SSE and appended to `events.jsonl`. The log alone reconstructs the run. |
| V. Bounded Autonomy | A LimitSet (max iterations, max tokens, max wall-clock ms, max files touched) is enforced by the loop and the dispatcher; breaching any limit halts the run with a `limit` event and a halted result. Limits come from config/defaults only — never mutated by the agent. |

**Result**: PASS. No violations; Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/001-agent-runtime-core/
├── plan.md              # This file
├── spec.md              # Feature spec
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── tools.md         # The 4 tool contracts (names, inputs, outputs, errors)
│   ├── events.md        # Event types + JSONL schema
│   └── http-api.md      # CLI command + HTTP/SSE endpoints
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (repository root)

The existing React+Vite app lives at repo root (`src/`, `index.html`, `vite.config.js`). The new
backend runtime is added under `server/` so the two concerns stay separate and the frontend can
later call the backend over HTTP.

```text
server/
├── src/
│   ├── agent/
│   │   ├── loop.js            # plan→act→observe orchestration
│   │   ├── llm.js             # Groq adapter (tool-calling); injectable for tests
│   │   └── personas.js        # load employee personas (reused from frontend roster)
│   ├── tools/
│   │   ├── registry.js        # closed allow-list of the 4 tools + JSON schemas
│   │   ├── dispatch.js        # single choke point: path guard + gate + logging
│   │   ├── readFile.js
│   │   ├── writeFile.js
│   │   ├── listDir.js
│   │   └── runCommand.js      # executes inside Docker, bound to the worktree
│   ├── sandbox/
│   │   ├── workspace.js       # create/cleanup git worktree per run
│   │   └── docker.js          # run a command in a container scoped to the worktree
│   ├── safety/
│   │   ├── pathGuard.js       # resolve + confine paths to workspace root
│   │   ├── gates.js           # classify gated actions; approval policy
│   │   └── limits.js          # LimitSet + enforcement helpers
│   ├── events/
│   │   ├── bus.js             # EventBus (emit + subscribe)
│   │   └── store.js           # append events to runs/<id>/events.jsonl; replay
│   ├── run/
│   │   └── manager.js         # single-run lifecycle, status, result.json
│   ├── http/
│   │   └── server.js          # node:http: POST /runs, GET /runs/:id/events (SSE), approvals
│   └── cli.js                 # CLI entry: start a run, print streamed events
└── test/
    ├── pathGuard.test.js
    ├── gates.test.js
    ├── limits.test.js
    ├── dispatch.test.js
    ├── eventStore.test.js
    ├── loop.test.js           # loop with a stubbed LLM + stubbed tools
    └── integration.test.js    # opt-in: real worktree + Docker (skipped without env flag)
```

**Structure Decision**: Web-application layout. Backend isolated under `server/`. Root `package.json`
stays the single manifest (already ESM); backend scripts/deps added there to minimize footprint.
Each subsystem (agent, tools, sandbox, safety, events, run, http) is a small focused module; safety
lives in its own directory because the constitution makes those code paths mandatory-to-test.

## Complexity Tracking

> No Constitution Check violations. Section intentionally empty.
