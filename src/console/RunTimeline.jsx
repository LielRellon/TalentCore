// Ordered event list. Auto-scrolls to the latest event unless the user has scrolled up.
import { useEffect, useRef, useState } from "react";
import EventItem from "./EventItem.jsx";

export default function RunTimeline({ events }) {
  const endRef = useRef(null);
  const containerRef = useRef(null);
  const [stick, setStick] = useState(true);

  useEffect(() => {
    if (stick) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events.length, stick]);

  const onScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setStick(atBottom);
  };

  return (
    <div className="timeline" ref={containerRef} onScroll={onScroll}>
      {events.length === 0 && <div className="timeline-empty">Waiting for the agent…</div>}
      {events.map((e) => (
        <EventItem key={e.seq} event={e} />
      ))}
      <div ref={endRef} />
    </div>
  );
}
