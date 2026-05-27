// T024: gate classification (FR-011/013).
import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, isPreAuthorized } from "../src/safety/gates.js";

test("benign commands are allowed", () => {
  assert.equal(classify("run_command", { command: "node --test" }).decision, "allow");
  assert.equal(classify("run_command", { command: "ls -la && cat x.js" }).decision, "allow");
});

test("file tools are never gated here", () => {
  assert.equal(classify("write_file", { path: "a", content: "b" }).decision, "allow");
  assert.equal(classify("read_file", { path: "a" }).decision, "allow");
});

test("gated: push, installs, network, delete", () => {
  assert.equal(classify("run_command", { command: "git push origin main" }).kind, "git_push");
  assert.equal(classify("run_command", { command: "npm install left-pad" }).kind, "package_install");
  assert.equal(classify("run_command", { command: "pip install requests" }).kind, "package_install");
  assert.equal(classify("run_command", { command: "curl https://x.com" }).kind, "network");
  assert.equal(classify("run_command", { command: "rm file.txt" }).kind, "delete");
  for (const c of ["git push origin main", "npm install x", "curl x", "rm f"]) {
    assert.equal(classify("run_command", { command: c }).decision, "gate");
  }
});

test("refused outright: rm -rf / and force push", () => {
  assert.equal(classify("run_command", { command: "rm -rf /" }).decision, "refuse");
  assert.equal(classify("run_command", { command: "git push --force origin main" }).decision, "refuse");
});

test("pre-authorization", () => {
  const cls = classify("run_command", { command: "npm install x" });
  assert.equal(isPreAuthorized(cls, { autoApprove: true }), true);
  assert.equal(isPreAuthorized(cls, { kinds: ["package_install"] }), true);
  assert.equal(isPreAuthorized(cls, {}), false);
});
