import { afterEach, expect, it, vi } from "vitest";
import { ENV } from "../../_core/env";
import { isDemandWorkerReady } from "./workerReadiness";
const original = ENV.generationWorkerReadinessUrl;
afterEach(() => { ENV.generationWorkerReadinessUrl = original; });
it("fails closed without a configured local readiness endpoint", async () => {
  ENV.generationWorkerReadinessUrl = "";
  const fetcher = vi.fn();
  expect(await isDemandWorkerReady(fetcher)).toBe(false);
  expect(fetcher).not.toHaveBeenCalled();
});
it.each([
  [200, { ready: true, transport: "postgres-notify", contractVersion: 1 }, true],
  [503, { ready: true, transport: "postgres-notify", contractVersion: 1 }, false],
  [200, { ready: false, transport: "postgres-notify", contractVersion: 1 }, false],
  [200, { ready: true, transport: "heartbeat", contractVersion: 1 }, false],
])("validates readiness contract status %i", async (status, body, expected) => {
  ENV.generationWorkerReadinessUrl = "http://127.0.0.1:9465/readyz";
  const fetcher = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  expect(await isDemandWorkerReady(fetcher)).toBe(expected);
});
