// Central configuration. Reads env with safe defaults. Never logs secrets.
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// repo root is three levels up from server/src/
export const REPO_ROOT = path.resolve(__dirname, "..", "..");

export const config = {
  // --- LLM (Groq) ---
  groqApiKey: process.env.GROQ_API_KEY || "",
  groqBaseUrl: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
  model: process.env.AGENT_MODEL || "llama-3.3-70b-versatile",

  // --- Storage locations ---
  runsDir: process.env.RUNS_DIR || path.join(REPO_ROOT, "runs"),
  worktreesDir: process.env.WORKTREES_DIR || path.join(REPO_ROOT, ".worktrees"),

  // --- Sandbox (Docker) ---
  dockerImage: process.env.AGENT_DOCKER_IMAGE || "node:20-alpine",
  commandTimeoutMs: Number(process.env.AGENT_COMMAND_TIMEOUT_MS || 120000),

  // --- Default bounded-autonomy limits (overridable per run) ---
  defaultLimits: {
    maxIterations: Number(process.env.AGENT_MAX_ITERATIONS || 25),
    maxTokens: Number(process.env.AGENT_MAX_TOKENS || 100000),
    maxWallClockMs: Number(process.env.AGENT_MAX_WALLCLOCK_MS || 300000),
    maxFilesTouched: Number(process.env.AGENT_MAX_FILES || 25),
  },

  // --- HTTP ---
  httpPort: Number(process.env.AGENT_HTTP_PORT || 8787),

  // Safety cap for read_file (bytes)
  maxReadBytes: Number(process.env.AGENT_MAX_READ_BYTES || 1_000_000),
};
