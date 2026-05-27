// T006: typing reveal ends exactly on target; interruptible.
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTypingReveal } from "../console/useTypingReveal.js";

afterEach(() => vi.useRealTimers());

describe("useTypingReveal", () => {
  it("reveals progressively and ends byte-for-byte equal to target", () => {
    vi.useFakeTimers();
    const target = "hello world this is the agent typing";
    const { result } = renderHook(() => useTypingReveal(target, { play: true, speed: 4 }));
    expect(result.current.shown.length).toBeLessThan(target.length); // not all at once
    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current.shown).toBe(target); // final equals target exactly
    expect(result.current.done).toBe(true);
  });

  it("skip() immediately shows full text", () => {
    vi.useFakeTimers();
    const target = "abcdefghij";
    const { result } = renderHook(() => useTypingReveal(target, { play: true, speed: 1 }));
    act(() => { result.current.skip(); });
    expect(result.current.shown).toBe(target);
  });

  it("play:false shows full text without animating", () => {
    const target = "full content";
    const { result } = renderHook(() => useTypingReveal(target, { play: false }));
    expect(result.current.shown).toBe(target);
    expect(result.current.done).toBe(true);
  });

  it("empty target stays empty and done", () => {
    const { result } = renderHook(() => useTypingReveal("", { play: true }));
    expect(result.current.shown).toBe("");
    expect(result.current.done).toBe(true);
  });
});
