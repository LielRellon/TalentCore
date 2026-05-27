// Tests for the useRun reducer (pure) — accumulation, dedupe/resume, status, approval,
// result. Covers US1 (T008), US2 (T018), US4 (T024) reducer behavior.
import { describe, it, expect } from "vitest";
import { reducer, initialState } from "../console/useRun.js";

const ev = (seq, type, data = {}) => ({ seq, ts: "2026-05-27T00:00:00Z", type, data });

function applyAll(events, start = initialState) {
  return events.reduce((s, e) => reducer(s, { type: "EVENT", event: e }), start);
}

describe("useRun reducer", () => {
  it("accumulates events in order and tracks lastSeq", () => {
    const s = applyAll([ev(0, "status", { status: "running" }), ev(1, "thought", { text: "hi" })]);
    expect(s.events.map((e) => e.seq)).toEqual([0, 1]);
    expect(s.lastSeq).toBe(1);
    expect(s.status).toBe("running");
  });

  it("ignores duplicate/old seq on resume (no dupes, no gaps)", () => {
    let s = applyAll([ev(0, "thought"), ev(1, "thought"), ev(2, "thought")]);
    // simulate a reconnect replaying seq 1 and 2 again
    s = applyAll([ev(1, "thought"), ev(2, "thought"), ev(3, "thought")], s);
    expect(s.events.map((e) => e.seq)).toEqual([0, 1, 2, 3]);
  });

  it("sets and clears pendingApproval (US2)", () => {
    let s = applyAll([ev(0, "approval_request", { callId: "c1", action: "run_command: rm x", reason: "delete" })]);
    expect(s.pendingApproval).toEqual({ callId: "c1", action: "run_command: rm x", reason: "delete" });
    // reducer must NOT clear it except via approval_decision / APPROVAL_SENT
    s = reducer(s, { type: "EVENT", event: ev(1, "thought") });
    expect(s.pendingApproval).not.toBeNull();
    s = reducer(s, { type: "EVENT", event: ev(2, "approval_decision", { approved: true, by: "human" }) });
    expect(s.pendingApproval).toBeNull();
  });

  it("APPROVAL_SENT optimistically clears the prompt", () => {
    let s = applyAll([ev(0, "approval_request", { callId: "c1", action: "a", reason: "r" })]);
    s = reducer(s, { type: "APPROVAL_SENT" });
    expect(s.pendingApproval).toBeNull();
  });

  it("sets result and terminal status on result event", () => {
    const s = applyAll([
      ev(0, "status", { status: "running" }),
      ev(1, "result", { outcome: "success", reason: "task complete", filesChanged: ["a.js"] }),
    ]);
    expect(s.result.outcome).toBe("success");
    expect(s.status).toBe("completed");
  });

  it("maps halted/failed outcomes to terminal status", () => {
    const halted = applyAll([ev(0, "result", { outcome: "halted", reason: "limit", filesChanged: [] })]);
    expect(halted.status).toBe("halted");
    const failed = applyAll([ev(0, "result", { outcome: "failure", reason: "boom", filesChanged: [] })]);
    expect(failed.status).toBe("failed");
  });

  it("START_FAILED with conflict surfaces the active-run conflict", () => {
    const s = reducer(initialState, { type: "START_FAILED", error: "A run is already in progress.", conflict: true });
    expect(s.activeRunConflict).toBe(true);
    expect(s.status).toBe("idle");
  });

  it("OPEN_RUN resets then replays to the same final state (US4)", () => {
    let s = reducer(initialState, { type: "OPEN_RUN", runId: "abc" });
    s = applyAll([
      ev(0, "status", { status: "running" }),
      ev(1, "tool_call", { callId: "t1", name: "write_file", args: { path: "a.js" } }),
      ev(2, "tool_result", { callId: "t1", ok: true }),
      ev(3, "result", { outcome: "success", reason: "done", filesChanged: ["a.js"] }),
    ], s);
    expect(s.runId).toBe("abc");
    expect(s.events).toHaveLength(4);
    expect(s.status).toBe("completed");
  });
});
