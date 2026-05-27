// Closed tool allow-list (Principle II / FR-004). Exactly four tools. Each entry has a
// JSON Schema for its inputs (used both for Groq tool-calling and dispatch-time
// validation). `getTool` returns undefined for anything not in the list — there is no
// other way for the agent to act.

export const TOOLS = {
  read_file: {
    name: "read_file",
    description:
      "Read a UTF-8 text file inside the workspace. Returns its content.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string", description: "Workspace-relative file path." } },
      required: ["path"],
      additionalProperties: false,
    },
  },
  write_file: {
    name: "write_file",
    description:
      "Create or overwrite a UTF-8 text file inside the workspace. Creates parent directories as needed.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Workspace-relative file path." },
        content: { type: "string", description: "Full file content to write." },
      },
      required: ["path", "content"],
      additionalProperties: false,
    },
  },
  list_dir: {
    name: "list_dir",
    description: "List entries of a directory inside the workspace.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Workspace-relative directory path. Defaults to workspace root.",
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  run_command: {
    name: "run_command",
    description:
      "Run a shell command inside the sandboxed workspace (isolated container, no network by default). Returns exit code, stdout, stderr.",
    inputSchema: {
      type: "object",
      properties: { command: { type: "string", description: "Shell command to execute." } },
      required: ["command"],
      additionalProperties: false,
    },
  },
};

export const TOOL_NAMES = Object.keys(TOOLS);

/** Look up a tool by name. Returns undefined for unknown names. */
export function getTool(name) {
  return Object.prototype.hasOwnProperty.call(TOOLS, name) ? TOOLS[name] : undefined;
}

/** Tool definitions in the shape Groq's chat-completions `tools` field expects. */
export function toolsForLLM() {
  return TOOL_NAMES.map((name) => ({
    type: "function",
    function: {
      name,
      description: TOOLS[name].description,
      parameters: TOOLS[name].inputSchema,
    },
  }));
}
