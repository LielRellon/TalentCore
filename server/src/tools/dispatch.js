// The single audited choke point for ALL tool effects (Principle II). Nothing executes
// a tool except through dispatchTool. It enforces, in order:
//   1. registry membership (closed allow-list)
//   2. input-schema validation
//   3. gate policy: refuse outright / require approval / allow  (Principle III)
//   4. file-touch limit for writes                              (Principle V)
//   5. execution
//   6. logging every call's inputs + outputs as events          (Principle IV)

import { randomUUID } from "node:crypto";
import { getTool } from "./registry.js";
import { readFile } from "./readFile.js";
import { writeFile } from "./writeFile.js";
import { listDir } from "./listDir.js";
import { runCommand } from "./runCommand.js";
import { classify, isPreAuthorized } from "../safety/gates.js";
import { checkFiles } from "../safety/limits.js";

const EXECUTORS = {
  read_file: readFile,
  write_file: writeFile,
  list_dir: listDir,
  run_command: runCommand,
};

// Minimal JSON-schema validation: required keys, types, no extra keys.
function validateArgs(schema, args) {
  if (typeof args !== "object" || args === null) return "args must be an object";
  for (const key of schema.required || []) {
    if (!(key in args)) return `missing required arg: ${key}`;
  }
  if (schema.additionalProperties === false) {
    for (const key of Object.keys(args)) {
      if (!(key in (schema.properties || {}))) return `unexpected arg: ${key}`;
    }
  }
  for (const [key, val] of Object.entries(args)) {
    const prop = (schema.properties || {})[key];
    if (prop && prop.type === "string" && typeof val !== "string") {
      return `arg ${key} must be a string`;
    }
  }
  return null;
}

/**
 * Execute one tool call through every guard.
 * @param {string} name tool name requested by the agent
 * @param {object} args tool arguments
 * @param {object} ctx RunContext: {
 *   bus, workspaceRoot, limits, filesTouched:Set<string>, preauth,
 *   requestApproval(callId, action, reason) => Promise<boolean>,
 * }
 * @returns {Promise<{ ok, output?, error?, halt?: {kind} }>}
 */
export async function dispatchTool(name, args, ctx) {
  const callId = randomUUID();

  // 1. closed allow-list
  const tool = getTool(name);
  if (!tool) {
    ctx.bus.emit("tool_call", { callId, name, args });
    const result = { ok: false, error: "unknown_tool" };
    ctx.bus.emit("tool_result", { callId, ...result });
    return result;
  }

  // 2. schema validation
  const invalid = validateArgs(tool.inputSchema, args || {});
  if (invalid) {
    ctx.bus.emit("tool_call", { callId, name, args });
    const result = { ok: false, error: "invalid_args", detail: invalid };
    ctx.bus.emit("tool_result", { callId, ...result });
    return result;
  }

  ctx.bus.emit("tool_call", { callId, name, args });

  // 3. gate policy
  const cls = classify(name, args);
  let allowNetwork = false;
  if (cls.decision === "refuse") {
    ctx.bus.emit("refusal", { action: cls.action, reason: cls.kind });
    const result = { ok: false, error: "refused" };
    ctx.bus.emit("tool_result", { callId, ...result });
    return result;
  }
  if (cls.decision === "gate") {
    if (isPreAuthorized(cls, ctx.preauth)) {
      ctx.bus.emit("approval_decision", { callId, approved: true, by: "preauthorized" });
    } else {
      ctx.bus.emit("approval_request", { callId, action: cls.action, reason: cls.kind });
      const approved = await ctx.requestApproval(callId, cls.action, cls.kind);
      ctx.bus.emit("approval_decision", { callId, approved, by: "human" });
      if (!approved) {
        const result = { ok: false, error: "approval_denied" };
        ctx.bus.emit("tool_result", { callId, ...result });
        return result;
      }
    }
    if (cls.network) allowNetwork = true;
  }

  // 4. file-touch limit (writes only), pre-execution
  if (name === "write_file") {
    const prospective = new Set(ctx.filesTouched);
    prospective.add(args.path);
    const breach = checkFiles(ctx.limits, prospective.size);
    if (breach) {
      ctx.bus.emit("limit", { kind: breach, value: ctx.limits.maxFilesTouched });
      const result = { ok: false, error: "file_limit", halt: { kind: breach } };
      ctx.bus.emit("tool_result", { callId, ok: false, error: "file_limit" });
      return result;
    }
  }

  // 5. execute
  const exec = EXECUTORS[name];
  const result = await exec(args, { ...ctx, allowNetwork });

  // record a successfully written file toward the touch count
  if (name === "write_file" && result.ok) {
    ctx.filesTouched.add(args.path);
  }

  // 6. log result
  ctx.bus.emit("tool_result", { callId, ok: result.ok, output: result.output, error: result.error });
  return result;
}
