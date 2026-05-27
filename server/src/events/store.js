// Event persistence & replay (FR-021, SC-008). Each run owns a directory under
// runs/<id>/ holding an append-only events.jsonl and a final result.json. The log
// alone is sufficient to reconstruct the run.

import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

export function runDir(runId) {
  return path.join(config.runsDir, runId);
}

/**
 * Attach a JSONL writer to a bus: every emitted event is appended as one line.
 * Returns the unsubscribe function.
 */
export function attachStore(bus) {
  const dir = runDir(bus.runId);
  fs.mkdirSync(dir, { recursive: true });
  const logPath = path.join(dir, "events.jsonl");
  // Append synchronously so the log is always durable and immediately replayable
  // (no buffering race between emit and read).
  const unsubscribe = bus.subscribe((event) => {
    fs.appendFileSync(logPath, JSON.stringify(event) + "\n");
  });
  return { unsubscribe, close: () => unsubscribe(), logPath };
}

/** Write the final result.json for a run. */
export function writeResult(runId, result) {
  const dir = runDir(runId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "result.json"), JSON.stringify(result, null, 2));
}

/** Read the result.json for a run, or null if absent. */
export function readResult(runId) {
  const p = path.join(runDir(runId), "result.json");
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

/**
 * Replay a run's full event log in order. Returns an array of event envelopes.
 * Throws if the run directory or log is missing.
 */
export function replay(runId) {
  const p = path.join(runDir(runId), "events.jsonl");
  if (!fs.existsSync(p)) {
    throw new Error(`not_found: no event log for run ${runId}`);
  }
  const lines = fs.readFileSync(p, "utf8").split("\n").filter(Boolean);
  return lines.map((l) => JSON.parse(l));
}

/** True if a run directory exists. */
export function runExists(runId) {
  return fs.existsSync(runDir(runId));
}
