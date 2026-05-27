// write_file tool. Confined by pathGuard; creates parent dirs. Counts toward the
// per-run file-touch limit (enforced in dispatch). Returns whether the file was newly
// created and how many bytes were written.
import fs from "node:fs";
import path from "node:path";
import { resolveInWorkspace, OutsideWorkspaceError } from "../safety/pathGuard.js";

export async function writeFile(args, ctx) {
  try {
    const abs = resolveInWorkspace(ctx.workspaceRoot, args.path);
    if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
      return { ok: false, error: "is_directory" };
    }
    const created = !fs.existsSync(abs);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const buf = Buffer.from(args.content ?? "", "utf8");
    fs.writeFileSync(abs, buf);
    return { ok: true, output: { path: args.path, bytesWritten: buf.length, created } };
  } catch (e) {
    if (e instanceof OutsideWorkspaceError) return { ok: false, error: "outside_workspace" };
    return { ok: false, error: e.message };
  }
}
