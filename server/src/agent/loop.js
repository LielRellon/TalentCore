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
      bus.emit("error", { message: e.code || e.message });
      return {
        outcome: "failure",
        reason: `provider error: ${e.code || e.message}`,
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
      // feed the observation back to the model
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(result.ok ? { ok: true, output: result.output } : { ok: false, error: result.error }),
      });
      if (result.halt) return halt(result.halt.kind);
    }
  }
}

function breachField(kind) {
  return {
    iteration_limit: "maxIterations",
    token_budget: "maxTokens",
    timeout: "maxWallClockMs",
    file_limit: "maxFilesTouched",
  }[kind];
}
