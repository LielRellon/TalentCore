# Phase 0 Research: Live Workspace File Viewer

Decisions resolved from the input and the existing codebase. No open clarifications.

## 1. Confined workspace reads (backend)

- **Decision**: New `server/src/files/workspaceFiles.js` with `listFiles(root)` (recursive, skip
  `.git`) and `readFile(root, relPath)` — the latter resolving via the existing
  `resolveInWorkspace(root, relPath)` from `safety/pathGuard.js`. Endpoints pass the run's worktree
  root; any path that resolves outside is refused.
- **Rationale**: Reuses the exact containment the agent's tools use (Principle I) at one choke point.
  No new safety logic to get wrong.
- **Alternatives considered**: Serve the worktree as a static dir (no per-request confinement control,
  risk of `.git`/secret exposure); read files in the http handler directly (duplicates guard logic).

## 2. Locating a run's worktree (active vs finished)

- **Decision**: `locateWorktree(runId)` returns the worktree root: for an **active** run, the run
  manager already holds `workspacePath`; for a **finished** run, derive `config.worktreesDir/<runId>`
  and verify it exists. If neither exists → `workspace_unavailable`.
- **Rationale**: Worktrees are retained after a run in the current design, so finished runs are
  browsable; the UI explains the rare missing-workspace case (FR/edge).
- **Alternatives considered**: Persist file snapshots in the event log (heavier; the worktree is the
  source of truth and already on disk).

## 3. Binary / oversized handling

- **Decision**: `readFile` checks size against `config.maxReadBytes` and sniffs for NUL bytes; returns
  `{ kind: "text", content }` or `{ kind: "binary" }` / `{ kind: "too_large", size }` — never raw
  bytes for the latter.
- **Rationale**: FR-014 — graceful notice, no layout break, no huge payloads.

## 4. Live file list without backend round-trips

- **Decision**: Derive the live file list and "currently writing" path in the `useRun` reducer from
  the `write_file` `tool_call` events already streaming in. Use the backend `listFiles` to populate/
  refresh when opening a finished run (or as an optional reconcile).
- **Rationale**: Instant live updates (SC-001) with zero extra latency; backend list covers the
  reopen/finished case and files created indirectly (e.g. by `run_command`).
- **Alternatives considered**: Poll `listFiles` during the run (extra latency + load); rely only on
  events (misses files created by commands) — so we do both: events for live, listing for completeness.

## 5. Typing/reveal animation

- **Decision**: `useTypingReveal(targetText, { play })` hook reveals `targetText` progressively via a
  timer/`requestAnimationFrame`, exposing the revealed substring and a `done` flag. It is
  **interruptible**: changing the target (selecting another file) or a `skip()` immediately shows the
  full text. Animation **source** = the `write_file` event's `content` (already in the timeline), so
  it plays instantly with no fetch; the revealed end-state is byte-for-byte the target (FR-009/SC-002).
- **Rationale**: Cosmetic, cheap, fully client-side; correctness guaranteed by ending on the exact
  target string. Separated into a hook for unit testing.
- **Alternatives considered**: Server-streamed chunks (the file was written whole — no real stream to
  replay; faking it client-side is honest as a presentation effect and simpler).

## 6. Reading older / non-written files

- **Decision**: For files not freshly written (selected from the explorer, or after reopen), fetch
  full content via `readFileContent(runId, path)`; show it without animation.
- **Rationale**: Only the just-written file animates (FR-007/008); everything else is plain view.

## 7. Layout & default view

- **Decision**: `RunConsole` becomes two-pane (timeline left, explorer+viewer right; stacks on narrow
  widths via CSS). `AppShell` defaults to Run Console; Chat stays reachable via the existing tab.
- **Rationale**: FR-015 + the discoverability fix; reuse existing `console.css` variables, no new
  design system.

## 8. Testing

- **Decision**: Backend `node:test` — path confinement (reject `..`, absolute, symlink escapes; allow
  in-worktree; binary/too_large notices). Frontend Vitest — reducer file-list derivation from
  `write_file` events; `useTypingReveal` ends exactly on target and is interruptible; `FileViewer`
  renders content/binary/error states (mock `fetch`).
- **Rationale**: Path confinement is constitution-mandated (safety code path). Hook correctness
  (final == target) is the key invariant for FR-009.
