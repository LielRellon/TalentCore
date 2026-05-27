// Final result: outcome, stop reason, changed files. Highlights limit halts (US3).
export default function ResultPanel({ result }) {
  if (!result) return null;
  const { outcome, reason, filesChanged = [], summary } = result;
  return (
    <div className={`result result-${outcome}`}>
      <div className="result-head">
        <span className="result-outcome">{outcome.toUpperCase()}</span>
        <span className="result-reason">{reason}</span>
      </div>
      {summary && <p className="result-summary">{summary}</p>}
      <div className="result-files">
        <strong>Files changed ({filesChanged.length}):</strong>
        {filesChanged.length === 0 ? (
          <span> none</span>
        ) : (
          <ul>{filesChanged.map((f) => <li key={f}><code>{f}</code></li>)}</ul>
        )}
      </div>
    </div>
  );
}
