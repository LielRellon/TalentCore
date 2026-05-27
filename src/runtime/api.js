// Backend control calls (fetch). Same-origin base path /api/agent is proxied to the
// Phase 1 backend by the Vite dev server. See contracts/backend-consumption.md.

const BASE = "/api/agent";

export class ApiError extends Error {
  constructor(code, status, detail) {
    super(code);
    this.code = code;        // stable string, e.g. run_in_progress
    this.status = status;    // HTTP status
    this.detail = detail;
  }
}

async function parse(res) {
  let body = {};
  try { body = await res.json(); } catch { /* empty body */ }
  if (!res.ok) throw new ApiError(body.error || `http_${res.status}`, res.status, body.detail);
  return body;
}

/** Start a run. body: { personaId, task, limits?, autoApprove? } → { runId, status } */
export async function startRun(body) {
  const res = await fetch(`${BASE}/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parse(res);
}

/** Get run status/result. → { runId, status, result, ... } */
export async function getRun(runId) {
  return parse(await fetch(`${BASE}/runs/${runId}`));
}

/** Decide a pending gated action. → { ok: true } */
export async function decideApproval(runId, callId, approved) {
  const res = await fetch(`${BASE}/runs/${runId}/approvals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callId, approved }),
  });
  return parse(res);
}

/** Same-origin SSE URL for a run's event stream. */
export function eventsUrl(runId) {
  return `${BASE}/runs/${runId}/events`;
}
