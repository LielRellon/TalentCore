// Path confinement (Principle I / FR-009, SC-003). Every file path an agent touches
// must resolve to a location strictly inside the run's workspace root. We resolve the
// path, then resolve symlinks of the deepest existing ancestor, and verify the real
// result is contained. Anything outside throws `outside_workspace`.

import fs from "node:fs";
import path from "node:path";

export class OutsideWorkspaceError extends Error {
  constructor(requested) {
    super("outside_workspace");
    this.code = "outside_workspace";
    this.requested = requested;
  }
}

/** True if `child` is the same as or nested under `root`. */
function isContained(root, child) {
  const rel = path.relative(root, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * Resolve `requested` (absolute or relative) against the workspace `root` and return
 * the absolute, symlink-safe path, guaranteed to be inside `root`.
 * Throws OutsideWorkspaceError otherwise.
 */
export function resolveInWorkspace(root, requested) {
  const realRoot = fs.realpathSync(root);
  // Treat the requested path as relative to the workspace root. An absolute path is
  // re-anchored under the root rather than trusted, so "/etc/passwd" cannot escape.
  const candidate = path.resolve(realRoot, "." + path.sep + requested.replace(/^[/\\]+/, ""));

  if (!isContained(realRoot, candidate)) {
    throw new OutsideWorkspaceError(requested);
  }

  // Resolve symlinks on the deepest existing ancestor to defeat symlink escapes.
  let existing = candidate;
  while (!fs.existsSync(existing) && existing !== realRoot) {
    existing = path.dirname(existing);
  }
  const realExisting = fs.realpathSync(existing);
  if (!isContained(realRoot, realExisting)) {
    throw new OutsideWorkspaceError(requested);
  }

  return candidate;
}
