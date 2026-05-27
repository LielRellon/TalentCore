// The autonomous plan→act→observe loop (FR-003). Each iteration: the LLM reasons and
// either calls tools (act) whose results are fed back (observe), or returns a final
// message (done). Bounded by hard limits each cycle (Principle V): iterations, tokens,
// wall-clock. The file-touch limit is enforced inside dispatch.

import { dispatchTool } from "../tools/dispatch.js";
import { checkIterations, checkTokens, checkWallClock } from "../safety/limits.js";

function systemPrompt(persona, task) {
  return [
    persona.persona,
    "",
    "You are operating as an autonomous software engineer inside an isolated workspace.",
    "You can act ONLY through the provided tools: read_file, write_file, list_dir, run_command.",
    "All paths are relative to the workspace root. You cannot access anything outside it.",
    "Work step by step: inspect, make changes, run commands to verify (e.g. run tests).",
    "When writing Node tests, use `import { test } from 'node:test'` and `import assert from 'node:assert'`,",
    "and assert with `assert.strictEqual(actual, expected)` / `assert.ok(value)` — the test callback's",
    "argument is a TestContext, NOT an assertion library (do not call t.equal / t.ok / t.truthy).",
    "`node:test` and `node:assert` are BUILT-IN modules — never install them (no `npm install node:test`).",
    "Run a test file with exactly: `node --test <file>` (note the double dash; `node:test` is not a command).",
    "Double-check your code is syntactically valid before running (balanced braces/parens).",
    "Keep iterations few: write correct code the first time and avoid re-running unnecessarily.",
    "Verify your work by running it: a command that exits non-zero means the task is NOT done —",
    "read the error, fix it, and re-run until it exits 0. Never declare completion while a command fails.",
    "When the task is fully complete and verified, reply with a final message and NO tool calls,",
    "summarizing what you did and what changed.",
    "",
    `TASK: ${task}`,
  ].join("\n");
}

/**
 * Run the loop to completion or halt.
 * @param {object} p {
 *   persona, task, llm, bus, workspaceRoot, limits, preauth,
 *   requestApproval(callId, action, reason) => Promise<boolean>,
 * }
 * @returns {Promise<{ outcome, reason, summary, iterations, tokensUsed, filesChanged }>}
 */
export async function runLoop(p) {
  const { persona, task, llm, bus, workspaceRoot, limits, preauth, requestApproval } = p;
  const startedAt = Date.now();
  const filesTouched = new Set();
  let tokensUsed = 0;
  let iterations = 0;

  const messages = [
    { role: "system", content: systemPrompt(persona, task) },
    { role: "user", content: task },
  ];

  const ctx = { bus, workspaceRoot, limits, filesTouched, preauth, requestApproval };

  // Track the most recent command's exit code so we never accept "done" while the last
  // command was still failing. Bounded nudges prevent fighting the model forever.
  let lastCommandExit = null;
  let lastCommandStderr = "";
  let verifyNudges = 0;
  const MAX_VERIFY_NUDGES = 2;

  const halt = (kind) => ({
    outcome: "halted",
    reason: `limit reached: ${kind}`,
    summary: `Run halted after ${iterations} iteration(s) due to ${kind}.`,
    iterations,
    tokensUsed,
    filesChanged: [...filesTouched],
  });

  while (true) {
    // --- limit checks (before acting) ---
    let breach = checkIterations(limits, iterations) || checkWallClock(limits, startedAt) || checkTokens(limits, tokensUsed);
    if (breach) {
      bus.emit("limit", { kind: breach, value: limits[breachField(breach)] });
      return halt(breach);
    }

    iterations += 1;

    // --- reason ---
    let reply;
    try {
      reply = await llm.complete(messages);
    } catch (e) {
      // Surface the real cause (e.g. groq_error_429) plus any provider detail so a
      // failed run is diagnosable from the event log / UI.
      const detail = [e.message, e.detail].filter(Boolean).join(" — ");
      bus.emit("error", { message: detail || e.code || "unknown_error" });
      return {
        outcome: "failure",
        reason: `provider error: ${detail || e.code || e.message}`,
        summary: "The reasoning provider could not be reached.",
        iterations,
        tokensUsed,
        filesChanged: [...filesTouched],
      };
    }
    tokensUsed += reply.usage?.total_tokens || 0;
    const msg = reply.message;
    if (msg.content) bus.emit("thought", { text: msg.content });
    messages.push(msg);

    const toolCalls = msg.tool_calls || [];

    // --- done? (no tool calls = final answer) ---
    if (toolCalls.length === 0) {
      // Guard against false success: if the most recent command exited non-zero, the
      // task is not actually verified. Nudge the agent to fix it (bounded), and only
      // accept failure if it still cannot.
      if (typeof lastCommandExit === "number" && lastCommandExit !== 0) {
        if (verifyNudges < MAX_VERIFY_NUDGES) {
          verifyNudges += 1;
          bus.emit("thought", { text: `(verification) last command exited ${lastCommandExit}; not complete yet.` });
          messages.push({
            role: "user",
            content:
              `Your most recent command exited with code ${lastCommandExit}` +
              (lastCommandStderr ? ` (stderr: ${lastCommandStderr.slice(0, 300)})` : "") +
              `. The task is NOT complete until that command succeeds (exit 0). ` +
              `Diagnose and fix the cause, then re-run it. Do not claim completion while it fails.`,
          });
          continue; // keep working
        }
        // Exhausted nudges — report honest failure rather than a false success.
        return {
          outcome: "failure",
          reason: `verification failed: last command exited ${lastCommandExit}`,
          summary: msg.content || `The agent stopped but its last command exited ${lastCommandExit}.`,
          iterations,
          tokensUsed,
          filesChanged: [...filesTouched],
        };
      }
      return {
        outcome: "success",
        reason: "task complete",
        summary: msg.content || "Task completed.",
        iterations,
        tokensUsed,
        filesChanged: [...filesTouched],
      };
    }

    // --- act + observe ---
    for (const tc of toolCalls) {
      const name = tc.function?.name;
      let args = {};
      try {
        args = JSON.parse(tc.function?.arguments || "{}");
      } catch {
        args = {};
      }
      const result = await dispatchTool(name, args, ctx);
      // Remember the latest command exit code for the completion-verification guard.
      if (name === "run_command" && result.ok && result.output) {
        lastCommandExit = result.output.exitCode;
        lastCommandStderr = result.output.stderr || "";
      }
      // Feed the observation back to the model — but trim large outputs so the
      // conversation context (and token usage) does not balloon across iterations.
      const observation = result.ok ? { ok: true, output: trimOutput(result.output) } : { ok: false, error: result.error };
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(observation),
      });
      if (result.halt) return halt(result.halt.kind);
    }
  }
}

// Trim large string fields (e.g. command stdout/stderr) before sending them back to
// the model. Keeps the head + tail so errors at either end survive. Caps token growth.
function trimOutput(output, cap = 1500) {
  if (output == null) return output;
  const trimStr = (s) =>
    typeof s === "string" && s.length > cap
      ? s.slice(0, cap) + `\n…[trimmed ${s.length - cap} chars]…\n` + s.slice(-300)
      : s;
  if (typeof output === "string") return trimStr(output);
  if (typeof output === "object") {
    const out = {};
    for (const [k, v] of Object.entries(output)) out[k] = trimStr(v);
    return out;
  }
  return output;
}

function breachField(kind) {
  return {
    iteration_limit: "maxIterations",
    token_budget: "maxTokens",
    timeout: "maxWallClockMs",
    file_limit: "maxFilesTouched",
  }[kind];
}
