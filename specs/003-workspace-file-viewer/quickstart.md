# Quickstart: Live Workspace File Viewer

## Run it

```bash
npm run start:server     # terminal 1 → :8787
npm run dev              # terminal 2 → :5173
```

Open http://localhost:5173 — it now lands on the **Run Console** by default (Chat still reachable via
the top tab).

## Watch live coding

1. Pick an employee, task: *"Create src/add.js exporting add(a,b) and test/add.test.js with node:test + node:assert, run the test."*
2. Start. The view is two panes: **event timeline** (left) and **files** (right).
3. As the agent writes each file:
   - it appears in the **File Explorer**
   - the **File Viewer** auto-opens it and the content **types out** progressively
   - focus follows each new write
4. Click any file in the explorer to read its full current content (interrupts the animation).

## After the run / reopen

- Browse all files; click to view final content.
- Reopen a finished run by id → explorer lists workspace files (fetched from the backend), viewer
  shows their content.

## Verify safety

```bash
# direct backend: a path-escape attempt is refused
curl 'localhost:8787/runs/<runId>/files/content?path=../../etc/passwd'   # → 403 outside_workspace
curl 'localhost:8787/runs/<runId>/files'                                  # → only worktree files, no .git
```

## Tests

```bash
node --test 'server/test/**/*.test.js'   # incl. workspaceFiles path-confinement
npm run test:ui                          # reducer file-list, useTypingReveal, FileViewer
```
