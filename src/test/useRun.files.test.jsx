// T007: reducer derives file list + currentlyWriting from write_file events.
import { describe, it, expect } from "vitest";
import { reducer, initialState } from "../console/useRun.js";

const ev = (seq, type, data) => ({ seq, ts: "t", type, data });
const writeCall = (seq, path, content) => ev(seq, "tool_call", { callId: "c" + seq, name: "write_file", args: { path, content } });

describe("useRun file derivation", () => {
  it("adds written files and tracks currentlyWriting", () => {
    let s = reducer(initialState, { type: "EVENT", event: writeCall(0, "src/a.js", "AAA") });
    expect(s.files["src/a.js"].lastWriteContent).toBe("AAA");
    expect(s.currentlyWriting).toBe("src/a.js");
    s = reducer(s, { type: "EVENT", event: writeCall(1, "src/b.js", "BBB") });
    expect(Object.keys(s.files).sort()).toEqual(["src/a.js", "src/b.js"]);
    expect(s.currentlyWriting).toBe("src/b.js");
  });

  it("last write to a path wins", () => {
    let s = reducer(initialState, { type: "EVENT", event: writeCall(0, "x.js", "v1") });
    s = reducer(s, { type: "EVENT", event: writeCall(1, "x.js", "v2") });
    expect(s.files["x.js"].lastWriteContent).toBe("v2");
  });

  it("ignores non-write tool calls for file list", () => {
    const s = reducer(initialState, { type: "EVENT", event: ev(0, "tool_call", { callId: "c", name: "run_command", args: { command: "ls" } }) });
    expect(Object.keys(s.files)).toHaveLength(0);
    expect(s.currentlyWriting).toBeNull();
  });

  it("MERGE_FILES adds backend-listed files without clobbering write content", () => {
    let s = reducer(initialState, { type: "EVENT", event: writeCall(0, "a.js", "written") });
    s = reducer(s, { type: "MERGE_FILES", files: [{ path: "a.js", type: "file" }, { path: "b.txt", type: "file" }, { path: "src", type: "dir" }] });
    expect(s.files["a.js"].lastWriteContent).toBe("written"); // preserved
    expect(s.files["b.txt"]).toBeTruthy();                    // added
    expect(s.files["src"]).toBeUndefined();                   // dirs skipped
  });
});
