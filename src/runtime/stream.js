// SSE subscription wrapper over the browser EventSource. EventSource natively
// reconnects and resends Last-Event-ID; the backend replays from that seq, so the
// consumer gets gap-free resume. Dedupe on seq happens in the reducer (useRun).

import { eventsUrl } from "./api.js";

/**
 * Subscribe to a run's live event stream.
 * @param {string} runId
 * @param {object} handlers { onEvent(envelope), onConnection("open"|"reconnecting"|"closed") }
 * @returns {{ close(): void }}
 */
export function subscribeRun(runId, { onEvent, onConnection } = {}) {
  const es = new EventSource(eventsUrl(runId));
  let closed = false;

  es.onopen = () => onConnection?.("open");

  es.onmessage = (e) => {
    if (!e.data) return;
    try {
      onEvent?.(JSON.parse(e.data));
    } catch {
      // ignore malformed frames
    }
  };

  es.onerror = () => {
    // EventSource auto-reconnects unless we closed it. A terminal run ends with the
    // server closing the stream, which also lands here — the reducer's terminal state
    // tells the caller when to stop; here we just report transport state.
    if (!closed) onConnection?.("reconnecting");
  };

  return {
    close() {
      closed = true;
      es.close();
      onConnection?.("closed");
    },
  };
}
