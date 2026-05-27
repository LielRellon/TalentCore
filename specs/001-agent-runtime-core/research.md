# Phase 0 Research: Autonomous Agent Runtime Core

All Technical Context items were resolved from the constitution and feature input; no open
`NEEDS CLARIFICATION` remained. This document records the decisions and the alternatives weighed.

## 1. LLM provider & tool-calling

- **Decision**: Groq Chat Completions API, model `llama-3.3-70b-versatile`, using native
  tool-calling (`tools` + `tool_choice`, assistant returns `tool_calls`, we reply with `role:"tool"`
  messages). Access via plain `fetch` to the REST endpoint to avoid an SDK dependency; wrap behind
  `agent/llm.js` so it is swappable and injectable in tests.
- **Rationale**: Fixed by the constitution. `llama-3.3-70b-versatile` supports function/tool calling.
  A thin `fetch` wrapper keeps dependencies minimal and makes stubbing trivial in `node:test`.
- **Alternatives considered**: Official `groq-sdk` (adds a dependency for little gain here);
  Ollama local (deferred — provider switch is a later concern); prompt-based JSON "tool" emulation
  (rejected — native tool-calling is more reliable and is supported).

## 2. Workspace isolation — git worktree

- **Decision**: `git worktree add .worktrees/<runId> -b run/<runId>` from the repo to give each run
  an isolated checkout on its own branch. Remove with `git worktree remove` on cleanup.
- **Rationale**: Constitution mandates worktree-level isolation minimum. Worktrees are cheap (shared
  object store), give a real filesystem root to confine paths to, and keep each run's changes on a
  separate branch for later review/merge.
- **Alternatives considered**: Full clone per run (slower, heavier); temp dir copy (loses git
  history/branching); operating directly in repo (violates Principle I).

## 3. Command execution isolation — Docker

- **Decision**: `run_command` runs via `docker run --rm --network none -v <worktree>:/workspace -w
  /workspace <image> sh -lc "<cmd>"` with the worktree bind-mounted read-write at `/workspace`.
  Default image a small Node image; no host mounts beyond the worktree; network off by default.
- **Rationale**: Constitution requires OS-level isolation for shell execution. `--network none`
  enforces the no-network default (network is a gated capability). Bind-mounting only the worktree
  contains all command side effects to the workspace.
- **Alternatives considered**: Running commands directly on host (violates Principle I); gVisor/
  Firecracker (heavier, unnecessary for Phase 1); restricting via subprocess + chroot (fragile on
  macOS, weaker isolation than a container).
- **Note**: If Docker is unavailable, `run_command` fails closed with a clear error rather than
  falling back to host execution.

## 4. Event transport — SSE over node:http

- **Decision**: Persist events as append-only JSONL at `runs/<runId>/events.jsonl`; stream live via
  Server-Sent Events from `GET /runs/:id/events`. An in-process EventBus fans out to both the JSONL
  writer and any connected SSE clients.
- **Rationale**: SSE is one-way server→client, trivially implemented on `node:http`, and natively
  consumable by the browser `EventSource` API for the later React frontend. JSONL is append-only,
  human-readable, and replayable line-by-line (satisfies FR-021 / SC-008). No web framework needed.
- **Alternatives considered**: WebSockets (bidirectional, heavier than needed — control actions like
  approvals can be plain POSTs); polling (higher latency, misses the live-stream requirement);
  a DB/event store (overkill; cloud persistence is out of scope).

## 5. Tool dispatch choke point

- **Decision**: A single `dispatchTool(name, args, ctx)` is the only path that executes any tool. It
  (1) verifies `name` is in the closed registry, (2) validates args against the tool's JSON schema,
  (3) for path-bearing tools runs `pathGuard` to confine to the workspace, (4) runs the gate policy
  and pauses for approval when required, (5) executes, and (6) logs the call inputs+outputs as
  events. No tool is callable except through this function.
- **Rationale**: Implements Principles II and III at one auditable location, so the boundary and
  gates cannot be bypassed by adding a tool incorrectly.
- **Alternatives considered**: Per-tool ad-hoc guards (easy to forget one — rejected); middleware
  chain (more machinery than four tools justify).

## 6. Path confinement — pathGuard

- **Decision**: Resolve the requested path against the workspace root with `path.resolve`, then
  require the real, normalized result to be inside the root (prefix check after resolving symlinks
  where present). Reject absolute paths outside root, `..` escapes, and symlink escapes before any
  fs effect.
- **Rationale**: FR-009 / SC-003 require 100% prevention of out-of-workspace access. Resolve-then-
  verify is the standard, testable approach.
- **Alternatives considered**: String prefix on the raw path (defeated by `..` and symlinks —
  rejected).

## 7. Human-in-the-loop gates

- **Decision**: `gates.js` classifies a proposed action as gated when it matches: a `run_command`
  whose command indicates git push, package install (`npm/pnpm/yarn install/add`, `pip install`, …),
  any explicit network use, or file deletion (`rm`, `unlink`, or a `write_file` delete intent). A
  gated action emits `approval_request` and the run enters `awaiting-approval` until a decision
  arrives (via HTTP POST or CLI prompt) or config pre-authorizes it. Out-of-workspace destructive
  ops are refused outright (not gated).
- **Rationale**: Implements Principle III with safe defaults; pre-authorization is explicit and
  scoped via config.
- **Alternatives considered**: Gating every command (too noisy); static command allow-list only
  (less flexible than classify + approve).

## 8. Bounded autonomy — limits

- **Decision**: `LimitSet { maxIterations, maxTokens, maxWallClockMs, maxFilesTouched }` with safe
  defaults (e.g. 25 / 100000 / 300000 / 25). The loop checks iteration/time/token ceilings each
  cycle; the dispatcher tracks distinct files written and refuses the write that would exceed
  `maxFilesTouched`. Any breach emits a `limit` event and ends the run as `halted`. The agent cannot
  read or modify limits.
- **Rationale**: FR-015..017 / SC-005/006. Splitting enforcement between loop (time/iter/tokens) and
  dispatcher (files) puts each check where the data lives.
- **Alternatives considered**: Single watchdog timer only (misses iteration/file ceilings).

## 9. Personas

- **Decision**: Reuse the persona text already defined in the frontend roster
  (`src/TalentCore_v2.jsx`, `INIT_EMPLOYEES`). Extract the `{id, name, role, persona}` data into a
  plain JSON the backend loads (`agent/personas.js`), keeping a single source of truth.
- **Rationale**: Spec assumption — personas already exist; do not redefine them.
- **Alternatives considered**: Duplicating persona strings in the backend (drift risk — rejected).

## 10. Testing strategy

- **Decision**: `node:test` + `node:assert`. Unit tests inject stub LLM and stub tool executors so
  the loop, gates, limits, path guard, and event store are tested deterministically without Groq or
  Docker. One integration test (skipped unless `RUN_INTEGRATION=1`) runs a real worktree + Docker
  task. Safety modules (pathGuard, gates, limits, dispatch) and event emission have mandatory tests
  per the constitution.
- **Rationale**: Built-in runner keeps dependencies minimal; injected adapters make autonomous
  behavior testable and fast.
- **Alternatives considered**: Jest/Vitest (extra deps); live-only testing (slow, flaky, costs
  tokens).
