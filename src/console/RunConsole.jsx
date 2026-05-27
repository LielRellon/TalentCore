// Run Console container. Idle → StartRunForm; active/finished → status + timeline +
// approval + result. Handles the single-run conflict (409), open-by-id replay, and
// surfaced errors. All backend access goes through useRun.
import { useEffect, useState } from "react";
import { useRun } from "./useRun.js";
import StartRunForm from "./StartRunForm.jsx";
import RunStatusBar from "./RunStatusBar.jsx";
import RunTimeline from "./RunTimeline.jsx";
import ApprovalPrompt from "./ApprovalPrompt.jsx";
import ResultPanel from "./ResultPanel.jsx";
import "./console.css";

const LAST_RUN_KEY = "talentcore:lastRunId";

export default function RunConsole() {
  const { state, startRun, openRun, approve, reject, reset } = useRun();
  const [openId, setOpenId] = useState("");

  // Remember the most recent run id for convenient reopen after reload.
  useEffect(() => {
    if (state.runId && state.status !== "idle") {
      try { localStorage.setItem(LAST_RUN_KEY, state.runId); } catch { /* ignore */ }
    }
  }, [state.runId, state.status]);

  const onStart = async (input) => {
    await startRun(input);
  };

  const lastRun = (() => { try { return localStorage.getItem(LAST_RUN_KEY); } catch { return null; } })();
  const isIdle = state.status === "idle";

  return (
    <div className="run-console">
      {isIdle ? (
        <div className="console-start">
          <StartRunForm onStart={onStart} disabled={false} />

          {state.error && (
            <div className="console-error">
              {state.error}
              {state.activeRunConflict && lastRun && (
                <button className="link-btn" onClick={() => openRun(lastRun)}>
                  View the active run ({lastRun})
                </button>
              )}
            </div>
          )}

          <div className="open-run">
            <label className="field">
              <span>Open a previous run by id</span>
              <div className="open-run-row">
                <input value={openId} onChange={(e) => setOpenId(e.target.value)} placeholder={lastRun || "run id"} />
                <button
                  type="button"
                  onClick={() => openRun((openId || lastRun || "").trim())}
                  disabled={!(openId || lastRun)}
                >
                  Open
                </button>
              </div>
            </label>
          </div>
        </div>
      ) : (
        <div className="console-live">
          <RunStatusBar status={state.status} connection={state.connection} runId={state.runId} />

          <ApprovalPrompt pending={state.pendingApproval} onApprove={approve} onReject={reject} />

          <RunTimeline events={state.events} />

          {state.result && <ResultPanel result={state.result} />}

          {(state.result || state.status === "failed") && (
            <button className="btn-newrun" onClick={reset}>Start another run</button>
          )}
        </div>
      )}
    </div>
  );
}
