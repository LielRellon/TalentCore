// Progressive "typing" reveal of a target string — a presentation effect only.
// Invariant: when done (or skipped, or target changes), `shown` equals `target`
// byte-for-byte (FR-009). Interruptible: skip() reveals the full text immediately.
import { useEffect, useRef, useState } from "react";

/**
 * @param {string} target full text to reveal
 * @param {{ play?: boolean, speed?: number }} opts speed = chars per tick
 * @returns {{ shown: string, done: boolean, skip: () => void }}
 */
export function useTypingReveal(target, { play = true, speed = 8 } = {}) {
  const [count, setCount] = useState(play ? 0 : (target?.length ?? 0));
  const timer = useRef(null);

  useEffect(() => {
    clearInterval(timer.current);
    const full = target?.length ?? 0;
    if (!play || full === 0) {
      setCount(full); // no animation → show everything (and empty stays empty)
      return;
    }
    setCount(0);
    timer.current = setInterval(() => {
      setCount((c) => {
        const next = c + speed;
        if (next >= full) { clearInterval(timer.current); return full; }
        return next;
      });
    }, 16);
    return () => clearInterval(timer.current);
  }, [target, play, speed]);

  const skip = () => {
    clearInterval(timer.current);
    setCount(target?.length ?? 0);
  };

  const full = target?.length ?? 0;
  const shown = (target ?? "").slice(0, Math.min(count, full));
  return { shown, done: shown.length === full, skip };
}
