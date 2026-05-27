// T038: end-to-end integration (opt-in). Exercises the REAL stack — git worktree,
// Docker sandbox, and the Groq API — driving the email-validation task to completion.
// Skipped unless RUN_INTEGRATION=1 (needs Docker running + GROQ_API_KEY set).
import { test } from "node:test";
import assert from "node:assert/strict";

const ENABLED = process.env.RUN_INTEGRATION === "1";

test("autonomous run creates a working email validator + test", { skip: !ENABLED }, async () => {
  const { startRun, removeWorkspace } = await import("../src/run/manager.js");
  const { runId, done } = startRun({
    personaId: "sfe",
    task:
      "Create src/email.js exporting isValidEmail(s) and a node:test in test/email.test.js. " +
      "Run the test with `node --test` and ensure it passes.",
    preauth: { autoApprove: false },
  });
  const result = await done;
  try {
    assert.equal(result.outcome, "success", result.reason);
    assert.ok(result.filesChanged.some((f) => f.includes("email")));
  } finally {
    removeWorkspace(runId);
  }
});
