// Workspace-confined file reads for the UI (Phase 3). Reuses the agent's path guard so
// UI-initiated reads honor Sandbox-First Safety (Principle I): every path resolves inside
// the run's worktree or is refused. Read-only — no writes here.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { config } from "../config.js";
import { resolveInWorkspace, OutsideWorkspaceError } from "../safety/pathGuard.js";
import { getRun } from "../run/manager.js";

export class WorkspaceUnavailableError extends Error {
  constructor(runId) { super("workspace_unavailable"); this.code = "workspace_unavailable"; this.runId = runId; }
}

/**
 * Resolve a run's worktree root. Active run → its live workspacePath; otherwise the
 * retained worktree at worktreesDir/<runId>. Throws if neither exists.
 */
export function locateWorktree(runId) {
  const active = getRun(runId);
  if (active && active.workspacePath && fs.existsSync(active.workspacePath)) {
    return fs.realpathSync(active.workspacePath);
  }
  const dir = path.join(config.worktreesDir, runId);
  if (fs.existsSync(dir)) return fs.realpathSync(dir);
  throw new WorkspaceUnavailableError(runId);
}

/**
 * List the files the agent CHANGED in the worktree — not the whole repo checkout.
 * The worktree is a full-repo branch off HEAD, so we use `git status` to surface only
 * created/modified/untracked paths (renames → new path). Falls back to a recursive walk
 * if the directory is not a git repo (e.g. unit-test temp dirs).
 */
export function listFiles(root) {
  try {
    const out = execFileSync(
      "git",
      ["-C", root, "status", "--porcelain", "--untracked-files=all"],
      { encoding: "utf8" },
    );
    const files = [];
    for (const line of out.split("\n")) {
      if (!line.trim()) continue;
      let p = line.slice(3).trim(); // strip 2-char status + space
      if (p.includes(" -> ")) p = p.split(" -> ")[1]; // rename: take new path
      p = p.replace(/^"|"$/g, ""); // unquote paths with special chars
      if (p && p !== ".git" && !p.startsWith(".git/")) files.push({ path: p, type: "file" });
    }
    return files.sort((a, b) => a.path.localeCompare(b.path));
  } catch {
    return walkAll(root);
  }
}

/** Fallback: recursively list everything under root (skip .git). */
function walkAll(root) {
  const out = [];
  const walk = (abs, rel) => {
    for (const d of fs.readdirSync(abs, { withFileTypes: true })) {
      if (d.name === ".git") continue;
      const childRel = rel ? `${rel}/${d.name}` : d.name;
      if (d.isDirectory()) { out.push({ path: childRel, type: "dir" }); walk(path.join(abs, d.name), childRel); }
      else out.push({ path: childRel, type: "file" });
    }
  };
  walk(root, "");
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** Looks like binary if it contains a NUL byte in the sampled head. */
function looksBinary(buf) {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

/**
 * Read one file inside the workspace. Returns a discriminated result; never raw bytes
 * for binary/oversized files. Throws OutsideWorkspaceError for path escapes.
 */
export function readFile(root, relPath) {
  const abs = resolveInWorkspace(root, relPath); // throws OutsideWorkspaceError on escape
  const stat = fs.statSync(abs); // throws ENOENT if missing
  if (stat.isDirectory()) return { path: relPath, kind: "binary" }; // not displayable as text
  if (stat.size > config.maxReadBytes) return { path: relPath, kind: "too_large", size: stat.size };
  const buf = fs.readFileSync(abs);
  if (looksBinary(buf)) return { path: relPath, kind: "binary" };
  return { path: relPath, kind: "text", content: buf.toString("utf8") };
}

export { OutsideWorkspaceError };
