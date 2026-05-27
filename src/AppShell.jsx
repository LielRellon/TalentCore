// App shell: a minimal in-app view switch between the existing Chat (TalentCore_v2)
// and the new Run Console. No router dependency.
import { useState } from "react";
import TalentCore from "./TalentCore_v2.jsx";
import RunConsole from "./console/RunConsole.jsx";
import "./shell.css";

const tabStyle = (active) => ({
  padding: "8px 16px",
  cursor: "pointer",
  border: "none",
  borderBottom: active ? "2px solid #6c63ff" : "2px solid transparent",
  background: "none",
  color: active ? "#fff" : "#9aa0ad",
  fontWeight: active ? 600 : 400,
  fontFamily: "system-ui, sans-serif",
});

export default function AppShell() {
  const [view, setView] = useState("console"); // "console" | "chat" — Run Console is the default
  return (
    <div className="app-shell">
      <nav style={{ display: "flex", gap: 8, padding: "8px 16px", background: "#0f1117", borderBottom: "1px solid #2a2e3a" }}>
        <button style={tabStyle(view === "chat")} onClick={() => setView("chat")}>Chat</button>
        <button style={tabStyle(view === "console")} onClick={() => setView("console")}>Run Console</button>
      </nav>
      {view === "chat" ? <TalentCore /> : <RunConsole />}
    </div>
  );
}
