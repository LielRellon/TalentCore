// Shows the run's status and the live-stream connection state.
const STATUS_LABEL = {
  idle: "Idle",
  running: "Running",
  "awaiting-approval": "Awaiting approval",
  completed: "Completed",
  failed: "Failed",
  halted: "Halted",
};

const CONN_LABEL = {
  connecting: "connecting…",
  open: "live",
  reconnecting: "reconnecting…",
  closed: "",
};

export default function RunStatusBar({ status, connection, runId }) {
  return (
    <div className={`statusbar status-${status}`}>
      <span className="status-dot" />
      <strong>{STATUS_LABEL[status] || status}</strong>
      {runId && <span className="status-runid">run {runId}</span>}
      {CONN_LABEL[connection] && <span className="status-conn">{CONN_LABEL[connection]}</span>}
    </div>
  );
}
