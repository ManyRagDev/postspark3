import {
  diagnosticEndpoint,
  diagnosticPage,
  diagnosticId,
  type NetworkCapture,
} from "@shared/networkDiagnostics";

/** Development only. No bodies/tokens retained; cross-origin requests receive no added headers. */
export function installLocalNetworkDiagnostics() {
  if (
    !import.meta.env.DEV ||
    typeof window === "undefined" ||
    typeof EventSource === "undefined" ||
    typeof globalThis.crypto?.randomUUID !== "function" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(location.hostname)
  )
    return;
  const key = "__postsparkLocalNetworkDiagnostics";
  const globals = window as typeof window & { [key]?: { stop: () => void } };
  if (globals[key]) return;
  const nativeFetch = globalThis.fetch.bind(globalThis),
    pageInstanceId = crypto.randomUUID();
  const tabId = (() => {
    try {
      const saved = diagnosticId(sessionStorage.getItem("postspark.diagnostics.tab"));
      if (saved) return saved;
      const id = crypto.randomUUID();
      sessionStorage.setItem("postspark.diagnostics.tab", id);
      return id;
    } catch {
      return crypto.randomUUID();
    }
  })();
  let capture: NetworkCapture | null = null,
    events: Record<string, unknown>[] = [],
    closed = false,
    failures = 0;
  let heartbeat: ReturnType<typeof setInterval> | undefined,
    expiry: ReturnType<typeof setTimeout> | undefined,
    retry: ReturnType<typeof setTimeout> | undefined;
  let source: EventSource | undefined;
  const supabaseOrigin = (() => {
    try {
      return new URL(import.meta.env.VITE_SUPABASE_URL).origin;
    } catch {
      return "";
    }
  })();
  const endpoint = "/api/_local/diagnostics/";
  const state = () => ({
    at: Date.now(),
    page: diagnosticPage(location.pathname),
    visibility: document.visibilityState,
  });
  const flush = () => {
    if (!capture || !events.length) return;
    const body = JSON.stringify({
      captureId: capture.id,
      tabId,
      pageInstanceId,
      events: events.splice(0, 100),
    });
    // Same-machine telemetry only; excluded from application request counts.
    let queued=false;
    try{queued=navigator.sendBeacon?.(endpoint+"browser",new Blob([body],{type:"application/json"}))??false;}catch{}
    if(!queued)
      void Promise.resolve().then(()=>nativeFetch(endpoint + "browser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        credentials: "omit",
        keepalive: true,
      })).catch(() =>
        console.warn("[diagnostics] Coleta local do navegador indisponível.")
      );
  };
  const push = (event: Record<string, unknown>) => {
    if (!capture || Date.now() > capture.until) return;
    events.push({ ...state(), ...event });
    if (events.length >= 50) flush();
  };
  const presence = () => {
    push({ kind: "presence" });
    flush();
  };
  const reset = (next: NetworkCapture | null) => {
    presence();
    clearInterval(heartbeat);
    clearTimeout(expiry);
    capture = next;
    events = [];
    if (!capture) return;
    presence();
    heartbeat = setInterval(presence, 10_000);
    expiry = setTimeout(
      () => reset(null),
      Math.max(0, capture.until - Date.now())
    );
  };
  const wrappedFetch: typeof fetch = async (input, init) => {
    if(closed)return nativeFetch(input,init);
    let url: URL;
    try {
      url = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
        location.href
      );
    } catch {
      return nativeFetch(input, init);
    }
    const backend =
      url.origin === location.origin &&
      url.pathname.startsWith("/api/") &&
      !url.pathname.startsWith(endpoint);
    const direct = url.origin === supabaseOrigin;
    if (!backend && !direct) return nativeFetch(input, init);
    const requestId = crypto.randomUUID(),
      started = performance.now(),
      measurement = capture?.id;
    let options = init;
    if(measurement){push({kind:"fetch",requestId,destination:direct?"supabase":"backend",endpoint:diagnosticEndpoint(url.href)});flush();}
    if (backend) {
      const headers = new Headers(
        init?.headers ?? (input instanceof Request ? input.headers : undefined)
      );
      headers.set("X-PostSpark-Request-ID", requestId);
      headers.set("X-PostSpark-Tab-ID", tabId);
      headers.set("X-PostSpark-Page-ID", pageInstanceId);
      headers.set("X-PostSpark-Visibility", document.visibilityState);
      options = { ...init, headers };
    }
    try {
      const response = await nativeFetch(input, options);
      if (measurement && capture?.id === measurement)
        push({
          kind: "fetch",
          requestId,
          destination: direct ? "supabase" : "backend",
          endpoint: diagnosticEndpoint(url.href),
          status: response.status,
          durationMs: Math.round(performance.now() - started),
        });
      return response;
    } catch (error) {
      if (measurement && capture?.id === measurement)
        push({
          kind: "fetch",
          requestId,
          destination: direct ? "supabase" : "backend",
          endpoint: diagnosticEndpoint(url.href),
          status: 0,
          durationMs: Math.round(performance.now() - started),
        });
      throw error;
    }
  };
  globalThis.fetch = wrappedFetch;
  const observer =
    typeof PerformanceObserver === "undefined"
      ? undefined
      : new PerformanceObserver(list => {
          for (const entry of list.getEntries() as PerformanceResourceTiming[]) {
            let url: URL;
            try {
              url = new URL(entry.name);
            } catch {
              continue;
            }
            const backend =
              url.origin === location.origin &&
              url.pathname.startsWith("/api/") &&
              !url.pathname.startsWith(endpoint);
            const direct = url.origin === supabaseOrigin;
            if (!backend && !direct) continue;
            push({
              kind: "resource",
              destination: direct ? "supabase" : "backend",
              endpoint: diagnosticEndpoint(url.href),
              durationMs: Math.round(entry.duration),
              // Cross-origin Timing-Allow-Origin restrictions are unknown bytes, never zero consumption.
              responseBodyBytes:
                entry.transferSize > 0 && entry.encodedBodySize >= 0 ? entry.encodedBodySize : null,
            });
          }
        });
  try {
    observer?.observe({ type: "resource", buffered: false });
  } catch {}
  const connect = () => {
    if (closed) return;
    source = new EventSource(endpoint + "events");
    source.onmessage = event => {
      try {
        const v = JSON.parse(event.data);
        if (
          v === null ||
          (diagnosticId(v.id) &&
            Number.isFinite(v.until) &&
            v.until > Date.now())
        ) {
          failures = 0;
          reset(v);
        }
      } catch {}
    };
    source.onerror = () => {
      source?.close();
      reset(null);
      if (failures >= 3) {
        console.warn(
          "[diagnostics] Canal local indisponível; recarregue para reconectar."
        );
        return;
      }
      retry = setTimeout(connect, [1000, 2000, 5000][failures++]);
    };
  };
  document.addEventListener("visibilitychange", presence);
  const stop = () => {
    presence();
    closed = true;
    capture=null;events=[];
    clearInterval(heartbeat);
    clearTimeout(expiry);
    clearTimeout(retry);
    source?.close();
    observer?.disconnect();
    document.removeEventListener("visibilitychange", presence);
    window.removeEventListener("pagehide",stop);
    if (globalThis.fetch === wrappedFetch) globalThis.fetch = nativeFetch;
    if(globals[key]?.stop===stop)delete globals[key];
  };
  globals[key] = { stop };
  window.addEventListener("pagehide", stop, { once: true });
  import.meta.hot?.dispose(stop);
  connect();
}
