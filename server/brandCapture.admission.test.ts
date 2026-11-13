import { afterEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ prior: { id: "capture", normalized_url: "https://example.com/" }, publicUrl: vi.fn(), rpc: vi.fn() }));
vi.mock("./db", () => ({ getDb: () => ({
  from: () => { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: h.prior, error: null }) }; return q; },
  rpc: h.rpc,
}) }));
vi.mock("./publicUrl", () => ({ publicUrl: h.publicUrl }));
vi.mock("./siteIntelligence", () => ({ analyzeSiteIntelligence: vi.fn() }));
import { startCapture } from "./brandCapture";
import { ENV } from "./_core/env";
const original = { paused: ENV.generationAdmissionPaused, enabled: ENV.aiSiteIntelligenceEnabled };
afterEach(() => {
  ENV.generationAdmissionPaused = original.paused;
  ENV.aiSiteIntelligenceEnabled = original.enabled;
  vi.clearAllMocks();
});
it("recovers a paused capture only when its normalized URL matches, without DNS or provider calls", async () => {
  ENV.generationAdmissionPaused = true; ENV.aiSiteIntelligenceEnabled = true;
  expect(await startCapture("owner", { idempotencyKey: "same-key", url: "EXAMPLE.com/#fragment", refresh: false })).toBe(h.prior);
  await expect(startCapture("owner", { idempotencyKey: "same-key", url: "https://different.example/", refresh: false })).rejects.toThrow("Idempotency input conflict");
  expect(h.publicUrl).not.toHaveBeenCalled();
  expect(h.rpc).not.toHaveBeenCalled();
});
