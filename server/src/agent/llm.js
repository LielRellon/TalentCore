// Groq adapter for tool-calling (FR-005). Thin wrapper over the chat-completions REST
// endpoint via fetch — no SDK dependency. The API key is read from config and is never
// logged or returned (FR-014). Injectable: tests pass a stub `complete` instead.

import { config } from "../config.js";
import { toolsForLLM } from "../tools/registry.js";

/** Resolve a user model choice into a usable id and whether auto-fallback is allowed. */
export function resolveModelChoice(choice) {
  const c = config.allowedModelChoices.includes(choice) ? choice : config.defaultModelChoice;
  if (c === "auto") return { model: config.model, autoFallback: true };
  return { model: c, autoFallback: false };
}

/**
 * Create an LLM client. `modelChoice` is one of config.allowedModelChoices.
 * In "auto", a 429 rate-limit transparently switches the run to the fast model.
 * @returns {{ complete(messages) => Promise<{ message, usage }>, currentModel: () => string }}
 */
export function createGroqLLM({ apiKey = config.groqApiKey, modelChoice = config.defaultModelChoice, fetchImpl = fetch } = {}) {
  const resolved = resolveModelChoice(modelChoice);
  let model = resolved.model;
  let canFallback = resolved.autoFallback;

  return {
    currentModel: () => model,
    async complete(messages) {
      if (!apiKey) {
        const e = new Error("missing_api_key");
        e.code = "missing_api_key";
        throw e;
      }
      // Retry transient malformed-tool-call 400 + 5xx. For "auto", a 429 switches to the
      // fast model once and retries (balances quality with staying under rate limits).
      const maxAttempts = 5;
      for (let attempt = 1; ; attempt++) {
        const res = await fetchImpl(`${config.groqBaseUrl}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model, messages, tools: toolsForLLM(), tool_choice: "auto", max_tokens: 1024 }),
        });
        if (res.ok) {
          const data = await res.json();
          const choice = data.choices?.[0];
          return { message: choice?.message ?? { role: "assistant", content: "" }, usage: data.usage ?? { total_tokens: 0 } };
        }
        const text = await res.text().catch(() => "");

        // auto: on rate-limit, downgrade to the fast model and retry.
        if (res.status === 429 && canFallback && model !== config.fastModel) {
          model = config.fastModel;
          canFallback = false; // only switch once
          continue;
        }

        const retryable = (res.status === 400 && text.includes("tool_use_failed")) || res.status >= 500;
        if (retryable && attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 400 * attempt));
          continue;
        }
        const e = new Error(`groq_error_${res.status}`); // never include the API key
        e.code = "groq_error";
        e.detail = text.slice(0, 300);
        throw e;
      }
    },
  };
}
