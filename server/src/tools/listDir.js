// list_dir tool. Confined by pathGuard. Path defaults to workspace root.
import fs from "node:fs";
import { resolveInWorkspace, OutsideWorkspaceError } from "../safety/pathGuard.js";

export async function listDir(args, ctx) {
  const requested = args.path && args.path.length ? args.path : ".";
  try {
    const abs = resolveInWorkspace(ctx.workspaceRoot, requested);
    const stat = fs.statSync(abs);
    if (!stat.isDirectory()) return { ok: false, error: "not_a_directory" };
    const entries = fs.readdirSync(abs, { withFileTypes: true }).map((d) => ({
      name: d.name,
      type: d.isDirectory() ? "dir" : "file",
    }));
    return { ok: true, output: { path: requested, entries } };
  } catch (e) {
    if (e instanceof OutsideWorkspaceError) return { ok: false, error: "outside_workspace" };
    if (e.code === "ENOENT") return { ok: false, error: "not_found" };
    return { ok: false, error: e.message };
  }
}
