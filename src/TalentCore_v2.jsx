import { useState, useRef, useEffect } from "react";
import { INIT_EMPLOYEES, DEPT_ORDER } from "./roster.js";

const PROVIDER = "groq" // "groq" | "ollama"

async function callClaude(system, messages) {
  const endpoint = PROVIDER === "ollama" ? "/api/ollama" : "/api/chat"
  const model = PROVIDER === "ollama" ? "llama3.2" : "llama-3.3-70b-versatile"

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: 1000,
      messages: [{ role: "system", content: system }, ...messages],
    }),
  })
  const d = await res.json()
  if (d.error) throw new Error(d.error.message)
  return d.choices?.[0]?.message?.content || ""
}

// ─────────────────────────────────────────────────────────────────────────────
// STORAGE — Dual: localStorage (instant/offline) + Supabase (cloud/multi-device)
//
// HOW IT WORKS:
//   GET  → try Supabase first (freshest data) → fall back to localStorage
//   SET  → write localStorage immediately (fast) → sync Supabase in background
//
// TO ENABLE SUPABASE in your Vite app:
//   1. npm install @supabase/supabase-js
//   2. Create a .env file:
//        VITE_SUPABASE_URL=https://xxxx.supabase.co
//        VITE_SUPABASE_ANON_KEY=your-anon-key
//   3. Create a Supabase table:
//        create table talent_core_storage (
//          id uuid default gen_random_uuid() primary key,
//          user_id text not null,
//          key text not null,
//          value jsonb,
//          updated_at timestamptz default now(),
//          unique(user_id, key)
//        );
//   4. Uncomment the Supabase lines below and set SUPABASE_ENABLED = true
//   5. Replace "guest" with the real user id from Supabase Auth
// ─────────────────────────────────────────────────────────────────────────────

// import { createClient } from "@supabase/supabase-js";
// const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
const SUPABASE_ENABLED = false; // flip to true after setup
const CURRENT_USER_ID  = "guest"; // replace with supabase.auth.getUser()

const Storage = {
  async get(key) {
    // 1. Try Supabase (cloud — most up to date)
    if (SUPABASE_ENABLED) {
      try {
        // const { data } = await supabase
        //   .from("talent_core_storage")
        //   .select("value")
        //   .eq("user_id", CURRENT_USER_ID)
        //   .eq("key", key)
        //   .single();
        // if (data?.value) return data.value;
      } catch {}
    }
    // 2. Fall back to localStorage (offline / faster)
    try {
      if (window.storage) { const r = await window.storage.get(key); return r ? JSON.parse(r.value) : null; }
      const v = localStorage.getItem(key); return v ? JSON.parse(v) : null;
    } catch { return null; }
  },

  async set(key, value) {
    // 1. Write localStorage immediately (instant, works offline)
    try {
      if (window.storage) { await window.storage.set(key, JSON.stringify(value)); }
      else { localStorage.setItem(key, JSON.stringify(value)); }
    } catch {}
    // 2. Sync to Supabase in background (non-blocking)
    if (SUPABASE_ENABLED) {
      try {
        // await supabase.from("talent_core_storage").upsert(
        //   { user_id: CURRENT_USER_ID, key, value, updated_at: new Date().toISOString() },
        //   { onConflict: "user_id,key" }
        // );
      } catch {}
    }
  },
};

// EMPLOYEE ROSTER — see ./roster.js (shared with the Run Console)

const QUICK_ACTIONS = [
  { id: "chat",      label: "💬 Chat",              prompt: "" },
  { id: "task",      label: "📋 Assign Task",       prompt: "I'd like to assign you a task: " },
  { id: "report",    label: "📊 Report",            prompt: "Please give me a status report on your current work and any updates." },
  { id: "interview", label: "🎙️ Interview",         prompt: "Let's do a professional interview. Please introduce yourself, your expertise, and walk me through your work approach." },
  { id: "standup",   label: "☀️ Standup",           prompt: "Standup time! What did you work on yesterday, what are you doing today, and do you have any blockers?" },
  { id: "review",    label: "⭐ Perf Review",       prompt: "Let's do a performance review. Reflect on your recent contributions, achievements, and areas for growth." },
];

