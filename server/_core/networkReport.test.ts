import { expect, it } from "vitest";
import { buildNetworkReport } from "../../scripts/diagnostics/network";
const capture = {
  id: "e436481f-3728-4a55-af91-31553d205157",
  scenario: "studio-visible",
  start: 0,
  until: 30_000,
};
const event = (ms: number, fields: any) => ({
  captureId: capture.id,
  at: new Date(ms).toISOString(),
  pid: 1,
  role: "backend",
  ...fields,
});
it("never calls a missing collector, absent browser, partial window or interrupted transfer zero-idle success", () => {
  expect(buildNetworkReport([], capture, 15_000).verdict).toBe(
    "PARTIAL_WINDOW"
  );
  expect(buildNetworkReport([], capture, 30_000).verdict).toBe(
    "INCOMPLETE_BACKEND_COVERAGE"
  );
  const pulses = [
    ...[0, 10_000, 20_000, 30_000].map(ms =>
      event(ms, { event: "collector.pulse" })
    ),
    event(30001, { event: "collector.seal", writeFailures: 0 }),
  ];
  expect(buildNetworkReport(pulses, capture, 30_000).verdict).toBe(
    "INCOMPLETE_BROWSER_COVERAGE"
  );
  const browser = [0, 10_000, 20_000, 30_000].map(ms =>
    event(ms, {
      event: "browser.presence",
      tabId: "tab",
      visibility: "visible",
    })
  );
  expect(
    buildNetworkReport([...pulses, ...browser], capture, 30_000).verdict
  ).toBe("NO_SUPABASE_HTTP_OBSERVED");
  expect(buildNetworkReport([...pulses,...browser,event(1000,{event:"browser.resource",destination:"supabase",endpoint:"/storage/v1/:object",responseBodyBytes:null})],capture,30_000).verdict).toBe("ACTIVITY_OBSERVED");
  expect(
    buildNetworkReport(
      [...pulses, ...browser, event(1000, { event: "collector.warning" })],
      capture,
      30_000
    ).verdict
  ).toBe("INCOMPLETE_INSTRUMENTATION");
  expect(
    buildNetworkReport(
      [...pulses.filter(x => x.event !== "collector.seal"), ...browser],
      capture,
      30_000
    ).verdict
  ).toBe("INCOMPLETE_LOG_DATA");
  const activity = event(1000, {
    event: "supabase.start",
    requestId: "one",
    endpoint: "/auth/v1/user",
    context: { source: "background" },
  });
  const report = buildNetworkReport(
    [...pulses, ...browser, activity],
    capture,
    30_000
  );
  expect(report.verdict).toBe("ACTIVITY_OBSERVED");
  expect(report.backend.unfinishedCalls).toBe(1);
});
it("separates browser from backend bytes, deduplicates completion, and exposes unknown sizes", () => {
  const all = [
    event(0, {
      event: "supabase.start",
      requestId: "one",
      endpoint: "/rest/v1/rpc/catalog_manifest",
    }),
    event(1000, {
      event: "supabase.end",
      requestId: "one",
      endpoint: "/rest/v1/rpc/catalog_manifest",
      requestBodyBytes: 2,
      responseBodyBytes: 42,
      durationMs: 1000,
      status: 200,
      complete: true,
    }),
    event(1000, {
      event: "supabase.end",
      requestId: "one",
      endpoint: "/rest/v1/rpc/catalog_manifest",
      requestBodyBytes: 2,
      responseBodyBytes: 42,
      durationMs: 1000,
      status: 200,
      complete: true,
    }),
    event(1500, { event: "browser.fetch", destination: "supabase" }),
    event(1800, {
      event: "browser.resource",
      destination: "supabase",
      responseBodyBytes: null,
    }),
  ];
  const r = buildNetworkReport(all, capture, 30_000);
  expect(r.backend.calls).toBe(1);
  expect(r.backend.responseBodyBytes).toBe(42);
  expect(r.backend.unfinishedCalls).toBe(0);
  expect(r.browser.directSupabaseFetches).toBe(1);
  expect(r.browser.unknownByteEntries).toBe(1);
});
