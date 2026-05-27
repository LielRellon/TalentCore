// read_file tool. Confined by pathGuard; capped size. Pure read, no gating.
import fs from "node:fs";
import { resolveInWorkspace, OutsideWorkspaceError } from "../safety/pathGuard.js";
import { config } from "../config.js";

export async function readFile(args, ctx) {
  try {
    const abs = resolveInWorkspace(ctx.workspaceRoot, args.path);
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) return { ok: false, error: "is_directory" };
    if (stat.size > config.maxReadBytes) return { ok: false, error: "too_large" };
    const content = fs.readFileSync(abs, "utf8");
    return { ok: true, output: { path: args.path, content } };
  } catch (e) {
    if (e instanceof OutsideWorkspaceError) return { ok: false, error: "outside_workspace" };
    if (e.code === "ENOENT") return { ok: false, error: "not_found" };
    return { ok: false, error: e.message };
  }
}
