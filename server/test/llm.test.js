// Model-choice resolution + auto 429 fallback.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveModelChoice, createGroqLLM } from "../src/agent/llm.js";
import { config } from "../src/config.js";

test("resolveModelChoice: auto enables fallback on the quality model", () => {
  const r = resolveModelChoice("auto");
  assert.equal(r.model, config.model);
  assert.equal(r.autoFallback, true);
});

test("resolveModelChoice: pinned model, no fallback", () => {
  const r = resolveModelChoice("llama-3.1-8b-instant");
  assert.equal(r.model, "llama-3.1-8b-instant");
  assert.equal(r.autoFallback, false);
});

test("resolveModelChoice: unknown choice falls back to default", () => {
  const r = resolveModelChoice("totally-made-up");
  assert.equal(r.model, resolveModelChoice(config.defaultModelChoice).model);
});

test("auto: a 429 switches to the fast model and retries", async () => {
  let calls = 0;
  const seenModels = [];
  const fakeFetch = async (_url, opts) => {
    calls++;
    seenModels.push(JSON.parse(opts.body).model);
    if (calls === 1) return { ok: false, status: 429, text: async () => "rate limit" };
    return { ok: true, json: async () => ({ choices: [{ message: { role: "assistant", content: "ok" } }], usage: { total_tokens: 1 } }) };
  };
  const llm = createGroqLLM({ apiKey: "k", modelChoice: "auto", fetchImpl: fakeFetch });
  const r = await llm.complete([{ role: "user", content: "hi" }]);
  assert.equal(r.message.content, "ok");
  assert.equal(seenModels[0], config.model);       // first try: quality model
  assert.equal(seenModels[1], config.fastModel);   // after 429: fast model
  assert.equal(llm.currentModel(), config.fastModel);
});

test("pinned model does NOT fall back on 429", async () => {
  const fakeFetch = async () => ({ ok: false, status: 429, text: async () => "rate limit" });
  const llm = createGroqLLM({ apiKey: "k", modelChoice: "llama-3.3-70b-versatile", fetchImpl: fakeFetch });
  await assert.rejects(() => llm.complete([{ role: "user", content: "hi" }]), /groq_error_429/);
});
