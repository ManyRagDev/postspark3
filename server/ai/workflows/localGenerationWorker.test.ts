import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ recover: vi.fn(), fork: vi.fn() }));
vi.mock("./localDemandSupervisor", () => ({
  startDemandRecovery: mocks.recover,
}));
vi.mock("node:child_process", () => ({ fork: mocks.fork }));
import { ENV } from "../../_core/env";
import { startLocalGenerationWorker } from "./localGenerationWorker";
const original = ENV.generationWorkerMode;
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  ENV.generationWorkerMode = original;
});
describe("demand bootstrap", () => {
  it("recovers once without spawning Chromium or a queue loop", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL", "");
    ENV.generationWorkerMode = "local-demand";
    expect(startLocalGenerationWorker()).toBeUndefined();
    expect(mocks.recover).toHaveBeenCalledTimes(1);
    expect(mocks.fork).not.toHaveBeenCalled();
  });
  it.each(["production", "test"])("does not bootstrap in %s", env => {
    vi.stubEnv("NODE_ENV", env);
    ENV.generationWorkerMode = "local-demand";
    startLocalGenerationWorker();
    expect(mocks.recover).not.toHaveBeenCalled();
  });
  it("preserves external execution", () => {
    vi.stubEnv("NODE_ENV", "development");
    ENV.generationWorkerMode = "external";
    startLocalGenerationWorker();
    expect(mocks.recover).not.toHaveBeenCalled();
  });
});
