// Human-in-the-loop gates (Principle III / FR-011..013). Classifies a proposed tool
// action as: "allow" (proceed), "gate" (needs approval unless pre-authorized), or
// "refuse" (outright forbidden — destructive/outside-workspace, no approval possible).

// Command patterns that reach beyond the sandbox or are irreversible → gated.
const GATE_PATTERNS = [
  { kind: "git_push", re: /\bgit\s+push\b/ },
  { kind: "package_install", re: /\b(npm|pnpm|yarn)\s+(install|add|i)\b/ },
  { kind: "package_install", re: /\bpip\s+install\b/ },
  { kind: "package_install", re: /\bapt(-get)?\s+install\b/ },
  { kind: "network", re: /\b(curl|wget|nc|ssh|scp|ping)\b/ },
  { kind: "delete", re: /\b(rm|rmdir|unlink)\b/ },
];

// Destructive commands clearly aimed outside the workspace → refused outright.
const REFUSE_PATTERNS = [
  /\brm\s+-rf?\s+\//, // rm -rf / ... (absolute root)
  /\bgit\s+push\s+.*--force\b/, // force push
  /\bgit\s+push\s+.*-f\b/,
];

/**
 * Classify a tool action.
 * @param {string} name tool name
 * @param {object} args tool args
 * @returns {{ decision: "allow"|"gate"|"refuse", kind?: string, action?: string, network?: boolean }}
 */
export function classify(name, args) {
  if (name !== "run_command") {
    // read/write/list are confined by pathGuard; not gated here.
    return { decision: "allow" };
  }
  const cmd = String(args.command || "");

  for (const re of REFUSE_PATTERNS) {
    if (re.test(cmd)) {
      return { decision: "refuse", kind: "destructive", action: `run_command: ${cmd}` };
    }
  }
  for (const { kind, re } of GATE_PATTERNS) {
    if (re.test(cmd)) {
      return {
        decision: "gate",
        kind,
        action: `run_command: ${cmd}`,
        network: kind === "network",
      };
    }
  }
  return { decision: "allow" };
}

/**
 * Resolve a gated action against pre-authorization config.
 * @param {object} cls classify() result
 * @param {object} preauth { autoApprove?: boolean, kinds?: string[] }
 * @returns {boolean} true if pre-authorized (skip the prompt)
 */
export function isPreAuthorized(cls, preauth = {}) {
  if (preauth.autoApprove === true) return true;
  if (Array.isArray(preauth.kinds) && preauth.kinds.includes(cls.kind)) return true;
  return false;
}
