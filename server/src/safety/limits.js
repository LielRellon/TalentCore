// Bounded autonomy (Principle V / FR-015..017). A LimitSet carries hard ceilings;
// the check* helpers return a breach `kind` string (or null) so callers can emit a
// `limit` event and halt. Limits come from config/overrides only — never the agent.

import { config } from "../config.js";

/** Breach kinds, aligned with the events contract. */
export const LIMIT_KINDS = {
  iterations: "iteration_limit",
  tokens: "token_budget",
  wallclock: "timeout",
  files: "file_limit",
};

/**
 * Build an effective LimitSet from defaults + optional per-run overrides.
 * Only known numeric fields are honored; unknown keys are ignored.
 */
export function makeLimitSet(overrides = {}) {
  const d = config.defaultLimits;
  const pick = (k) =>
    Number.isFinite(Number(overrides[k])) && Number(overrides[k]) > 0
      ? Number(overrides[k])
      : d[k];
  return {
    maxIterations: pick("maxIterations"),
    maxTokens: pick("maxTokens"),
    maxWallClockMs: pick("maxWallClockMs"),
    maxFilesTouched: pick("maxFilesTouched"),
  };
}

export function checkIterations(limits, iterations) {
  return iterations >= limits.maxIterations ? LIMIT_KINDS.iterations : null;
}

export function checkTokens(limits, tokensUsed) {
  return tokensUsed >= limits.maxTokens ? LIMIT_KINDS.tokens : null;
}

export function checkWallClock(limits, startedAtMs, nowMs = Date.now()) {
  return nowMs - startedAtMs >= limits.maxWallClockMs ? LIMIT_KINDS.wallclock : null;
}

/**
 * Files check is "would-exceed": pass the count AFTER the prospective write.
 * Returns the breach kind if that count would exceed the ceiling.
 */
export function checkFiles(limits, distinctFilesTouchedAfter) {
  return distinctFilesTouchedAfter > limits.maxFilesTouched ? LIMIT_KINDS.files : null;
}
