# Contract: Workspace Files API (new, read-only, confined)

Two new read-only endpoints on the existing backend, consumed by the UI via the `/api/agent` proxy.
Both confine all access to the run's worktree using the same `resolveInWorkspace` guard as the
agent's tools (constitution Principle I). No writes. No secrets.

## `GET /runs/:id/files`

List the files in a run's workspace (recursive, `.git` excluded).

- **Resolution**: active run → run manager `workspacePath`; finished run → `worktreesDir/<id>`.
- **200**: `{ "files": [ { "path": "src/email.js", "type": "file" }, { "path": "src", "type": "dir" } ] }`
- **404**: `{ "error": "workspace_unavailable" }` (no worktree for this id)

## `GET /runs/:id/files/content?path=<workspace-relative>`

Read one file's current content for display.

- **path** is workspace-relative; resolved via `resolveInWorkspace(root, path)`.
- **200 (text)**: `{ "path": "...", "kind": "text", "content": "..." }`
- **200 (binary)**: `{ "path": "...", "kind": "binary" }` (no bytes)
- **200 (too large)**: `{ "path": "...", "kind": "too_large", "size": 1234567 }`
- **403**: `{ "error": "outside_workspace" }` — path escaped the worktree (refused)
- **404**: `{ "error": "not_found" }` — no such file, or `{ "error": "workspace_unavailable" }`

## Guarantees

- Every path is resolved through `resolveInWorkspace`; `..`, absolute, and symlink escapes are
  refused before any fs read (SC-004).
- `.git` and anything outside the worktree are never listed or read.
- Oversized (`> config.maxReadBytes`) and binary files return a notice, never raw content (FR-014).
- Read-only: there is no write/delete endpoint in this contract (FR-005).

## Frontend usage (`src/runtime/api.js`)

| Function | Calls | Returns |
|----------|-------|---------|
| `listFiles(runId)` | `GET /api/agent/runs/:id/files` | `{ files }` |
| `readFileContent(runId, path)` | `GET /api/agent/runs/:id/files/content?path=…` | FileContent |

Live updates do NOT require these: the file list and animation source come from `write_file` events
already streaming over SSE. The endpoints serve the explorer for reopened/finished runs, files made
by `run_command`, and viewing any non-freshly-written file.
