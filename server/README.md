# Talent Core — Agent Runtime (Phase 1)

Headless Node.js backend that lets one AI "employee" autonomously complete a coding task inside an
isolated sandbox, via a plan→act→observe loop. See the full spec in
[`specs/001-agent-runtime-core/`](../specs/001-agent-runtime-core/).

## Architecture

```
cli.js / http/server.js   ← entry points (trigger a run, stream events)
        │
   run/manager.js         ← single-run lifecycle, one run at a time, writes result.json
        │
  agent/loop.js           ← plan→act→observe; enforces iteration/token/wallclock limits
        │  ├─ agent/llm.js      Groq tool-calling adapter (injectable; never logs the key)
        │  └─ agent/personas.js the 12 employee personas (from the frontend roster)
        ▼
 tools/dispatch.js        ← THE single audited choke point for every tool effect
        ├─ tools/registry.js   closed allow-list of the 4 tools + JSON schemas
        ├─ safety/pathGuard.js confines all paths to the workspace
        ├─ safety/gates.js     refuse / require-approval / allow
        ├─ safety/limits.js    file-touch ceiling (others enforced in the loop)
        └─ tools/{readFile,writeFile,listDir,runCommand}.js
                                   runCommand → sandbox/docker.js (container, no network)
 sandbox/workspace.js     ← git worktree per run (.worktrees/<id>, branch run/<id>)
 events/{bus,store}.js    ← structured events → SSE + runs/<id>/events.jsonl (replayable)
```

## The four tools

`read_file`, `write_file`, `list_dir`, `run_command`. Nothing else can act. Every call goes through
`dispatchTool()`, which validates, path-guards, gates, limit-checks, executes, and logs.

## Safety model (maps to the constitution)

- **Sandbox-first**: files confined to the run's git worktree; commands run in a Docker container
  with `--network none` and only the worktree mounted. Fails closed if Docker is missing.
- **Gates**: `git push`, package installs, network commands, and deletions require approval (or
  explicit pre-authorization). `rm -rf /` and force-push are refused outright.
- **Bounded**: every run halts on hitting any of max iterations / tokens / wall-clock / files.
- **Observable**: every thought, tool call, result, approval, limit, and refusal is an event;
  the JSONL log alone reconstructs the run.

## Usage

```bash
# CLI
node server/src/cli.js run --persona sfe --task "Create src/email.js with isValidEmail and a passing node:test"
node server/src/cli.js show <runId>

# HTTP (for the frontend)
node server/src/http/server.js        # :8787
curl -XPOST localhost:8787/runs -d '{"personaId":"sfe","task":"..."}'
curl -N localhost:8787/runs/<runId>/events

# Tests
node --test 'server/test/**/*.test.js'
RUN_INTEGRATION=1 node --test 'server/test/**/*.test.js'   # real worktree + Docker + Groq
```

Requires Node ≥ 20, `git`, Docker, and `GROQ_API_KEY` in `.env` (repo root).
