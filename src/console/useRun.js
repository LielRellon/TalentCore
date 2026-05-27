// useRun — owns one run's client state. A pure reducer (exported for tests) accumulates
// events with seq-dedupe and derives status / pending approval / result; the hook wires
// the backend api + SSE stream to it. See data-model.md.

import { useCallback, useReducer, useRef } from "react";
import { startRun as apiStartRun, getRun, decideApproval, listFiles } from "../runtime/api.js";
import { subscribeRun } from "../runtime/stream.js";

export const initialState = {
  runId: null,
  status: "idle",          // idle|running|awaiting-approval|completed|failed|halted
  connection: "closed",    // connecting|open|reconnecting|closed
  events: [],
  lastSeq: -1,
  pendingApproval: null,
  result: null,
  error: null,
  activeRunConflict: null, // set when the backend reports a run already in progress
  files: {},               // path -> { path, lastWriteContent?, touchedAt }
  currentlyWriting: null,  // path of the most recent write_file (drives auto-select)
};

const TERMINAL = new Set(["completed", "failed", "halted"]);

export function reducer(state, action) {
  switch (action.type) {
    case "START_PENDING":
      return { ...initialState, runId: action.runId, status: "running", connection: "connecting" };

    case "START_FAILED":
      return { ...state, status: "idle", error: action.error, activeRunConflict: action.conflict || null };

    case "OPEN_RUN":
      return { ...initialState, runId: action.runId, status: "running", connection: "connecting" };

    case "CONNECTION":
      return { ...state, connection: action.connection };

    case "EVENT": {
      const e = action.event;
      if (typeof e.seq === "number" && e.seq <= state.lastSeq) return state; // dedupe on resume
      const next = {
        ...state,
        events: [...state.events, e],
        lastSeq: typeof e.seq === "number" ? e.seq : state.lastSeq,
      };
      switch (e.type) {
        case "tool_call":
          // Derive the live file list + the file being written from write_file calls.
          if (e.data.name === "write_file" && e.data.args?.path) {
            const p = e.data.args.path;
            next.files = {
              ...state.files,
              [p]: { path: p, lastWriteContent: e.data.args.content ?? "", touchedAt: e.seq },
            };
            next.currentlyWriting = p;
          }
          break;
        case "status":
          next.status = e.data.status;
          break;
        case "approval_request":
          next.pendingApproval = { callId: e.data.callId, action: e.data.action, reason: e.data.reason };
          break;
        case "approval_decision":
          next.pendingApproval = null;
          break;
        case "result":
          next.result = e.data;
          if (!TERMINAL.has(next.status)) {
            next.status = e.data.outcome === "success" ? "completed" : e.data.outcome === "halted" ? "halted" : "failed";
          }
          break;
        default:
          break;
      }
      return next;
    }

    case "MERGE_FILES": {
      // Merge a backend file listing into files (without clobbering live write content).
      const merged = { ...state.files };
      for (const f of action.files) {
        if (f.type !== "file") continue;
        if (!merged[f.path]) merged[f.path] = { path: f.path, touchedAt: 0 };
      }
      return { ...state, files: merged };
    }

    case "APPROVAL_SENT":
      // Optimistically clear the prompt; the backend's approval_decision event confirms.
      return { ...state, pendingApproval: null };

    case "RESET":
      return initialState;

    default:
      return state;
  }
}

export function useRun() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const subRef = useRef(null);

  const closeStream = useCallback(() => {
    subRef.current?.close();
    subRef.current = null;
  }, []);

  const subscribe = useCallback((runId) => {
    closeStream();
    subRef.current = subscribeRun(runId, {
      onEvent: (event) => {
        dispatch({ type: "EVENT", event });
        // A terminal run's stream is finished — close it so EventSource doesn't
        // keep reconnecting (which would otherwise show a stuck "reconnecting…").
        if (event.type === "result") {
          closeStream();
          dispatch({ type: "CONNECTION", connection: "closed" });
        }
      },
      onConnection: (connection) => dispatch({ type: "CONNECTION", connection }),
    });
  }, [closeStream]);

  const startRun = useCallback(async (input) => {
    try {
      const { runId } = await apiStartRun(input);
      dispatch({ type: "START_PENDING", runId });
      subscribe(runId);
      return runId;
    } catch (err) {
      dispatch({
        type: "START_FAILED",
        error: err.code === "run_in_progress" ? "A run is already in progress." : (err.detail || err.code || "Failed to start run."),
        conflict: err.code === "run_in_progress" ? true : null,
      });
      return null;
    }
  }, [subscribe]);

  const openRun = useCallback((runId) => {
    dispatch({ type: "OPEN_RUN", runId });
    subscribe(runId); // backend replays a finished run then closes; live runs continue
    // Populate the explorer from the worktree (covers files made by run_command and reopens).
    listFiles(runId).then((r) => dispatch({ type: "MERGE_FILES", files: r.files || [] })).catch(() => {});
  }, [subscribe]);

  const approve = useCallback(async () => {
    if (!state.pendingApproval) return;
    const { callId } = state.pendingApproval;
    dispatch({ type: "APPROVAL_SENT" });
    try { await decideApproval(state.runId, callId, true); } catch { /* surfaced via stream */ }
  }, [state.pendingApproval, state.runId]);

  const reject = useCallback(async () => {
    if (!state.pendingApproval) return;
    const { callId } = state.pendingApproval;
    dispatch({ type: "APPROVAL_SENT" });
    try { await decideApproval(state.runId, callId, false); } catch { /* surfaced via stream */ }
  }, [state.pendingApproval, state.runId]);

  const reset = useCallback(() => {
    closeStream();
    dispatch({ type: "RESET" });
  }, [closeStream]);

  const refreshFiles = useCallback((runId) => {
    listFiles(runId).then((r) => dispatch({ type: "MERGE_FILES", files: r.files || [] })).catch(() => {});
  }, []);

  return { state, startRun, openRun, approve, reject, reset, refreshFiles, getRun };
}
