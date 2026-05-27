// Read-only file viewer. Two sources:
//  - mode "animate": show `animateContent` (from the write_file event) with a typing reveal.
//  - mode "fetch":   load current content from the backend (older/selected/reopened files).
// Strictly read-only. Renders text / binary / too_large / error / loading states.
import { useEffect, useState } from "react";
import { readFileContent } from "../runtime/api.js";
import { useTypingReveal } from "./useTypingReveal.js";

function AnimatedText({ content }) {
  const { shown } = useTypingReveal(content, { play: true });
  return <pre className="fv-pre">{shown}</pre>;
}

export default function FileViewer({ runId, path, mode, animateContent }) {
  const [state, setState] = useState({ kind: "idle" });

  useEffect(() => {
    if (!path) { setState({ kind: "idle" }); return; }
    if (mode === "animate") { setState({ kind: "animate" }); return; }
    let cancelled = false;
    setState({ kind: "loading" });
    readFileContent(runId, path)
      .then((r) => { if (!cancelled) setState({ kind: r.kind, content: r.content, size: r.size }); })
      .catch((e) => { if (!cancelled) setState({ kind: "error", error: e.code || "error" }); });
    return () => { cancelled = true; };
  }, [runId, path, mode]);

  if (!path) return <div className="fv-empty">Select a file to view its contents.</div>;

  return (
    <div className="fileviewer">
      <div className="fv-head"><code>{path}</code><span className="fv-ro">read-only</span></div>
      <div className="fv-body">
        {state.kind === "animate" && <AnimatedText content={animateContent ?? ""} />}
        {state.kind === "text" && <pre className="fv-pre">{state.content}</pre>}
        {state.kind === "loading" && <div className="fv-note">Loading…</div>}
        {state.kind === "binary" && <div className="fv-note">Binary file — not displayed.</div>}
        {state.kind === "too_large" && <div className="fv-note">File too large to display ({state.size} bytes).</div>}
        {state.kind === "error" && <div className="fv-note fv-err">Could not read file ({state.error}).</div>}
      </div>
    </div>
  );
}
