// T009: each event type renders a distinct, readable item.
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import EventItem from "../console/EventItem.jsx";

afterEach(cleanup);

const ev = (type, data) => ({ seq: 0, ts: "2026-05-27T00:00:00Z", type, data });

describe("EventItem", () => {
  it("renders a thought", () => {
    render(<EventItem event={ev("thought", { text: "thinking hard" })} />);
    expect(screen.getByText("thinking hard")).toBeTruthy();
  });

  it("renders a tool_call with the tool name", () => {
    const { container } = render(<EventItem event={ev("tool_call", { callId: "c1", name: "write_file", args: { path: "a.js" } })} />);
    expect(screen.getByText("write_file")).toBeTruthy();
    expect(container.querySelector('[data-event-type="tool_call"]')).toBeTruthy();
  });

  it("renders a tool_result error", () => {
    render(<EventItem event={ev("tool_result", { callId: "c1", ok: false, error: "not_found" })} />);
    expect(screen.getByText(/not_found/)).toBeTruthy();
  });

  it("renders a limit notice", () => {
    render(<EventItem event={ev("limit", { kind: "iteration_limit", value: 2 })} />);
    expect(screen.getByText("iteration_limit")).toBeTruthy();
  });

  it("renders a result outcome", () => {
    render(<EventItem event={ev("result", { outcome: "success", reason: "done" })} />);
    expect(screen.getByText("success")).toBeTruthy();
  });

  it("distinguishes types via a data attribute", () => {
    const { container } = render(<EventItem event={ev("refusal", { action: "rm -rf /", reason: "destructive" })} />);
    expect(container.querySelector('[data-event-type="refusal"]')).toBeTruthy();
  });
});
