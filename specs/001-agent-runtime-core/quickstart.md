# Quickstart: Autonomous Agent Runtime Core

## Prerequisites

- Node.js ≥ 20
- `git` (worktree support — any modern git)
- Docker (for `run_command` isolation; the daemon must be running)
- A Groq API key in `.env` at repo root: `GROQ_API_KEY=...`

## Install

```bash
npm install
```

(Backend uses Node built-ins; the only runtime dependency added is for the Groq call if the SDK is
chosen, otherwise none beyond what already exists.)

## Run a task from the CLI

```bash
node server/src/cli.js run \
  --persona sfe \
  --task "Create src/email.js exporting isValidEmail(s) and a node:test in test/email.test.js. Run the test and make it pass."
```

You will see a live stream of events: `status`, `thought`, `tool_call`, `tool_result`, … ending in
a `result`. The produced files live in the run's git worktree (printed at start, under
`.worktrees/<runId>/`), on branch `run/<runId>`.

## Approving a gated action

If the agent proposes a gated action (e.g. installing a package or deleting a file), the run pauses
and the CLI prompts:

```
APPROVAL NEEDED: run_command "npm install left-pad"  [y/N]
```

Answer `y` to allow, `N` to reject. Use `--auto-approve` to pre-authorize all gated actions for a
trusted run.

## Run the HTTP server (for the frontend later)

```bash
node server/src/http/server.js        # listens on :8787
# Start a run:
curl -XPOST localhost:8787/runs -d '{"personaId":"sfe","task":"..."}'
# Watch events:
curl -N localhost:8787/runs/<runId>/events
```

## Inspect / replay a finished run

```bash
cat runs/<runId>/events.jsonl     # full ordered event log
cat runs/<runId>/result.json      # final summary
```

## Run the tests

```bash
node --test                       # unit tests (LLM + Docker stubbed)
RUN_INTEGRATION=1 node --test     # also runs the real worktree + Docker integration test
```

## Verifying the safety properties (maps to acceptance scenarios)

- **Containment**: ask the agent to write outside the workspace → expect a `refusal` event and no
  file changes outside `.worktrees/<runId>/`.
- **Gates**: ask it to delete a file or install a package → expect `approval_request` and no effect
  until you approve.
- **Limits**: set `--max-iterations 2` on a task it can't finish → expect a `limit` event with
  `kind: iteration_limit` and a `halted` result.
