// Command-execution isolation via Docker (Principle I / FR-010). Commands run in a
// throwaway container with ONLY the workspace bind-mounted at /workspace and (by
// default) no network. If Docker is unavailable we fail closed — never fall back to
// running on the host.

import { execFile } from "node:child_process";
import { config } from "../config.js";

/** Resolve whether the docker CLI + daemon are usable. */
export function dockerAvailable() {
  return new Promise((resolve) => {
    execFile("docker", ["info"], { timeout: 10000 }, (err) => resolve(!err));
  });
}

/**
 * Run a shell command inside a container scoped to `workspaceRoot`.
 * @param {string} workspaceRoot absolute path bind-mounted at /workspace
 * @param {string} command shell command string
 * @param {object} opts { network: boolean, timeoutMs }
 * @returns {Promise<{ exitCode:number, stdout:string, stderr:string }>}
 */
export async function runInContainer(workspaceRoot, command, opts = {}) {
  const { network = false, timeoutMs = config.commandTimeoutMs } = opts;

  if (!(await dockerAvailable())) {
    const err = new Error("docker_unavailable");
    err.code = "docker_unavailable";
    throw err;
  }

  const args = [
    "run",
    "--rm",
    network ? "--network=bridge" : "--network=none",
    "-v",
    `${workspaceRoot}:/workspace`,
    "-w",
    "/workspace",
    config.dockerImage,
    "sh",
    "-lc",
    command,
  ];

  return new Promise((resolve, reject) => {
    execFile(
      "docker",
      args,
      { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error && error.killed) {
          const e = new Error("command_timeout");
          e.code = "command_timeout";
          return reject(e);
        }
        // A non-zero exit is NOT an error at this layer — the command ran; the agent
        // observes the exit code. execFile sets `error.code` to the exit status.
        const exitCode = error && typeof error.code === "number" ? error.code : 0;
        resolve({ exitCode, stdout: stdout || "", stderr: stderr || "" });
      },
    );
  });
}
