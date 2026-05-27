// Groq adapter for tool-calling (FR-005). Thin wrapper over the chat-completions REST
// endpoint via fetch — no SDK dependency. The API key is read from config and is never
// logged or returned (FR-014). Injectable: tests pass a stub `complete` instead.

import { config } from "../config.js";
import { toolsForLLM } from "../tools/registry.js";

/**
 * Create an LLM client. Default talks to Groq; override `fetchImpl` in tests.
 * @returns {{ complete(messages) => Promise<{ message, usage }> }}
 */
export function createGroqLLM({ apiKey = config.groqApiKey, model = config.model, fetchImpl = fetch } = {}) {
  return {
    async complete(messages) {
      if (!apiKey) {
        const e = new Error("missing_api_key");
        e.code = "missing_api_key";
        throw e;
      }
      // Groq's llama models occasionally emit a malformed tool call and the API
      // rejects the whole response with 400 `tool_use_failed`. This is transient —
      // a retry almost always yields a clean call. Retry such 400s a few times.
      const maxAttempts = 4;
      for (let attempt = 1; ; attempt++) {
        const res = await fetchImpl(`${config.groqBaseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages,
            tools: toolsForLLM(),
            tool_choice: "auto",
            max_tokens: 1024,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const choice = data.choices?.[0];
          return {
            message: choice?.message ?? { role: "assistant", content: "" },
            usage: data.usage ?? { total_tokens: 0 },
          };
        }
        const text = await res.text().catch(() => "");
        // Retry the transient malformed-tool-call 400 and 5xx. Do NOT retry 429:
        // a per-minute token cap won't clear in a few seconds, so surface it fast.
        const retryable =
          (res.status === 400 && text.includes("tool_use_failed")) ||
          res.status >= 500;
        if (retryable && attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 400 * attempt));
          continue;
        }
        // Never include the Authorization header / key in the surfaced error.
        const e = new Error(`groq_error_${res.status}`);
        e.code = "groq_error";
        e.detail = text.slice(0, 300);
        throw e;
      }
    },
  };
}
