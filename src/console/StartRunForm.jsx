// Start form: employee picker (shared roster) + task + optional limits + auto-approve.
import { useState } from "react";
import { INIT_EMPLOYEES, DEPT_ORDER } from "../roster.js";

const grouped = DEPT_ORDER.map((dept) => ({
  dept,
  people: INIT_EMPLOYEES.filter((e) => e.dept === dept),
})).filter((g) => g.people.length);

export default function StartRunForm({ onStart, disabled }) {
  const [personaId, setPersonaId] = useState("sfe");
  const [task, setTask] = useState("");
  const [model, setModel] = useState("auto");
  const [autoApprove, setAutoApprove] = useState(false);
  const [showLimits, setShowLimits] = useState(false);
  const [limits, setLimits] = useState({ maxIterations: "", maxTokens: "", maxWallClockMs: "", maxFilesTouched: "" });
  const [touched, setTouched] = useState(false);

  const taskEmpty = task.trim().length === 0;

  const submit = (e) => {
    e.preventDefault();
    setTouched(true);
    if (taskEmpty) return;
    // Only include limits the user actually set so backend defaults apply otherwise.
    const cleanLimits = {};
    for (const [k, v] of Object.entries(limits)) {
      if (String(v).trim() !== "" && Number(v) > 0) cleanLimits[k] = Number(v);
    }
    onStart({
      personaId,
      task: task.trim(),
      model,
      autoApprove,
      ...(Object.keys(cleanLimits).length ? { limits: cleanLimits } : {}),
    });
  };

  return (
    <form className="startform" onSubmit={submit}>
      <h2>Start a run</h2>

      <label className="field">
        <span>Employee</span>
        <select value={personaId} onChange={(e) => setPersonaId(e.target.value)}>
          {grouped.map((g) => (
            <optgroup key={g.dept} label={g.dept}>
              {g.people.map((p) => (
                <option key={p.id} value={p.id}>{p.name} — {p.role}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Task</span>
        <textarea
          rows={4}
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder="e.g. Create src/email.js with isValidEmail() and a passing node:test, then run the test."
        />
        {touched && taskEmpty && <small className="field-error">Enter a task to start.</small>}
      </label>

      <label className="field">
        <span>Model</span>
        <select value={model} onChange={(e) => setModel(e.target.value)}>
          <option value="auto">Auto — balanced (70B, falls back to 8B on rate limit)</option>
          <option value="llama-3.3-70b-versatile">Llama 3.3 70B — best quality</option>
          <option value="llama-3.1-8b-instant">Llama 3.1 8B — fastest, higher limits</option>
        </select>
      </label>

      <label className="checkbox">
        <input type="checkbox" checked={autoApprove} onChange={(e) => setAutoApprove(e.target.checked)} />
        Auto-approve gated actions (skip prompts)
      </label>

      <button type="button" className="link-btn" onClick={() => setShowLimits((s) => !s)}>
        {showLimits ? "− Hide limits" : "+ Set limits (optional)"}
      </button>

      {showLimits && (
        <div className="limits-grid">
          {[
            ["maxIterations", "Max iterations"],
            ["maxTokens", "Max tokens"],
            ["maxWallClockMs", "Max time (ms)"],
            ["maxFilesTouched", "Max files"],
          ].map(([key, label]) => (
            <label key={key} className="field">
              <span>{label}</span>
              <input
                type="number" min="1"
                value={limits[key]}
                placeholder="default"
                onChange={(e) => setLimits((l) => ({ ...l, [key]: e.target.value }))}
              />
            </label>
          ))}
        </div>
      )}

      <button type="submit" className="btn-start" disabled={disabled}>Start run</button>
    </form>
  );
}
