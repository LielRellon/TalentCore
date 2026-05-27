// run_command tool. Executes inside the Docker sandbox bound to the workspace. A
// non-zero exit is still ok:true at the tool level (the command ran); the agent reads
// the exit code/stderr. Network is granted only when the gate explicitly approved it.
import { runInContainer } from "../sandbox/docker.js";

export async function runCommand(args, ctx) {
  try {
    const result = await runInContainer(ctx.workspaceRoot, args.command, {
      network: ctx.allowNetwork === true,
    });
    return { ok: true, output: result };
  } catch (e) {
    // docker_unavailable / command_timeout surface as tool errors (the command did not run).
    return { ok: false, error: e.code || e.message };
  }
}
