import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ENV } from "../_core/env";
import { localCatalogRevisionOverride } from "./localCatalogOverride";
const original = {localCatalogRevision: ENV.localCatalogRevision, generationWorkerMode: ENV.generationWorkerMode, localDemandEnabled: ENV.localDemandEnabled, isProduction: ENV.isProduction};
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("VERCEL", "");
  Object.assign(ENV, {localCatalogRevision: "22", generationWorkerMode: "local-demand", localDemandEnabled: true, isProduction: false});
});
afterEach(() => { Object.assign(ENV, original); vi.unstubAllEnvs(); });
describe("development-only catalog admission override", () => {
  it("pins the configured revision only for explicit local-demand activation", () => {
    expect(localCatalogRevisionOverride()).toBe("22");
    ENV.localDemandEnabled=false; expect(localCatalogRevisionOverride()).toBeUndefined();
  });
  it.each(["production", "test"])("ignores the override in NODE_ENV=%s", mode => {
    vi.stubEnv("NODE_ENV",mode); expect(localCatalogRevisionOverride()).toBeUndefined();
  });
  it("ignores hosted/external execution and preserves the unset default", () => {
    vi.stubEnv("VERCEL","1"); expect(localCatalogRevisionOverride()).toBeUndefined();
    vi.stubEnv("VERCEL",""); ENV.generationWorkerMode="external"; expect(localCatalogRevisionOverride()).toBeUndefined();
    ENV.generationWorkerMode="local-demand"; ENV.localCatalogRevision=""; expect(localCatalogRevisionOverride()).toBeUndefined();
  });
  it("does not silently fall back to active after an invalid local pin", () => {
    ENV.localCatalogRevision="2 or 1=1"; expect(() => localCatalogRevisionOverride()).toThrow("catalog_revision_invalid");
  });
});