// ─────────────────────────────────────────────────────────────────────────────
// SHARED COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────
function Avatar({ initials, color, size = 40, online = true }) {
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <div style={{
        width: size, height: size, borderRadius: "50%",
        background: `linear-gradient(135deg, ${color}cc, ${color}55)`,
        border: `2px solid ${color}44`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontWeight: 800, fontSize: size * 0.3, color: "#fff", letterSpacing: 0.5,
      }}>{initials}</div>
      {online && <div style={{
        position: "absolute", bottom: 1, right: 1,
        width: size * 0.22, height: size * 0.22, borderRadius: "50%",
        background: "#4ade80", border: "2px solid #0d1117",
      }} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PROFILE / SETTINGS PANEL
// ─────────────────────────────────────────────────────────────────────────────
function ProfilePanel({ emp, onClose, onUpdate, msgCount }) {
  const [name, setName] = useState(emp.name);
  const [role, setRole] = useState(emp.role);
  const [persona, setPersona] = useState(emp.persona);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    onUpdate(emp.id, { name, role, persona });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={{
      position: "absolute", right: 0, top: 0, bottom: 0, width: 340,
      background: "#111827", borderLeft: "1px solid #1e2535",
      zIndex: 20, display: "flex", flexDirection: "column",
      boxShadow: "-8px 0 32px rgba(0,0,0,0.5)",
      animation: "slideIn 0.2s ease",
    }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #1e2535", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: "#f1f5f9" }}>Employee Settings</div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 20, lineHeight: 1 }}>✕</button>
      </div>

      {/* Avatar + stats */}
      <div style={{ padding: "24px 20px 18px", textAlign: "center", borderBottom: "1px solid #1e2535" }}>
        <Avatar initials={emp.avatar} color={emp.color} size={72} />
        <div style={{ marginTop: 10, fontSize: 12, color: emp.color, fontWeight: 600 }}>{emp.dept}</div>
        <div style={{ marginTop: 12, display: "flex", justifyContent: "center", gap: 20 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#f1f5f9" }}>{msgCount}</div>
            <div style={{ fontSize: 10, color: "#475569" }}>Messages</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#4ade80" }}>Online</div>
            <div style={{ fontSize: 10, color: "#475569" }}>Status</div>
          </div>
        </div>
      </div>

      {/* Editable fields */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: 18 }}>
        {[
          { label: "Display Name", value: name, set: setName, mono: false },
          { label: "Job Title", value: role, set: setRole, mono: false },
        ].map(({ label, value, set, mono }) => (
          <label key={label} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 10, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2 }}>{label}</span>
            <input value={value} onChange={e => set(e.target.value)} style={{
              background: "#1a2032", border: "1px solid #2d3748", borderRadius: 8,
              padding: "9px 12px", color: "#e2e8f0", fontSize: 13, outline: "none",
              fontFamily: mono ? "monospace" : "inherit",
            }} />
          </label>
        ))}

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 10, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2 }}>AI Persona (System Prompt)</span>
          <textarea value={persona} onChange={e => setPersona(e.target.value)} rows={9}
            style={{
              background: "#1a2032", border: "1px solid #2d3748", borderRadius: 8,
              padding: "9px 12px", color: "#e2e8f0", fontSize: 11.5, outline: "none",
              resize: "vertical", fontFamily: "monospace", lineHeight: 1.65,
            }} />
          <span style={{ fontSize: 10, color: "#475569", lineHeight: 1.5 }}>
            This defines how the AI employee thinks, speaks, and responds. Edit to customize their personality or expertise.
          </span>
        </label>
      </div>

      <div style={{ padding: "14px 20px", borderTop: "1px solid #1e2535", display: "flex", gap: 8 }}>
        <button onClick={onClose} style={{ flex: 1, background: "#1a2032", border: "1px solid #2d3748", borderRadius: 8, padding: 9, color: "#94a3b8", cursor: "pointer", fontSize: 13 }}>Cancel</button>
        <button onClick={handleSave} style={{
          flex: 2, background: saved ? "#22c55e" : emp.color, border: "none",
          borderRadius: 8, padding: 9, color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 13,
          transition: "background 0.3s",
        }}>{saved ? "✓ Saved!" : "Save Changes"}</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TEAM MEETING MODE
// ─────────────────────────────────────────────────────────────────────────────
function TeamMeeting({ employees, onBack }) {
  const [participants, setParticipants] = useState([]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingFor, setLoadingFor] = useState(null);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loadingFor]);

  const toggle = (emp) => setParticipants(p => p.find(e => e.id === emp.id) ? p.filter(e => e.id !== emp.id) : [...p, emp]);

  const sendToTeam = async () => {
    const text = input.trim();
    if (!text || loading || participants.length === 0) return;
    setInput("");

    setMessages(m => [...m, { isUser: true, content: text }]);
    setLoading(true);
    const previousReplies = [];

    for (const emp of participants) {
      setLoadingFor(emp.id);
      try {
        const context = previousReplies.length > 0
          ? `\n\nOther team members have already responded:\n${previousReplies.map(r => `• ${r.name}: "${r.text}"`).join("\n")}\n\nNow add your own perspective from your role. Be concise (2–3 sentences) and build on what others said if relevant.`
          : `\n\nYou are in a team meeting with: ${participants.map(e => `${e.name} (${e.role})`).join(", ")}. Respond concisely (2–3 sentences) from your professional perspective.`;

        const reply = await callClaude(emp.persona + context, [{ role: "user", content: text }]);
        previousReplies.push({ name: emp.name, text: reply });
        setMessages(m => [...m, { isUser: false, emp, content: reply }]);
      } catch (e) {
        setMessages(m => [...m, { isUser: false, emp, content: `⚠️ ${e.message}` }]);
      }
    }
    setLoading(false);
    setLoadingFor(null);
  };

  const loadingEmp = loadingFor ? employees.find(e => e.id === loadingFor) : null;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "14px 20px", borderBottom: "1px solid #1e2535", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <button onClick={onBack} style={{ background: "#1a2032", border: "1px solid #2d3748", borderRadius: 8, padding: "6px 12px", color: "#94a3b8", cursor: "pointer", fontSize: 12 }}>← Back</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#f1f5f9" }}>🤝 Team Meeting</div>
          <div style={{ fontSize: 11, color: "#475569" }}>
            {participants.length === 0 ? "Select participants below" : `${participants.length} participant${participants.length > 1 ? "s" : ""} · ${participants.map(e => e.name.split(" ")[0]).join(", ")}`}
          </div>
        </div>
        {participants.length > 0 && (
          <div style={{ display: "flex" }}>
            {participants.slice(0, 5).map(emp => (
              <div key={emp.id} style={{ marginLeft: -8, border: "2px solid #0d1117", borderRadius: "50%" }}>
                <Avatar initials={emp.avatar} color={emp.color} size={28} online={false} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Participant chips */}
      <div style={{ padding: "10px 16px", borderBottom: "1px solid #1e2535", display: "flex", flexWrap: "wrap", gap: 5, flexShrink: 0 }}>
        {employees.map(emp => {
          const active = !!participants.find(e => e.id === emp.id);
          return (
            <button key={emp.id} onClick={() => toggle(emp)} style={{
              background: active ? `${emp.color}22` : "#1a2032",
              border: `1px solid ${active ? emp.color + "77" : "#2d3748"}`,
              borderRadius: 20, padding: "4px 11px", cursor: "pointer",
              color: active ? emp.color : "#64748b", fontSize: 11,
              fontWeight: active ? 700 : 400, transition: "all 0.15s",
              display: "flex", alignItems: "center", gap: 5,
            }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: active ? emp.color : "#334155", transition: "background 0.15s" }} />
              {emp.name.split(" ")[0]}
            </button>
          );
        })}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", marginTop: 60 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🤝</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#64748b" }}>Start a Team Meeting</div>
            <div style={{ fontSize: 13, color: "#334155", marginTop: 6, lineHeight: 1.6 }}>
              Select participants above, then address the group.<br />Each employee will respond from their role's perspective.
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{ display: "flex", justifyContent: msg.isUser ? "flex-end" : "flex-start" }}>
            {msg.isUser ? (
              <div style={{ background: "#6C63FF", color: "#fff", borderRadius: "18px 4px 18px 18px", padding: "10px 16px", maxWidth: "60%", fontSize: 13.5, lineHeight: 1.6 }}>{msg.content}</div>
            ) : (
              <div style={{ display: "flex", gap: 9, alignItems: "flex-start", maxWidth: "78%" }}>
                <Avatar initials={msg.emp.avatar} color={msg.emp.color} size={32} online={false} />
                <div>
                  <div style={{ fontSize: 10, color: msg.emp.color, fontWeight: 700, marginBottom: 4, letterSpacing: 0.5 }}>{msg.emp.name} · {msg.emp.role}</div>
                  <div style={{ background: "#1e2535", color: "#e2e8f0", borderRadius: "4px 18px 18px 18px", padding: "10px 14px", fontSize: 13.5, lineHeight: 1.6 }}>{msg.content}</div>
                </div>
              </div>
            )}
          </div>
        ))}
        {loadingEmp && (
          <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
            <Avatar initials={loadingEmp.avatar} color={loadingEmp.color} size={32} online={false} />
            <div>
              <div style={{ fontSize: 10, color: loadingEmp.color, fontWeight: 700, marginBottom: 4 }}>{loadingEmp.name} is typing…</div>
              <div style={{ background: "#1e2535", borderRadius: "4px 18px 18px 18px", padding: "12px 16px", display: "flex", gap: 5 }}>
                {[0,1,2].map(i => <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: loadingEmp.color, animation: "bounce 1.2s infinite", animationDelay: `${i*0.2}s`, opacity: 0.8 }} />)}
              </div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div style={{ padding: "12px 16px 16px", borderTop: "1px solid #1e2535", flexShrink: 0 }}>
        {participants.length === 0 && <div style={{ textAlign: "center", fontSize: 11, color: "#475569", marginBottom: 8 }}>Select at least one participant to start</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <input value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") sendToTeam(); }}
            placeholder={participants.length > 0 ? `Address the team (${participants.map(e => e.name.split(" ")[0]).join(", ")})…` : "Select participants first…"}
            disabled={participants.length === 0 || loading}
            style={{ flex: 1, background: "#1a2032", border: "1px solid #2d3748", borderRadius: 12, padding: "10px 14px", color: "#e2e8f0", fontSize: 13.5, outline: "none", fontFamily: "inherit" }} />
          <button onClick={sendToTeam} disabled={!input.trim() || loading || participants.length === 0}
            style={{ background: input.trim() && !loading && participants.length > 0 ? "#6C63FF" : "#1a2032", border: "none", borderRadius: 12, width: 44, height: 44, cursor: "pointer", fontSize: 18, color: "#fff", flexShrink: 0 }}>➤</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────────────────────
export default function TalentCore() {
  const [employees, setEmployees]       = useState(INIT_EMPLOYEES);
  const [selected, setSelected]         = useState(null);
  const [conversations, setConversations] = useState({});
  const [input, setInput]               = useState("");
  const [loading, setLoading]           = useState(false);
  const [mode, setMode]                 = useState("direct"); // "direct" | "meeting"
  const [profileOpen, setProfileOpen]   = useState(null);
  const [sidebarOpen, setSidebarOpen]   = useState(true);
  const [pendingFile, setPendingFile]   = useState(null); // { name, base64, mediaType, preview }
  const [activeAction, setActiveAction] = useState("chat");
  const messagesEndRef = useRef(null);
  const inputRef       = useRef(null);
  const fileInputRef   = useRef(null);

  // ── Load from storage on mount ──────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const [savedEmps, savedConvs] = await Promise.all([
        Storage.get("talentcore:employees"),
        Storage.get("talentcore:conversations"),
      ]);
      const emps = savedEmps || INIT_EMPLOYEES;
      if (savedEmps) setEmployees(savedEmps);
      if (savedConvs) setConversations(savedConvs);
      setSelected(emps[0]);
    })();
  }, []);

  // ── Auto-save conversations ─────────────────────────────────────────────────
  useEffect(() => {
    if (Object.keys(conversations).length > 0) Storage.set("talentcore:conversations", conversations);
  }, [conversations]);

  // ── Auto-save employees (persona edits) ────────────────────────────────────
  useEffect(() => {
    if (employees !== INIT_EMPLOYEES) Storage.set("talentcore:employees", employees);
  }, [employees]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [conversations, loading, selected]);

  const messages = selected ? (conversations[selected.id] || []) : [];
  const profileEmp = profileOpen ? employees.find(e => e.id === profileOpen) : null;

  const grouped = DEPT_ORDER.reduce((acc, dept) => {
    const emps = employees.filter(e => e.dept === dept);
    if (emps.length) acc[dept] = emps;
    return acc;
  }, {});

  // ── File upload handler ─────────────────────────────────────────────────────
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Supported: images. For PDFs, you'd add: "application/pdf"
    const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowed.includes(file.type)) {
      alert("Supported formats: JPG, PNG, GIF, WebP. For PDF support, integrate with the Anthropic Documents API.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target.result.split(",")[1];
      setPendingFile({ name: file.name, base64, mediaType: file.type, preview: ev.target.result });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // ── Send message (direct chat) ──────────────────────────────────────────────
  const handleSend = async (overrideText) => {
    const text = (overrideText ?? input).trim();
    if ((!text && !pendingFile) || loading || !selected) return;
    setInput("");

    // Build API message content
    let apiContent;
    let displayText = text || "Shared an image";
    if (pendingFile) {
      apiContent = [
        { type: "image", source: { type: "base64", media_type: pendingFile.mediaType, data: pendingFile.base64 } },
        { type: "text", text: text || "What do you think about this image? Respond as your professional role." },
      ];
    } else {
      apiContent = text;
    }

    const userMsg = {
      role: "user",
      content: apiContent,
      displayText,
      imagePreview: pendingFile?.preview || null,
      imageName: pendingFile?.name || null,
    };
    setPendingFile(null);

    const prev = conversations[selected.id] || [];
    const updated = [...prev, userMsg];
    setConversations(c => ({ ...c, [selected.id]: updated }));
    setLoading(true);

    try {
      const apiMessages = updated.map(m => ({ role: m.role, content: m.content }));
      const reply = await callClaude(selected.persona, apiMessages);
      setConversations(c => ({
        ...c,
        [selected.id]: [...(c[selected.id] || []), { role: "assistant", content: reply }],
      }));
    } catch (err) {
      setConversations(c => ({
        ...c,
        [selected.id]: [...(c[selected.id] || []), { role: "assistant", content: `⚠️ ${err.message}` }],
      }));
    }
    setLoading(false);
    inputRef.current?.focus();
  };

  const handleAction = (action) => {
    setActiveAction(action.id);
    if (action.prompt) {
      if (["report", "interview", "standup", "review"].includes(action.id)) handleSend(action.prompt);
      else { setInput(action.prompt); inputRef.current?.focus(); }
    }
  };

  const updateEmployee = (id, changes) => {
    setEmployees(emps => emps.map(e => e.id === id ? { ...e, ...changes } : e));
    if (selected?.id === id) setSelected(s => ({ ...s, ...changes }));
  };

  const clearChat = () => {
    if (window.confirm(`Clear all messages with ${selected.name}?`)) {
      setConversations(c => ({ ...c, [selected.id]: [] }));
    }
  };

  if (!selected) return (
    <div style={{ background: "#0d1117", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#475569", fontFamily: "Inter, sans-serif" }}>
      Loading Talent Core…
    </div>
  );

  return (
    <div style={{ display: "flex", height: "100vh", background: "#0d1117", fontFamily: "'Inter', sans-serif", color: "#e2e8f0", overflow: "hidden", position: "relative" }}>
      {/* ── Sidebar ────────────────────────────────────────────────────────── */}
      <div style={{
        width: sidebarOpen ? 224 : 0, minWidth: sidebarOpen ? 224 : 0,
        background: "#0a0f1a", borderRight: "1px solid #1e2535",
        display: "flex", flexDirection: "column", overflow: "hidden",
        transition: "width 0.2s ease, min-width 0.2s ease", flexShrink: 0,
      }}>
        {/* Brand */}
        <div style={{ padding: "16px 14px 13px", borderBottom: "1px solid #1e2535" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: "linear-gradient(135deg, #6C63FF, #00C9A7)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 16, color: "#fff", flexShrink: 0 }}>I</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#fff", letterSpacing: 0.3 }}>Talent Core</div>
              <div style={{ fontSize: 9.5, color: "#334155", letterSpacing: 1.2 }}>Talent Core · {employees.length} Agents</div>
            </div>
          </div>
        </div>

        {/* Mode toggle */}
        <div style={{ padding: "10px 10px 6px" }}>
          <div style={{ display: "flex", background: "#111827", borderRadius: 8, padding: 3, gap: 3 }}>
            {[["direct", "💬 Direct"], ["meeting", "🤝 Meeting"]].map(([m, label]) => (
              <button key={m} onClick={() => setMode(m)} style={{
                flex: 1, padding: "5px 0", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 11,
                fontWeight: mode === m ? 700 : 400,
                background: mode === m ? "#1e2535" : "transparent",
                color: mode === m ? "#f1f5f9" : "#475569",
                transition: "all 0.15s",
              }}>{label}</button>
            ))}
          </div>
        </div>

        {/* Employee list */}
        <div style={{ flex: 1, overflowY: "auto", paddingBottom: 8 }}>
          {Object.entries(grouped).map(([dept, emps]) => (
            <div key={dept}>
              <div style={{ padding: "10px 14px 3px", fontSize: 9, fontWeight: 700, color: "#2d3748", letterSpacing: 1.8, textTransform: "uppercase" }}>{dept}</div>
              {emps.map(emp => {
                const isSelected = selected.id === emp.id && mode === "direct";
                return (
                  <button key={emp.id}
                    onClick={() => { setSelected(emp); setMode("direct"); setActiveAction("chat"); setInput(""); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 9, width: "100%",
                      padding: "8px 10px 8px 11px", border: "none", cursor: "pointer",
                      background: isSelected ? `${emp.color}15` : "transparent",
                      borderLeft: isSelected ? `3px solid ${emp.color}` : "3px solid transparent",
                      borderRadius: "0 7px 7px 0", transition: "all 0.12s",
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "#ffffff07"; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                  >
                    <Avatar initials={emp.avatar} color={emp.color} size={30} />
                    <div style={{ textAlign: "left", overflow: "hidden", flex: 1 }}>
                      <div style={{ color: isSelected ? "#fff" : "#c8d3e0", fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{emp.name}</div>
                      <div style={{ color: isSelected ? emp.color : "#475569", fontSize: 10.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{emp.role}</div>
                    </div>
                    {/* Message count badge */}
                    {(conversations[emp.id]?.length || 0) > 0 && (
                      <div style={{ background: "#1e2535", borderRadius: 10, padding: "1px 6px", fontSize: 9.5, color: "#64748b", flexShrink: 0 }}>
                        {Math.floor((conversations[emp.id]?.length || 0) / 2)}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div style={{ padding: "10px 14px", borderTop: "1px solid #1e2535" }}>
          <div style={{ fontSize: 9.5, color: "#2d3748", textAlign: "center" }}>Powered by Claude · Talent Core v2.0</div>
        </div>
      </div>

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

        {mode === "meeting" ? (
          <TeamMeeting employees={employees} onBack={() => setMode("direct")} />
        ) : (
          <>
            {/* Header */}
            <div style={{ padding: "12px 18px", borderBottom: "1px solid #1e2535", display: "flex", alignItems: "center", gap: 10, background: "#0a0f1a", flexShrink: 0 }}>
              <button onClick={() => setSidebarOpen(o => !o)} style={{ background: "none", border: "none", cursor: "pointer", color: "#475569", fontSize: 18, padding: "2px 6px", borderRadius: 6, lineHeight: 1 }}>☰</button>
              <button onClick={() => setProfileOpen(selected.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }} title="Open profile settings">
                <Avatar initials={selected.avatar} color={selected.color} size={38} />
              </button>
              <div onClick={() => setProfileOpen(selected.id)} style={{ flex: 1, cursor: "pointer" }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: "#f1f5f9" }}>{selected.name}</div>
                <div style={{ fontSize: 11, color: selected.color }}>{selected.role} · {selected.dept}</div>
              </div>
              <button onClick={() => setProfileOpen(selected.id)} style={{ background: "#1a2032", border: "1px solid #2d3748", color: "#94a3b8", borderRadius: 8, padding: "5px 11px", fontSize: 11.5, cursor: "pointer" }}>⚙️ Settings</button>
              <button onClick={clearChat} style={{ background: "#1a2032", border: "1px solid #2d3748", color: "#64748b", borderRadius: 8, padding: "5px 11px", fontSize: 11.5, cursor: "pointer" }}>Clear</button>
            </div>

            {/* Quick actions */}
            <div style={{ display: "flex", gap: 5, padding: "9px 14px", borderBottom: "1px solid #1e2535", overflowX: "auto", flexShrink: 0, scrollbarWidth: "none" }}>
              {QUICK_ACTIONS.map(action => (
                <button key={action.id} onClick={() => handleAction(action)} style={{
                  background: activeAction === action.id ? `${selected.color}22` : "#111827",
                  border: `1px solid ${activeAction === action.id ? selected.color + "66" : "#2d3748"}`,
                  color: activeAction === action.id ? selected.color : "#64748b",
                  borderRadius: 20, padding: "5px 13px", fontSize: 11.5, cursor: "pointer",
                  whiteSpace: "nowrap", fontWeight: activeAction === action.id ? 700 : 400,
                  transition: "all 0.13s",
                }}>{action.label}</button>
              ))}
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: "auto", padding: "20px 18px 10px", display: "flex", flexDirection: "column", gap: 13 }}>
              {messages.length === 0 && (
                <div style={{ textAlign: "center", marginTop: 60 }}>
                  <button onClick={() => setProfileOpen(selected.id)} style={{ background: "none", border: "none", cursor: "pointer" }}>
                    <Avatar initials={selected.avatar} color={selected.color} size={68} />
                  </button>
                  <div style={{ marginTop: 14, fontSize: 20, fontWeight: 700, color: "#f1f5f9" }}>{selected.name}</div>
                  <div style={{ fontSize: 12, color: selected.color, marginTop: 2 }}>{selected.role} · {selected.dept}</div>
                  <div style={{ marginTop: 18, padding: "14px 18px", background: "#111827", borderRadius: 14, border: "1px solid #1e2535", maxWidth: 340, margin: "18px auto 0", fontSize: 13, color: "#94a3b8", lineHeight: 1.65 }}>
                    👋 Hi! I'm {selected.name.split(" ")[0]}. Use the quick actions above or send me a message to get started. You can also click my name to edit my profile and persona.
                  </div>
                </div>
              )}
              {messages.map((msg, i) => {
                const isUser = msg.role === "user";
                return (
                  <div key={i} style={{ display: "flex", gap: 9, flexDirection: isUser ? "row-reverse" : "row", alignItems: "flex-start" }}>
                    {!isUser && <Avatar initials={selected.avatar} color={selected.color} size={30} />}
                    <div style={{ maxWidth: "73%", display: "flex", flexDirection: "column", gap: 4, alignItems: isUser ? "flex-end" : "flex-start" }}>
                      {msg.imagePreview && (
                        <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid #2d3748", maxWidth: 220 }}>
                          <img src={msg.imagePreview} alt={msg.imageName} style={{ width: "100%", display: "block" }} />
                          <div style={{ background: "#1a2032", padding: "4px 10px", fontSize: 10, color: "#64748b" }}>📎 {msg.imageName}</div>
                        </div>
                      )}
                      {(msg.displayText || msg.content) && (
                        <div style={{
                          background: isUser ? "#6C63FF" : "#1a2032",
                          color: "#e2e8f0",
                          borderRadius: isUser ? "18px 4px 18px 18px" : "4px 18px 18px 18px",
                          padding: "9px 14px", fontSize: 13.5, lineHeight: 1.65,
                          boxShadow: "0 2px 10px rgba(0,0,0,0.25)",
                          whiteSpace: "pre-wrap",
                        }}>{isUser ? (msg.displayText || (typeof msg.content === "string" ? msg.content : "")) : msg.content}</div>
                      )}
                    </div>
                  </div>
                );
              })}
              {loading && (
                <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
                  <Avatar initials={selected.avatar} color={selected.color} size={30} />
                  <div style={{ background: "#1a2032", borderRadius: "4px 18px 18px 18px", padding: "11px 16px", display: "flex", gap: 5 }}>
                    {[0,1,2].map(i => <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: selected.color, animation: "bounce 1.2s infinite", animationDelay: `${i*0.2}s`, opacity: 0.8 }} />)}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* File preview */}
            {pendingFile && (
              <div style={{ padding: "8px 16px", borderTop: "1px solid #1e2535", display: "flex", alignItems: "center", gap: 10, background: "#0d1117", flexShrink: 0 }}>
                <img src={pendingFile.preview} alt={pendingFile.name} style={{ height: 48, width: 48, objectFit: "cover", borderRadius: 8, border: "1px solid #2d3748" }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: "#f1f5f9", fontWeight: 600 }}>{pendingFile.name}</div>
                  <div style={{ fontSize: 10, color: "#475569" }}>Image ready to send</div>
                </div>
                <button onClick={() => setPendingFile(null)} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 16 }}>✕</button>
              </div>
            )}

            {/* Input bar */}
            <div style={{ padding: "10px 14px 14px", borderTop: pendingFile ? "none" : "1px solid #1e2535", flexShrink: 0 }}>
              <div style={{ display: "flex", gap: 7, alignItems: "flex-end" }}>
                {/* File upload button */}
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={handleFileChange} style={{ display: "none" }} />
                <button onClick={() => fileInputRef.current?.click()} title="Attach image"
                  style={{ background: pendingFile ? `${selected.color}22` : "#111827", border: `1px solid ${pendingFile ? selected.color + "66" : "#2d3748"}`, borderRadius: 10, width: 40, height: 40, cursor: "pointer", fontSize: 16, flexShrink: 0, color: pendingFile ? selected.color : "#475569" }}>📎</button>

                <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder={`Message ${selected.name.split(" ")[0]}… (Enter to send, Shift+Enter for new line)`}
                  rows={1} style={{
                    flex: 1, background: "#111827", border: "1px solid #2d3748",
                    borderRadius: 12, padding: "10px 14px", color: "#e2e8f0",
                    fontSize: 13.5, resize: "none", outline: "none", fontFamily: "inherit",
                    lineHeight: 1.5, maxHeight: 130, overflowY: "auto", transition: "border-color 0.15s",
                  }}
                  onFocus={e => e.target.style.borderColor = selected.color + "88"}
                  onBlur={e => e.target.style.borderColor = "#2d3748"}
                />
                <button onClick={() => handleSend()} disabled={(!input.trim() && !pendingFile) || loading}
                  style={{
                    background: (input.trim() || pendingFile) && !loading ? selected.color : "#111827",
                    border: "none", borderRadius: 12, width: 42, height: 42,
                    cursor: (input.trim() || pendingFile) && !loading ? "pointer" : "default",
                    fontSize: 17, color: "#fff", flexShrink: 0, transition: "background 0.15s",
                  }}>➤</button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Profile panel (slide-in) ────────────────────────────────────────── */}
      {profileEmp && (
        <ProfilePanel
          emp={profileEmp}
          onClose={() => setProfileOpen(null)}
          onUpdate={updateEmployee}
          msgCount={Math.floor((conversations[profileEmp.id]?.length || 0) / 2)}
        />
      )}

      <style>{`
        @keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-7px)} }
        @keyframes slideIn { from{transform:translateX(40px);opacity:0} to{transform:translateX(0);opacity:1} }
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:#2d3748;border-radius:4px}
        button:focus{outline:none}
        textarea::-webkit-scrollbar{width:3px}
      `}</style>
    </div>
  );
}
