// Workspace isolation via git worktree (Principle I / FR-008). Each run gets its own
// checkout on its own branch under .worktrees/<runId>. All file/command activity is
// confined to this root.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { config, REPO_ROOT } from "../config.js";

function git(args, cwd = REPO_ROOT) {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

/**
 * Create an isolated git worktree for a run.
 * @returns {{ root: string, branch: string }}
 */
export function createWorkspace(runId) {
  fs.mkdirSync(config.worktreesDir, { recursive: true });
  const root = path.join(config.worktreesDir, runId);
  const branch = `run/${runId}`;
  if (fs.existsSync(root)) {
    throw new Error(`workspace_exists: ${root}`);
  }
  // Branch off the current HEAD into a fresh worktree.
  git(["worktree", "add", "-b", branch, root, "HEAD"]);
  return { root: fs.realpathSync(root), branch };
}

/** Remove a run's worktree and its branch. Best-effort; ignores already-gone state. */
export function removeWorkspace(runId) {
  const root = path.join(config.worktreesDir, runId);
  const branch = `run/${runId}`;
  try {
    git(["worktree", "remove", "--force", root]);
  } catch {
    // worktree may already be gone
  }
  try {
    git(["branch", "-D", branch]);
  } catch {
    // branch may already be gone
  }
}
