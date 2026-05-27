// Renders one timeline event, distinctly per type. Long outputs truncate with expand.
import { useState } from "react";

function Output({ value }) {
  const [open, setOpen] = useState(false);
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  if (text == null) return null;
  const long = text.length > 300;
  const shown = open || !long ? text : text.slice(0, 300) + "…";
  return (
    <div className="ev-output">
      <pre>{shown}</pre>
      {long && (
        <button className="ev-expand" onClick={() => setOpen((o) => !o)}>
          {open ? "show less" : "show more"}
        </button>
      )}
    </div>
  );
}

export default function EventItem({ event }) {
  const { type, data, ts } = event;
  const time = ts ? new Date(ts).toLocaleTimeString() : "";

  const body = () => {
    switch (type) {
      case "status":
        return <span>status → <strong>{data.status}</strong>{data.detail ? ` (${data.detail})` : ""}</span>;
      case "thought":
        return <span className="ev-thought-text">{data.text}</span>;
      case "tool_call":
        return (
          <div>
            <code className="ev-tool">{data.name}</code>
            <Output value={data.args} />
          </div>
        );
      case "tool_result":
        return (
          <div>
            {data.ok ? <span className="ev-ok">ok</span> : <span className="ev-err">error: {data.error}</span>}
            {data.output != null && <Output value={data.output} />}
          </div>
        );
      case "approval_request":
        return <span>approval requested: <strong>{data.action}</strong> ({data.reason})</span>;
      case "approval_decision":
        return <span>approval {data.approved ? "granted" : "denied"} ({data.by})</span>;
      case "limit":
        return <span className="ev-limit">limit reached: <strong>{data.kind}</strong> ({data.value})</span>;
      case "refusal":
        return <span className="ev-err">refused: {data.action} — {data.reason}</span>;
      case "error":
        return <span className="ev-err">error: {data.message}</span>;
      case "result":
        return <span>result: <strong>{data.outcome}</strong> — {data.reason}</span>;
      default:
        return <Output value={data} />;
    }
  };

  return (
    <div className={`ev ev-${type}`} data-event-type={type}>
      <span className="ev-type">{type}</span>
      <div className="ev-body">{body()}</div>
      <span className="ev-time">{time}</span>
    </div>
  );
}
