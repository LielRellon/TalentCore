// In-process EventBus for a single run. Assigns a monotonic per-run `seq` and a
// timestamp to every event, then fans out to subscribers (JSONL store, SSE clients).
// Implements Principle IV: every step of the loop is observable.

export class EventBus {
  constructor(runId) {
    this.runId = runId;
    this.seq = 0;
    this.subscribers = new Set();
  }

  /**
   * Emit an event. Returns the fully-formed event envelope.
   * @param {string} type  one of the contract event types
   * @param {object} data  type-specific payload
   */
  emit(type, data = {}) {
    const event = {
      seq: this.seq++,
      ts: new Date().toISOString(),
      runId: this.runId,
      type,
      data,
    };
    for (const fn of this.subscribers) {
      try {
        fn(event);
      } catch {
        // A faulty subscriber must never break the run or other subscribers.
      }
    }
    return event;
  }

  /** Subscribe to events. Returns an unsubscribe function. */
  subscribe(fn) {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  unsubscribe(fn) {
    this.subscribers.delete(fn);
  }
}
