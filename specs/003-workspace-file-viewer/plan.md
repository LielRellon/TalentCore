# Implementation Plan: Live Workspace File Viewer (Phase 3)

**Branch**: `003-workspace-file-viewer` | **Date**: 2026-05-27 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-workspace-file-viewer/spec.md`

## Summary

Add a file explorer + read-only viewer beside the Run Console's event timeline, with a typing/reveal
animation that makes the agent's `write_file` actions read like live coding. The file list updates
live (derived from streamed `write_file` events) and the freshly-written file auto-opens and "types
out". The backend gains two workspace-confined read endpoints (list files, read one file) that reuse
the existing `pathGuard` so UI reads honor Sandbox-First Safety exactly like the agent's tools. The
Run Console becomes the default view.

## Technical Context

**Language/Version**: Node.js ≥ 20 (backend, ESM) + React 19 / Vite 8 (frontend, existing).  
**Primary Dependencies**: Backend: Node built-ins (`node:fs`, `node:path`) + existing `pathGuard`,
run manager, http server. Frontend: React 19, browser `fetch`/`EventSource` (existing). No new
runtime deps; tests use existing Vitest + node:test.  
**Storage**: Reads the run's git worktree on disk (live runs via the run manager's `workspacePath`;
finished runs via `.worktrees/<runId>`). No new persistence.  
**Testing**: `node:test` for endpoint path-confinement; Vitest + testing-library for reducer fileList
derivation, the typing-reveal hook, and viewer render states (mock `fetch`).  
**Target Platform**: Local dev (Vite dev server proxying `/api/agent` → backend :8787).  
**Project Type**: Web application (backend + frontend together this phase).  
**Performance Goals**: Written file appears + auto-opens within ~2s (SC-001); typing reveal smooth and
interruptible (SC-005).  
**Constraints**: Reads strictly confined to the run's workspace (FR-012, Principle I). Reveal is
presentation-only; final text == actual content (FR-009/SC-002). Read-only (FR-005). No secrets
(FR-013).  
**Scale/Scope**: Single user, one run, small file counts; recursive listing skips `.git`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Compliance |
|-----------|------------|
| I. Sandbox-First Safety (NON-NEGOTIABLE) | The new read endpoints resolve every requested path with the SAME `resolveInWorkspace` guard the agent's tools use, against the run's worktree root. Any `..`/absolute/symlink escape is refused. Listing skips `.git` and never leaves the worktree. UI-initiated reads thus inherit the agent's containment. Mandatory path-confinement tests added. |
| II. Explicit Tool Contracts | Unchanged — no new agent tools or side effects; these are read-only HTTP endpoints for the human UI, not agent capabilities. |
| III. Human-in-the-Loop Gates | Unaffected — reads are not gated actions; no agent action changes. |
| IV. Observable Agent Loop | Unchanged; the viewer is an additional rendering of already-observable `write_file` events. |
| V. Bounded Autonomy | Unaffected. |
| Secrets | Endpoints never read outside the worktree and return no env/secret material; oversized/binary files return a notice, not raw bytes. |

**Result**: PASS. The single binding rule into design: every workspace read goes through
`resolveInWorkspace` — no direct fs path from request input.

## Project Structure

### Documentation (this feature)

```text
specs/003-workspace-file-viewer/
├── plan.md · spec.md · research.md · data-model.md · quickstart.md
├── contracts/
│   └── files-api.md          # the two new read endpoints
└── checklists/requirements.md
```

### Source Code (repository root)

```text
server/src/
├── files/
│   └── workspaceFiles.js     # NEW: locateWorktree(runId), listFiles(root), readFile(root, relPath)
│                             #      all via pathGuard; binary/too_large handling
├── run/manager.js            # MODIFIED: expose a run's workspacePath by id (active runs)
├── http/server.js            # MODIFIED: GET /runs/:id/files, GET /runs/:id/files/content?path=
└── (sandbox/workspace.js)    # reuse worktreesDir layout for finished-run resolution

server/test/
└── workspaceFiles.test.js    # NEW: path confinement (reject .., absolute, symlink), read ok, notices

src/
├── AppShell.jsx              # MODIFIED: default view = Run Console; Chat still reachable
├── runtime/api.js            # MODIFIED: listFiles(runId), readFileContent(runId, path)
└── console/
    ├── useRun.js             # MODIFIED: derive fileList + currentlyWriting from write_file events
    ├── RunConsole.jsx        # MODIFIED: two-pane layout (timeline | explorer+viewer)
    ├── FileExplorer.jsx      # NEW: file list, select, highlight active
    ├── FileViewer.jsx        # NEW: read-only monospace; content/notice/error states
    ├── useTypingReveal.js    # NEW: progressive reveal hook; interruptible; ends == target
    └── console.css           # MODIFIED: two-pane + explorer/viewer styles

src/test/
├── useRun.files.test.jsx     # NEW: fileList derivation from write_file events
├── useTypingReveal.test.jsx  # NEW: completes to exact target; interrupt shows full text
└── fileViewer.test.jsx       # NEW: content / binary-notice / error render (mock fetch)
```

**Structure Decision**: Backend read logic isolated in `server/src/files/workspaceFiles.js` (one place
that owns worktree location + confined reads), wired into the existing http server. Frontend extends
the Phase 2 console: a new `useTypingReveal` hook keeps the animation concern separate and testable;
`useRun` gains file-list derivation from the events it already receives (instant live updates, no
backend round-trip for the live path), with the backend list used for finished-run/refresh. Layout
goes two-pane inside `RunConsole`.

## Complexity Tracking

> No Constitution Check violations. Section intentionally empty.
