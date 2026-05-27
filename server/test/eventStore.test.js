// T011/T035: event ordering + replay (FR-018/021, SC-008).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Point runsDir at a temp dir before importing modules that read config.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agentruns-"));
process.env.RUNS_DIR = tmp;

const { EventBus } = await import("../src/events/bus.js");
const { attachStore, writeResult, replay } = await import("../src/events/store.js");

test("bus assigns gap-free monotonic seq", () => {
  const bus = new EventBus("seqtest");
  const seqs = ["status", "thought", "status"].map((t) => bus.emit(t, {}).seq);
  assert.deepEqual(seqs, [0, 1, 2]);
});

test("store appends events and replay returns full ordered sequence", () => {
  const bus = new EventBus("r1");
  const store = attachStore(bus);
  bus.emit("status", { status: "running" });
  bus.emit("thought", { text: "thinking" });
  bus.emit("tool_call", { callId: "c1", name: "list_dir", args: {} });
  bus.emit("tool_result", { callId: "c1", ok: true });
  const result = { outcome: "success", reason: "done", filesChanged: [] };
  bus.emit("result", result);
  store.close();
  writeResult("r1", result);

  const events = replay("r1");
  assert.equal(events.length, 5);
  assert.deepEqual(events.map((e) => e.seq), [0, 1, 2, 3, 4]);
  assert.equal(events[0].type, "status");
  assert.equal(events[4].type, "result");
  // log alone reconstructs the run: last event is the result
  assert.equal(events.at(-1).data.outcome, "success");
});

test("replay throws for unknown run", () => {
  assert.throws(() => replay("nope"), /not_found/);
});
