// File explorer: lists the run's workspace files; click to select; highlights the
// selected file and the one currently being written.
export default function FileExplorer({ files, selectedPath, currentlyWriting, onSelect }) {
  const list = Object.values(files).sort((a, b) => a.path.localeCompare(b.path));
  return (
    <div className="explorer">
      <div className="explorer-head">Files ({list.length})</div>
      {list.length === 0 ? (
        <div className="explorer-empty">No files yet.</div>
      ) : (
        <ul className="explorer-list">
          {list.map((f) => (
            <li
              key={f.path}
              className={
                "explorer-item" +
                (f.path === selectedPath ? " is-selected" : "") +
                (f.path === currentlyWriting ? " is-writing" : "")
              }
              onClick={() => onSelect(f.path)}
              title={f.path}
            >
              <code>{f.path}</code>
              {f.path === currentlyWriting && <span className="explorer-dot" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
