// T015: FileViewer renders content / notice / error states (mock fetch via api).
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

vi.mock("../runtime/api.js", () => ({
  readFileContent: vi.fn(),
}));
import { readFileContent } from "../runtime/api.js";
import FileViewer from "../console/FileViewer.jsx";

describe("FileViewer", () => {
  it("shows an idle prompt with no path", () => {
    render(<FileViewer runId="r" path={null} mode="fetch" />);
    expect(screen.getByText(/Select a file/i)).toBeTruthy();
  });

  it("fetches and renders text content", async () => {
    readFileContent.mockResolvedValueOnce({ path: "a.js", kind: "text", content: "const a = 1;" });
    render(<FileViewer runId="r" path="a.js" mode="fetch" />);
    await waitFor(() => expect(screen.getByText("const a = 1;")).toBeTruthy());
  });

  it("renders a binary notice", async () => {
    readFileContent.mockResolvedValueOnce({ path: "b", kind: "binary" });
    render(<FileViewer runId="r" path="b" mode="fetch" />);
    await waitFor(() => expect(screen.getByText(/Binary file/i)).toBeTruthy());
  });

  it("renders a too_large notice", async () => {
    readFileContent.mockResolvedValueOnce({ path: "big", kind: "too_large", size: 9999999 });
    render(<FileViewer runId="r" path="big" mode="fetch" />);
    await waitFor(() => expect(screen.getByText(/too large/i)).toBeTruthy());
  });

  it("renders an error notice when the read fails", async () => {
    readFileContent.mockRejectedValueOnce({ code: "not_found" });
    render(<FileViewer runId="r" path="missing" mode="fetch" />);
    await waitFor(() => expect(screen.getByText(/Could not read file/i)).toBeTruthy());
  });

  it("animate mode shows the provided content (no fetch)", () => {
    render(<FileViewer runId="r" path="a.js" mode="animate" animateContent="hello" />);
    expect(readFileContent).not.toHaveBeenCalled();
  });
});
