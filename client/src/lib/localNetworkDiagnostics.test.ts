// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { installLocalNetworkDiagnostics } from "./localNetworkDiagnostics";
const sockets: any[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  sockets.length = 0;
  vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
  vi.stubGlobal("location", new URL("http://localhost:3000/thevoid"));
  vi.stubGlobal(
    "EventSource",
    class {
      onmessage: any;
      onerror: any;
      close = vi.fn();
      constructor(public url: string) {
        sockets.push(this);
      }
    }
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("original-response", { status: 200 }))
  );
  Object.defineProperty(navigator, "sendBeacon", {
    configurable: true,
    value: vi.fn(() => true),
  });
});
afterEach(() => {
  (window as any).__postsparkLocalNetworkDiagnostics?.stop();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("shares one observer across installations and leaves Supabase credentials, response bodies and cross-origin headers untouched", async () => {
  const native = vi.mocked(fetch);
  installLocalNetworkDiagnostics();
  installLocalNetworkDiagnostics();
  expect(sockets).toHaveLength(1);
  sockets[0].onmessage({
    data: JSON.stringify({
      id: "e436481f-3728-4a55-af91-31553d205157",
      start: Date.now(),
      until: Date.now() + 60_000,
      scenario: "observed",
    }),
  });
  const response = await fetch(
    "https://example.supabase.co/auth/v1/user?token=private-query",
    { headers: { Authorization: "Bearer private-token" } }
  );
  expect(await response.text()).toBe("original-response");
  expect(native.mock.calls[0][1]).toEqual({
    headers: { Authorization: "Bearer private-token" },
  });
  await fetch("/api/trpc/auth.me", {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  const init = native.mock.calls[1][1]!;
  expect(init.credentials).toBe("include");
  expect(new Headers(init.headers).get("X-PostSpark-Tab-ID")).toMatch(
    /^[\da-f-]{36}$/
  );
  await vi.advanceTimersByTimeAsync(10_000);
  const blobs = vi
    .mocked(navigator.sendBeacon)
    .mock.calls.map(c => c[1] as Blob);
  const saved = (await Promise.all(blobs.map(b => b.text()))).join("\n");
  expect(saved).not.toContain("private-token");
  expect(saved).not.toContain("private-query");
  expect(saved).toContain('"endpoint":"/auth/v1/user"');
});
it("records presence only in a bounded active capture and does no idle remote polling", async () => {
  const native = vi.mocked(fetch);
  installLocalNetworkDiagnostics();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(native).not.toHaveBeenCalled();
  expect(navigator.sendBeacon).not.toHaveBeenCalled();
  sockets[0].onmessage({
    data: JSON.stringify({
      id: "e436481f-3728-4a55-af91-31553d205157",
      start: Date.now(),
      until: Date.now() + 30_000,
      scenario: "observed",
    }),
  });
  await vi.advanceTimersByTimeAsync(40_000);
  const count = vi.mocked(navigator.sendBeacon).mock.calls.length;
  await vi.advanceTimersByTimeAsync(60_000);
  expect(navigator.sendBeacon).toHaveBeenCalledTimes(count);
  expect(native).not.toHaveBeenCalled();
});
it("limits local control reconnections and cleans up subscriptions", async () => {
  installLocalNetworkDiagnostics();
  for (const delay of [1000, 2000, 5000]) {
    sockets.at(-1).onerror();
    await vi.advanceTimersByTimeAsync(delay);
  }
  sockets.at(-1).onerror();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(sockets).toHaveLength(4);
  (window as any).__postsparkLocalNetworkDiagnostics.stop();
  expect(sockets.at(-1).close).toHaveBeenCalled();
});

it("does not present a cached or timing-restricted resource body as transferred bytes",async()=>{
  let callback:any;
  vi.stubGlobal("PerformanceObserver",class{constructor(cb:any){callback=cb;}observe(){}disconnect(){}});
  installLocalNetworkDiagnostics();
  sockets[0].onmessage({data:JSON.stringify({id:"e436481f-3728-4a55-af91-31553d205157",start:Date.now(),until:Date.now()+30_000,scenario:"observed"})});
  callback({getEntries:()=>[{name:"https://example.supabase.co/storage/v1/object/private/secret.png?token=private",encodedBodySize:12345,transferSize:0,duration:2}]});
  await vi.advanceTimersByTimeAsync(10_000);
  const saved=(await Promise.all(vi.mocked(navigator.sendBeacon).mock.calls.map(c=>(c[1] as Blob).text()))).join("\n");
  expect(saved).toContain('"kind":"resource"');expect(saved).toContain('"responseBodyBytes":null');expect(saved).not.toContain("12345");expect(saved).not.toContain("secret.png");
});
