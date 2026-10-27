import { useCallback, useEffect, useRef, useState } from "react";
import { ensureSessionForRequest } from "@/lib/authBridge";
export type ProgressEvent = {
  requestId: string;
  status: string;
  error?: string;
  proposals: Array<{ proposalId: string; revision: number; status: string }>;
};
export function useGenerationEvents(
  id: string | null,
  enabled: boolean,
  onEvent: (event: ProgressEvent) => void,
  onConnect: () => void
) {
  const eventRef = useRef(onEvent),
    connectRef = useRef(onConnect);
  eventRef.current = onEvent;
  connectRef.current = onConnect;
  const [error, setError] = useState(false),
    [epoch, setEpoch] = useState(0);
  const reconnect = useCallback(() => setEpoch(n => n + 1), []);
  useEffect(() => {
    setError(false);
    if (!id || !enabled) return;
    let stream: EventSource | undefined,
      timer: ReturnType<typeof setTimeout> | undefined,
      stopped = false,
      attempt = 0,
      sequence = 0;
    const close = () => {
      sequence++;
      stream?.close();
      stream = undefined;
      if (timer) clearTimeout(timer);
    };
    const failed = () => {
      close();
      if (stopped || document.hidden) return;
      const delay = [1000, 2000, 5000][attempt++];
      if (delay === undefined) {
        setError(true);
        return;
      }
      timer = setTimeout(() => void open(), delay);
    };
    const open = async () => {
      if (stopped || document.hidden) return;
      const ticket = ++sequence;
      try {
        await ensureSessionForRequest();
        if (stopped || document.hidden || ticket !== sequence) return;
        stream = new EventSource(
          `/api/generation/events/${encodeURIComponent(id)}`,
          { withCredentials: true }
        );
        stream.addEventListener("connected", () => {
          if (ticket !== sequence) return;
          setError(false);
          connectRef.current();
        });
        stream.onmessage = message => {
          if (ticket !== sequence) return;
          try {
            const event = JSON.parse(message.data);
            if (event.requestId === id) eventRef.current(event);
          } catch {
            failed();
          }
        };
        stream.onerror = () => {
          if (ticket === sequence) failed();
        };
      } catch {
        failed();
      }
    };
    const visibility = () => {
      close();
      if (!document.hidden) {
        attempt = 0;
        void open();
      }
    };
    const sessionEnded = () => {
      stopped = true;
      close();
    };
    const storage = (event: StorageEvent) => {
      if (event.key === "postspark.session-epoch") sessionEnded();
    };
    window.addEventListener("postspark:session-ended", sessionEnded);
    window.addEventListener("storage", storage);
    document.addEventListener("visibilitychange", visibility);
    void open();
    return () => {
      stopped = true;
      close();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("postspark:session-ended", sessionEnded);
      window.removeEventListener("storage", storage);
    };
  }, [id, enabled, epoch]);
  return { error, reconnect };
}
