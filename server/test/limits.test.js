// T030: limit detection (FR-015/016, SC-006).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  makeLimitSet, checkIterations, checkTokens, checkWallClock, checkFiles, LIMIT_KINDS,
} from "../src/safety/limits.js";

test("defaults + overrides", () => {
  const l = makeLimitSet({ maxIterations: 3 });
  assert.equal(l.maxIterations, 3);
  assert.ok(l.maxTokens > 0 && l.maxWallClockMs > 0 && l.maxFilesTouched > 0);
  // invalid overrides fall back to defaults
  assert.equal(makeLimitSet({ maxIterations: -5 }).maxIterations, makeLimitSet({}).maxIterations);
});

test("iteration ceiling", () => {
  const l = makeLimitSet({ maxIterations: 2 });
  assert.equal(checkIterations(l, 1), null);
  assert.equal(checkIterations(l, 2), LIMIT_KINDS.iterations);
});

test("token ceiling", () => {
  const l = makeLimitSet({ maxTokens: 100 });
  assert.equal(checkTokens(l, 99), null);
  assert.equal(checkTokens(l, 100), LIMIT_KINDS.tokens);
});

test("wall-clock ceiling", () => {
  const l = makeLimitSet({ maxWallClockMs: 1000 });
  const start = 10_000;
  assert.equal(checkWallClock(l, start, start + 999), null);
  assert.equal(checkWallClock(l, start, start + 1000), LIMIT_KINDS.wallclock);
});

test("file ceiling (would-exceed)", () => {
  const l = makeLimitSet({ maxFilesTouched: 2 });
  assert.equal(checkFiles(l, 2), null);
  assert.equal(checkFiles(l, 3), LIMIT_KINDS.files);
});
