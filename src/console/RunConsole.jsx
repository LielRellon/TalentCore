// Run Console container. Idle → StartRunForm; active/finished → status + timeline +
// approval + result. Handles the single-run conflict (409), open-by-id replay, and
// surfaced errors. All backend access goes through useRun.
import { useEffect, useRef, useState } from "react";
import { useRun } from "./useRun.js";
import StartRunForm from "./StartRunForm.jsx";
import RunStatusBar from "./RunStatusBar.jsx";
import RunTimeline from "./RunTimeline.jsx";
import ApprovalPrompt from "./ApprovalPrompt.jsx";
import ResultPanel from "./ResultPanel.jsx";
import FileExplorer from "./FileExplorer.jsx";
import FileViewer from "./FileViewer.jsx";
import "./console.css";

const LAST_RUN_KEY = "talentcore:lastRunId";

export default function RunConsole() {
  const { state, startRun, openRun, approve, reject, reset, refreshFiles } = useRun();
  const [openId, setOpenId] = useState("");
  // { path, mode: "animate" | "fetch" } — the file shown in the viewer.
  const [selected, setSelected] = useState(null);
  const prevWriting = useRef(null);

  // Auto-follow the file the agent is writing: when currentlyWriting changes, focus it
  // and play the typing reveal from the write event's content.
  useEffect(() => {
    if (state.currentlyWriting && state.currentlyWriting !== prevWriting.current) {
      prevWriting.current = state.currentlyWriting;
      setSelected({ path: state.currentlyWriting, mode: "animate" });
    }
  }, [state.currentlyWriting]);

  // When a live run finishes, refresh the file list to catch files made by run_command.
  useEffect(() => {
    if (state.runId && ["completed", "halted", "failed"].includes(state.status)) {
      refreshFiles(state.runId);
    }
  }, [state.status, state.runId, refreshFiles]);

  // Remember the most recent run id for convenient reopen after reload.
  useEffect(() => {
    if (state.runId && state.status !== "idle") {
      try { localStorage.setItem(LAST_RUN_KEY, state.runId); } catch { /* ignore */ }
    }
  }, [state.runId, state.status]);

  const onStart = async (input) => {
    setSelected(null);
    prevWriting.current = null;
    await startRun(input);
  };

  // A manual click always shows full current content (interrupts any animation, FR-010).
  const onSelectFile = (path) => setSelected({ path, mode: "fetch" });

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

          <div className="console-panes">
            <div className="pane pane-timeline">
              <RunTimeline events={state.events} />
            </div>
            <div className="pane pane-files">
              <FileExplorer
                files={state.files}
                selectedPath={selected?.path || null}
                currentlyWriting={state.currentlyWriting}
                onSelect={onSelectFile}
              />
              <FileViewer
                runId={state.runId}
                path={selected?.path || null}
                mode={selected?.mode || "fetch"}
                animateContent={selected ? state.files[selected.path]?.lastWriteContent : null}
              />
            </div>
          </div>

          {state.result && <ResultPanel result={state.result} />}

          {(state.result || state.status === "failed") && (
            <button className="btn-newrun" onClick={reset}>Start another run</button>
          )}
        </div>
      )}
    </div>
  );
}
