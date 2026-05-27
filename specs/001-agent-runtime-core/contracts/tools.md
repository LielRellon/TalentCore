# Contract: Tools (closed allow-list)

Exactly four tools. Every call goes through `dispatchTool(name, args, ctx)`. Each tool returns
`{ ok: boolean, output?, error? }`. All paths are workspace-relative and confined by `pathGuard`.

## `read_file`

- **Input**: `{ "path": string }`
- **Behaviour**: Read a UTF-8 text file inside the workspace.
- **Output (ok)**: `{ ok: true, output: { path, content } }`
- **Errors**: `not_found`, `is_directory`, `outside_workspace` (refused), `too_large` (cap, e.g. 1 MB).
- **Gated?** No.

## `write_file`

- **Input**: `{ "path": string, "content": string }`
- **Behaviour**: Create or overwrite a text file inside the workspace. Creates parent dirs as needed.
  Counts toward `maxFilesTouched` (distinct paths).
- **Output (ok)**: `{ ok: true, output: { path, bytesWritten, created } }`
- **Errors**: `outside_workspace` (refused), `file_limit` (halts run), `is_directory`.
- **Gated?** No for create/overwrite. **Deletion intent is gated** (handled via gate policy, not a
  separate tool) and out-of-workspace writes are refused.

## `list_dir`

- **Input**: `{ "path": string }` (defaults to workspace root if omitted)
- **Behaviour**: List entries of a directory inside the workspace.
- **Output (ok)**: `{ ok: true, output: { path, entries: [{ name, type: "file"|"dir" }] } }`
- **Errors**: `not_found`, `not_a_directory`, `outside_workspace` (refused).
- **Gated?** No.

## `run_command`

- **Input**: `{ "command": string }`
- **Behaviour**: Execute a shell command inside a Docker container with the workspace bind-mounted at
  `/workspace` (cwd), `--network none` by default, `--rm`. Captures stdout, stderr, exit code.
  Wall-clock-limited per call.
- **Output (ok)**: `{ ok: true, output: { exitCode, stdout, stderr } }` — note a non-zero exit is
  still `ok: true` at the tool level (the command ran); the agent observes the exit code/stderr.
- **Errors**: `docker_unavailable`, `command_timeout`, `outside_workspace`.
- **Gated?** Conditionally — the gate policy inspects the command and gates it when it indicates:
  `git push`; package install (`npm|pnpm|yarn (install|add|i)`, `pip install`, `apt(-get) install`);
  any network use; or file deletion (`rm`, `rmdir`, `unlink`). Out-of-workspace destructive commands
  are **refused outright**, not gated.

## Dispatch guarantees (apply to every call)

1. `name` must be in the registry, else `unknown_tool` (no execution).
2. `args` validated against the tool's JSON Schema, else `invalid_args` (no execution).
3. Path-bearing args confined to the workspace via `pathGuard`, else `outside_workspace` refusal.
4. Gate policy may pause the run (`approval_request`) before execution.
5. Limit checks (`maxFilesTouched`) may halt before execution.
6. Inputs and outputs are logged as `tool_call` / `tool_result` events.
