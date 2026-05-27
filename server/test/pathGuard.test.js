// T023: path confinement (FR-009, SC-003).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveInWorkspace, OutsideWorkspaceError } from "../src/safety/pathGuard.js";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "ws-"));
fs.mkdirSync(path.join(root, "sub"), { recursive: true });
fs.writeFileSync(path.join(root, "ok.txt"), "hi");

test("allows in-workspace relative path", () => {
  const abs = resolveInWorkspace(root, "sub/file.js");
  assert.ok(abs.startsWith(fs.realpathSync(root)));
});

test("rejects parent-escape via ..", () => {
  assert.throws(() => resolveInWorkspace(root, "../escape.txt"), OutsideWorkspaceError);
  assert.throws(() => resolveInWorkspace(root, "sub/../../escape.txt"), OutsideWorkspaceError);
});

test("re-anchors absolute path under root (no escape)", () => {
  const abs = resolveInWorkspace(root, "/etc/passwd");
  assert.ok(abs.startsWith(fs.realpathSync(root)));
  assert.ok(abs.endsWith(path.join("etc", "passwd")));
});

test("rejects symlink escape", () => {
  const link = path.join(root, "link");
  try { fs.symlinkSync("/etc", link); } catch { return; } // skip if symlink not permitted
  assert.throws(() => resolveInWorkspace(root, "link/passwd"), OutsideWorkspaceError);
});
