// Minimal HTTP API over node:http (FR-007, FR-019). Endpoints per contracts/http-api.md:
//   POST /runs                 start a run (409 if one active)
//   GET  /runs/:id             run status + result
//   GET  /runs/:id/events      Server-Sent Events: live stream, or replay if finished
//   POST /runs/:id/approvals   decide a pending gated action
// No auth this phase; the Groq key never appears in any response.

import http from "node:http";
import { config } from "../config.js";
import { startRun, getRun, decideApproval } from "../run/manager.js";
import { replay, runExists, readResult } from "../events/store.js";
import { locateWorktree, listFiles, readFile, WorkspaceUnavailableError, OutsideWorkspaceError } from "../files/workspaceFiles.js";

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { reject(new Error("invalid_json")); }
    });
    req.on("error", reject);
  });
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const parts = url.pathname.split("/").filter(Boolean); // ["runs", ":id", ...]

    try {
      // POST /runs
      if (req.method === "POST" && parts.length === 1 && parts[0] === "runs") {
        const body = await readBody(req);
        if (!body.personaId || !body.task) return send(res, 400, { error: "invalid_request", detail: "personaId and task required" });
        try {
          const { runId } = startRun({
            personaId: body.personaId,
            task: body.task,
            limits: body.limits || {},
            preauth: { autoApprove: body.autoApprove === true },
            model: body.model, // "auto" | model id; validated in resolveModelChoice
          });
          return send(res, 201, { runId, status: "running" });
        } catch (e) {
          if (e.code === "run_in_progress") return send(res, 409, { error: "run_in_progress" });
          if (e.code === "unknown_persona") return send(res, 400, { error: "invalid_request", detail: "unknown persona" });
          throw e;
        }
      }

      // GET /runs/:id
      if (req.method === "GET" && parts.length === 2 && parts[0] === "runs") {
        const runId = parts[1];
        const run = getRun(runId);
        if (run) {
          return send(res, 200, {
            runId, status: run.status, result: run.result,
            limits: run.limits, createdAt: run.createdAt, endedAt: run.endedAt,
          });
        }
        if (runExists(runId)) {
          return send(res, 200, { runId, status: "completed", result: readResult(runId) });
        }
        return send(res, 404, { error: "not_found" });
      }

      // GET /runs/:id/files  — list workspace files (confined)
      if (req.method === "GET" && parts.length === 3 && parts[0] === "runs" && parts[2] === "files") {
        try {
          const root = locateWorktree(parts[1]);
          return send(res, 200, { files: listFiles(root) });
        } catch (e) {
          if (e instanceof WorkspaceUnavailableError) return send(res, 404, { error: "workspace_unavailable" });
          throw e;
        }
      }

      // GET /runs/:id/files/content?path=...  — read one file (confined)
      if (req.method === "GET" && parts.length === 4 && parts[0] === "runs" && parts[2] === "files" && parts[3] === "content") {
        const rel = url.searchParams.get("path") || "";
        try {
          const root = locateWorktree(parts[1]);
          return send(res, 200, readFile(root, rel));
        } catch (e) {
          if (e instanceof OutsideWorkspaceError) return send(res, 403, { error: "outside_workspace" });
          if (e instanceof WorkspaceUnavailableError) return send(res, 404, { error: "workspace_unavailable" });
          if (e.code === "ENOENT") return send(res, 404, { error: "not_found" });
          throw e;
        }
      }

      // GET /runs/:id/events  (SSE)
      if (req.method === "GET" && parts.length === 3 && parts[0] === "runs" && parts[2] === "events") {
        const runId = parts[1];
        return streamEvents(req, res, runId);
      }

      // POST /runs/:id/approvals
      if (req.method === "POST" && parts.length === 3 && parts[0] === "runs" && parts[2] === "approvals") {
        const runId = parts[1];
        const body = await readBody(req);
        const r = decideApproval(runId, body.callId, body.approved === true);
        if (r.ok) return send(res, 200, { ok: true });
        if (r.error === "run_not_awaiting_approval") return send(res, 409, { error: r.error });
        return send(res, 404, { error: "not_found" });
      }

      return send(res, 404, { error: "not_found" });
    } catch (e) {
      return send(res, 500, { error: "internal_error", detail: e.message });
    }
  });
}

function streamEvents(req, res, runId) {
  const run = getRun(runId);
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const lastId = Number(req.headers["last-event-id"] || -1);
  const write = (event) => {
    if (event.seq <= lastId) return;
    res.write(`id: ${event.seq}\n`);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  if (run && !isTerminal(run.status)) {
    // Live: replay any persisted-so-far events, then subscribe.
    if (runExists(runId)) { try { replay(runId).forEach(write); } catch { /* none yet */ } }
    const unsub = run.bus.subscribe((event) => {
      write(event);
      if (event.type === "result") { unsub(); res.end(); }
    });
    req.on("close", unsub);
    return;
  }

  // Finished (or unknown live): replay the stored log then close.
  if (runExists(runId)) {
    try { replay(runId).forEach(write); } catch { /* ignore */ }
    return res.end();
  }
  res.writeHead(404);
  res.end();
}

function isTerminal(status) {
  return status === "completed" || status === "failed" || status === "halted";
}

// Run directly: `node server/src/http/server.js`
if (import.meta.url === `file://${process.argv[1]}`) {
  createServer().listen(config.httpPort, () => {
    console.log(`agent runtime HTTP server on :${config.httpPort}`);
  });
}
