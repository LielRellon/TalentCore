// Single-run lifecycle (FR-002, FR-006). Enforces one active run at a time, creates the
// workspace, wires the event bus + JSONL store, drives the loop, manages approval
// waiting (awaiting-approval status), and writes the final result.

import { randomUUID } from "node:crypto";
import { EventBus } from "../events/bus.js";
import { attachStore, writeResult } from "../events/store.js";
import { makeLimitSet } from "../safety/limits.js";
import { getPersona } from "../agent/personas.js";
import { createWorkspace, removeWorkspace } from "../sandbox/workspace.js";
import { createGroqLLM } from "../agent/llm.js";
import { runLoop } from "../agent/loop.js";

let activeRun = null; // { id, status, ... } | null

export function getActiveRun() {
  return activeRun;
}

export function getRun(runId) {
  return activeRun && activeRun.id === runId ? activeRun : null;
}

/**
 * Start a run. Rejects if one is already active.
 * @param {object} p { personaId, task, limits?, preauth?, llm?, keepWorkspace? }
 * @returns {{ runId, bus, status, done: Promise<RunResult> }}
 */
export function startRun(p) {
  if (activeRun && !isTerminal(activeRun.status)) {
    const e = new Error("run_in_progress");
    e.code = "run_in_progress";
    throw e;
  }
  const persona = getPersona(p.personaId);
  if (!persona) {
    const e = new Error("unknown_persona");
    e.code = "unknown_persona";
    throw e;
  }

  const runId = randomUUID().slice(0, 8);
  const bus = new EventBus(runId);
  const store = attachStore(bus);
  const limits = makeLimitSet(p.limits || {});

  // Pending-approval coordination: dispatch awaits requestApproval(); HTTP/CLI resolve it.
  const pending = new Map(); // callId -> { resolve, action }

  const run = {
    id: runId,
    personaId: p.personaId,
    task: p.task,
    status: "pending",
    limits,
    bus,
    pending,
    workspacePath: null,
    branch: null,
    result: null,
    createdAt: new Date().toISOString(),
    endedAt: null,
  };
  activeRun = run;

  const setStatus = (status, detail) => {
    run.status = status;
    bus.emit("status", { status, ...(detail ? { detail } : {}) });
  };

  const requestApproval = (callId, action) =>
    new Promise((resolve) => {
      pending.set(callId, {
        action,
        resolve: (approved) => {
          pending.delete(callId);
          // return to running if no other approvals pending
          if (pending.size === 0 && run.status === "awaiting-approval") setStatus("running");
          resolve(approved);
        },
      });
      setStatus("awaiting-approval", action);
    });

  const llm = p.llm || createGroqLLM();

  const done = (async () => {
    try {
      setStatus("running");
      const ws = createWorkspace(runId);
      run.workspacePath = ws.root;
      run.branch = ws.branch;

      const result = await runLoop({
        persona,
        task: p.task,
        llm,
        bus,
        workspaceRoot: ws.root,
        limits,
        preauth: p.preauth || {},
        requestApproval,
      });

      run.result = result;
      setStatus(result.outcome === "success" ? "completed" : result.outcome === "halted" ? "halted" : "failed");
      bus.emit("result", result);
      writeResult(runId, result);
      return result;
    } catch (e) {
      const result = {
        outcome: "failure",
        reason: e.code || e.message,
        summary: `Run failed to start or crashed: ${e.code || e.message}`,
        iterations: 0,
        tokensUsed: 0,
        filesChanged: [],
      };
      run.result = result;
      setStatus("failed", e.code || e.message);
      bus.emit("error", { message: e.code || e.message });
      bus.emit("result", result);
      writeResult(runId, result);
      return result;
    } finally {
      run.endedAt = new Date().toISOString();
      store.close();
      if (!p.keepWorkspace) {
        // Keep the worktree by default so changes can be inspected; only remove if asked.
      }
    }
  })();

  run.done = done;
  return { runId, bus, run, done };
}

/** Resolve a pending approval for the active run. */
export function decideApproval(runId, callId, approved) {
  const run = getRun(runId);
  if (!run) return { ok: false, error: "not_found" };
  if (run.status !== "awaiting-approval") return { ok: false, error: "run_not_awaiting_approval" };
  const entry = run.pending.get(callId);
  if (!entry) return { ok: false, error: "not_found" };
  entry.resolve(approved);
  return { ok: true };
}

function isTerminal(status) {
  return status === "completed" || status === "failed" || status === "halted";
}

/** Test/cleanup helper: clear the active-run slot. */
export function _resetActiveRun() {
  activeRun = null;
}

export { removeWorkspace };
