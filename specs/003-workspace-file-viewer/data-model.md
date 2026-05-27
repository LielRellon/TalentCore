# Phase 1 Data Model: Live Workspace File Viewer

Client view models + the backend read shapes. No new persistence.

## Backend shapes

### FileEntry (listing)

| Field | Type | Notes |
|-------|------|-------|
| `path` | string | Workspace-relative path (POSIX separators). |
| `type` | enum | `file` \| `dir`. |

`GET /runs/:id/files` → `{ files: FileEntry[] }` (recursive, `.git` excluded).

### FileContent (read one)

| Field | Type | Notes |
|-------|------|-------|
| `path` | string | Echoed workspace-relative path. |
| `kind` | enum | `text` \| `binary` \| `too_large`. |
| `content` | string? | Present only when `kind === "text"`. |
| `size` | number? | Present for `too_large`. |

`GET /runs/:id/files/content?path=...` → FileContent, or an error code
(`outside_workspace` / `not_found` / `workspace_unavailable`).

## Frontend view models

### FileListItem

Derived from `write_file` events (live) and/or backend listing (reopen/refresh).

| Field | Type | Notes |
|-------|------|-------|
| `path` | string | Workspace-relative. |
| `lastWriteContent` | string? | Content from the most recent `write_file` event for this path (animation source). Absent for files learned only from the backend list. |
| `touchedAt` | number | seq/time of last write — for ordering / "recently changed". |

### useRun additions (RunState)

| Field | Type | Notes |
|-------|------|-------|
| `files` | Map<path, FileListItem> | Accumulated from `write_file` `tool_call` events as they stream. |
| `currentlyWriting` | string \| null | Path of the most recent `write_file` (drives auto-select + animation). |

Reducer rule: on an `EVENT` of type `tool_call` with `name === "write_file"`, upsert
`files[args.path]` with `lastWriteContent = args.content`, set `currentlyWriting = args.path`. (Dedupe
by seq as today.) Selecting/opening a finished run merges backend `listFiles` into `files`.

### ViewerState (in FileViewer / RunConsole)

| Field | Type | Notes |
|-------|------|-------|
| `selectedPath` | string \| null | File shown in the viewer. |
| `source` | enum | `animate` (fresh write — use `lastWriteContent` + typing reveal) \| `fetch` (load via backend). |
| `content` | string \| null | Loaded/animated content. |
| `state` | enum | `idle` \| `loading` \| `text` \| `binary` \| `too_large` \| `error`. |
| `revealing` | boolean | Whether the typing animation is currently playing. |

Auto-select rule: when `currentlyWriting` changes during a live run and the user has not manually
overridden, set `selectedPath = currentlyWriting`, `source = "animate"`. A manual click sets
`source = "fetch"` (or `animate` skipped) and shows full content immediately (FR-010).

### useTypingReveal(target, { play, speed })

Returns `{ shown, done, skip() }`. `shown` grows toward `target`; `done` true when `shown === target`.
Changing `target` or calling `skip()` sets `shown = target` immediately. Invariant: terminal `shown`
is byte-for-byte `target` (FR-009 / SC-002).
