// T025/T029: dispatch choke point — gates, refusals, file limit, logging, secrets.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.GROQ_API_KEY = "gsk_SENTINEL_SECRET_should_never_leak";

const { EventBus } = await import("../src/events/bus.js");
const { dispatchTool } = await import("../src/tools/dispatch.js");
const { makeLimitSet } = await import("../src/safety/limits.js");

function makeCtx(overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "disp-"));
  const bus = new EventBus("d1");
  const events = [];
  bus.subscribe((e) => events.push(e));
  return {
    events,
    ctx: {
      bus,
      workspaceRoot: root,
      limits: makeLimitSet({}),
      filesTouched: new Set(),
      preauth: {},
      requestApproval: async () => true, // default approve
      ...overrides,
    },
  };
}

test("unknown tool is rejected without executing", async () => {
  const { ctx, events } = makeCtx();
  const r = await dispatchTool("delete_everything", {}, ctx);
  assert.equal(r.ok, false);
  assert.equal(r.error, "unknown_tool");
  assert.ok(events.find((e) => e.type === "tool_result" && e.data.error === "unknown_tool"));
});

test("invalid args rejected", async () => {
  const { ctx } = makeCtx();
  const r = await dispatchTool("write_file", { path: "a" }, ctx); // missing content
  assert.equal(r.ok, false);
  assert.equal(r.error, "invalid_args");
});

test("write_file logs tool_call + tool_result and writes inside workspace", async () => {
  const { ctx, events } = makeCtx();
  const r = await dispatchTool("write_file", { path: "out.txt", content: "hello" }, ctx);
  assert.equal(r.ok, true);
  assert.equal(fs.readFileSync(path.join(ctx.workspaceRoot, "out.txt"), "utf8"), "hello");
  assert.ok(events.find((e) => e.type === "tool_call" && e.data.name === "write_file"));
  assert.ok(events.find((e) => e.type === "tool_result" && e.data.ok === true));
});

test("out-of-workspace write is refused (no escape)", async () => {
  const { ctx } = makeCtx();
  const r = await dispatchTool("write_file", { path: "../escape.txt", content: "x" }, ctx);
  // pathGuard re-anchors, so it writes inside workspace, never outside.
  assert.ok(!fs.existsSync(path.join(ctx.workspaceRoot, "..", "escape.txt")));
  assert.ok(r.ok || r.error === "outside_workspace");
});

test("destructive command refused outright (no approval)", async () => {
  let asked = false;
  const { ctx, events } = makeCtx({ requestApproval: async () => { asked = true; return true; } });
  const r = await dispatchTool("run_command", { command: "rm -rf /" }, ctx);
  assert.equal(r.error, "refused");
  assert.equal(asked, false);
  assert.ok(events.find((e) => e.type === "refusal"));
});

test("gated command waits for approval; denial means no execution", async () => {
  const { ctx, events } = makeCtx({ requestApproval: async () => false });
  const r = await dispatchTool("run_command", { command: "rm notes.txt" }, ctx);
  assert.equal(r.error, "approval_denied");
  assert.ok(events.find((e) => e.type === "approval_request"));
  assert.ok(events.find((e) => e.type === "approval_decision" && e.data.approved === false));
});

test("pre-authorized gated command skips the prompt", async () => {
  let asked = false;
  const { ctx, events } = makeCtx({
    preauth: { autoApprove: true },
    requestApproval: async () => { asked = true; return true; },
  });
  await dispatchTool("run_command", { command: "npm install left-pad" }, ctx);
  assert.equal(asked, false);
  assert.ok(events.find((e) => e.type === "approval_decision" && e.data.by === "preauthorized"));
});

test("file-touch limit halts the write that would exceed it", async () => {
  const { ctx, events } = makeCtx({ limits: makeLimitSet({ maxFilesTouched: 1 }) });
  const r1 = await dispatchTool("write_file", { path: "a.txt", content: "1" }, ctx);
  assert.equal(r1.ok, true);
  const r2 = await dispatchTool("write_file", { path: "b.txt", content: "2" }, ctx);
  assert.equal(r2.error, "file_limit");
  assert.ok(r2.halt && r2.halt.kind === "file_limit");
  assert.ok(events.find((e) => e.type === "limit" && e.data.kind === "file_limit"));
});

test("secrets never appear in the event stream (FR-014)", async () => {
  const { ctx, events } = makeCtx();
  await dispatchTool("write_file", { path: "x.txt", content: "data" }, ctx);
  const serialized = JSON.stringify(events);
  assert.ok(!serialized.includes("SENTINEL_SECRET"));
});
