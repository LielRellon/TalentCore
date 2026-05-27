# Quickstart: Run Console UI

Drive the agent from the browser, end to end.

## Prerequisites

- Phase 1 backend works (Node ≥ 20, git, Docker running, `GROQ_API_KEY` in `.env`).
- Frontend deps installed: `npm install` (adds Vitest + testing-library as devDeps).

## Run it

Two terminals:

```bash
# Terminal 1 — backend agent runtime
npm run start:server          # http://localhost:8787

# Terminal 2 — Vite dev server (proxies /api/agent → :8787)
npm run dev                   # http://localhost:5173
```

Open http://localhost:5173 and switch to the **Run Console** tab.

## Drive a run

1. Pick an employee (e.g. Lena Park — Software Engineer).
2. Enter a task, e.g.:
   *"Create src/email.js exporting isValidEmail(s) and test/email.test.js using node:test, then run the tests and make them pass."*
3. (Optional) set limits or tick **Auto-approve**.
4. Click **Start run**.

You should see the timeline stream live: thoughts, `write_file` actions, a `run_command`, its
output, then a **success** result with the changed-files list.

## Try an approval gate

Run a task that triggers a gated action (without auto-approve), e.g. *"install the left-pad package
and use it"*. The console shows an **Approve / Reject** prompt and the status flips to
*awaiting-approval*; the run waits until you click.

## Replay after reload

After a run finishes, reload the page and reopen the run by its id — the full timeline and result
render from the backend's stored log.

## Verify resilience

- Stop the backend mid-run → status bar shows *reconnecting*; restart it → timeline resumes with no
  gaps or duplicates.
- Start a second run while one is active → the console tells you a run is in progress and offers to
  view it.

## Tests

```bash
npm run test:ui               # Vitest: useRun reducer + EventItem rendering (mocked fetch/EventSource)
```
