"use client";

import { useEffect, useRef, useState } from "react";
import type { IngestEvent } from "./events";

/**
 * Subscribes to the API's server-sent events. The API sends named events ("sync.progress",
 * "ingest.received"), which `EventSource.onmessage` never sees, so each name is listened for directly.
 */
export function useIngestStream(): { live: boolean; event: IngestEvent | null } {
  const [live, setLive] = useState(true);
  const [event, setEvent] = useState<IngestEvent | null>(null);
  const seq = useRef(0);
  const lastId = useRef<{ id: string; at: number } | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/events/stream");
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);

    const handle = (e: MessageEvent) => {
      try {
        const raw = JSON.parse(e.data)?.event;
        if (!raw?.id) return;
        const now = Date.now();
        // a replayed event can arrive as both "ingest.received" and "sync.progress"
        if (lastId.current && lastId.current.id === raw.id && now - lastId.current.at < 1500) return;
        lastId.current = { id: raw.id, at: now };
        seq.current += 1;
        setEvent({ ...raw, text: raw.text ?? "", refs: raw.refs ?? {}, seq: seq.current });
      } catch {
        // ignore malformed frames
      }
    };

    es.addEventListener("sync.progress", handle);
    es.addEventListener("ingest.received", handle);
    return () => es.close();
  }, []);

  return { live, event };
}
