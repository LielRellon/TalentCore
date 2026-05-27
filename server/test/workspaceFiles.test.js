// T014: workspace file reads are confined (constitution Principle I, SC-004).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const { listFiles, readFile, OutsideWorkspaceError } = await import("../src/files/workspaceFiles.js");

function makeWorkspace() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "wsf-")));
  fs.mkdirSync(path.join(root, "src"));
  fs.mkdirSync(path.join(root, ".git"));
  fs.writeFileSync(path.join(root, "src", "a.js"), "export const a = 1;");
  fs.writeFileSync(path.join(root, "readme.md"), "# hi");
  fs.writeFileSync(path.join(root, ".git", "config"), "secret-ish");
  return root;
}

test("listFiles returns workspace files and excludes .git", () => {
  const root = makeWorkspace();
  const paths = listFiles(root).map((f) => f.path);
  assert.ok(paths.includes("src/a.js"));
  assert.ok(paths.includes("readme.md"));
  assert.ok(!paths.some((p) => p.startsWith(".git")));
});

test("readFile reads a text file inside the workspace", () => {
  const root = makeWorkspace();
  const r = readFile(root, "src/a.js");
  assert.equal(r.kind, "text");
  assert.equal(r.content, "export const a = 1;");
});

test("readFile refuses path escapes", () => {
  const root = makeWorkspace();
  assert.throws(() => readFile(root, "../../etc/passwd"), OutsideWorkspaceError);
  assert.throws(() => readFile(root, "src/../../escape"), OutsideWorkspaceError);
});

test("readFile re-anchors absolute paths inside the workspace (no escape)", () => {
  const root = makeWorkspace();
  // absolute path is re-anchored under root → resolves to a missing in-workspace file
  assert.throws(() => readFile(root, "/etc/passwd"), (e) => e.code === "ENOENT");
});

test("readFile flags binary files instead of dumping bytes", () => {
  const root = makeWorkspace();
  fs.writeFileSync(path.join(root, "bin"), Buffer.from([0x00, 0x01, 0x02, 0x00]));
  const r = readFile(root, "bin");
  assert.equal(r.kind, "binary");
  assert.equal(r.content, undefined);
});
