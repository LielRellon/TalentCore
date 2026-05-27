// Surfaces a pending gated action with Approve/Reject. The run stays paused until the
// user decides; the UI never advances a gate on its own (constitution Principle III).
export default function ApprovalPrompt({ pending, onApprove, onReject }) {
  if (!pending) return null;
  return (
    <div className="approval" role="alertdialog" aria-label="Approval needed">
      <div className="approval-head">⚠ Approval needed</div>
      <div className="approval-action"><code>{pending.action}</code></div>
      <div className="approval-reason">Reason: {pending.reason}</div>
      <div className="approval-buttons">
        <button className="btn-approve" onClick={onApprove}>Approve</button>
        <button className="btn-reject" onClick={onReject}>Reject</button>
      </div>
    </div>
  );
}
