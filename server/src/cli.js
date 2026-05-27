#!/usr/bin/env node
// CLI entry (FR-007). Subcommands:
//   run   --persona <id> --task "<task>" [limit flags] [--auto-approve] [--json]
//   show  <runId> [--json]
// Streams events live; prompts y/N on approval gates unless --auto-approve.

import readline from "node:readline";
import { startRun, decideApproval } from "./run/manager.js";
import { replay, readResult } from "./events/store.js";

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) args[key] = true;
      else { args[key] = next; i++; }
    } else {
      args._.push(a);
    }
  }
  return args;
}

function fmt(event) {
  const { type, data } = event;
  switch (type) {
    case "status": return `[status] ${data.status}${data.detail ? ` — ${data.detail}` : ""}`;
    case "thought": return `[thought] ${data.text}`;
    case "tool_call": return `[tool] ${data.name} ${JSON.stringify(data.args)}`;
    case "tool_result": return `  └─ ${data.ok ? "ok" : "ERR " + data.error}${data.output ? " " + truncate(JSON.stringify(data.output)) : ""}`;
    case "approval_request": return `[APPROVAL NEEDED] ${data.action} (${data.reason})`;
    case "approval_decision": return `[approval] ${data.approved ? "approved" : "denied"} (${data.by})`;
    case "limit": return `[LIMIT] ${data.kind} (${data.value})`;
    case "refusal": return `[REFUSED] ${data.action} — ${data.reason}`;
    case "error": return `[ERROR] ${data.message}`;
    case "result": return `[result] ${data.outcome} — ${data.reason}\n${data.summary}\nfiles: ${data.filesChanged.join(", ") || "(none)"}`;
    default: return `[${type}] ${JSON.stringify(data)}`;
  }
}

function truncate(s, n = 200) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

async function cmdRun(args) {
  if (!args.persona || !args.task) {
    console.error('usage: cli.js run --persona <id> --task "<task>" [--max-iterations N] [--auto-approve] [--json]');
    process.exit(64);
  }
  const limits = {
    maxIterations: num(args["max-iterations"]),
    maxTokens: num(args["max-tokens"]),
    maxWallClockMs: num(args["max-wallclock-ms"]),
    maxFilesTouched: num(args["max-files"]),
  };
  const preauth = { autoApprove: args["auto-approve"] === true };

  const { runId, bus, done } = startRun({ personaId: args.persona, task: args.task, limits, preauth });
  console.error(`run ${runId} started`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  bus.subscribe((event) => {
    if (args.json) console.log(JSON.stringify(event));
    else console.log(fmt(event));
    if (event.type === "approval_request" && !preauth.autoApprove) {
      rl.question(`Approve "${event.data.action}"? [y/N] `, (ans) => {
        decideApproval(runId, event.data.callId, /^y(es)?$/i.test(ans.trim()));
      });
    }
  });

  const result = await done;
  rl.close();
  process.exit(result.outcome === "success" ? 0 : result.outcome === "halted" ? 2 : 1);
}

function cmdShow(args) {
  const runId = args._[0];
  if (!runId) { console.error("usage: cli.js show <runId> [--json]"); process.exit(64); }
  const events = replay(runId);
  for (const e of events) console.log(args.json ? JSON.stringify(e) : fmt(e));
  const result = readResult(runId);
  if (result && !args.json) console.log(`\n=== result ===\n${result.outcome}: ${result.reason}`);
}

function num(v) { return v === undefined || v === true ? undefined : Number(v); }

const argv = process.argv.slice(2);
const sub = argv[0];
const args = parseArgs(argv.slice(1));
if (sub === "run") cmdRun(args);
else if (sub === "show") cmdShow(args);
else { console.error("usage: cli.js <run|show> ..."); process.exit(64); }
