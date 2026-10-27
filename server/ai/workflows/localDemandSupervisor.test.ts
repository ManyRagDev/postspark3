import { afterEach, describe, expect, it, vi } from "vitest";
import { DemandSupervisor, type DemandDeps } from "./localDemandSupervisor";
import type { RequestRecord } from "./generationStore";
const record = (overrides: Partial<RequestRecord> = {}): RequestRecord => ({
  id: "r",
  ownerId: "u",
  status: "queued",
  deadlineAt: Date.now() + 600000,
  billingMode: "unlimited",
  proposals: [],
  input: {} as any,
  inputHash: "h",
  experimental: false,
  ...overrides,
});
function fixture(initial: RequestRecord | null = null) {
  let current = initial;
  const deps: DemandDeps = {
    read: vi.fn(async () => current),
    recover: vi.fn(async () => (current ? [current] : [])),
    reconcile: vi.fn(async () => {}),
    run: vi.fn(async () => {
      current = record({ status: "completed" });
    }),
    failed: vi.fn(async () => {}),
  };
  return {
    deps,
    supervisor: new DemandSupervisor(deps),
    set: (r: RequestRecord) => {
      current = r;
    },
  };
}
afterEach(() => vi.useRealTimers());
describe("demand supervisor", () => {
  it("performs one recovery and no work during thirty idle minutes", async () => {
    vi.useFakeTimers();
    const { supervisor, deps } = fixture();
    await supervisor.recover();
    await vi.advanceTimersByTimeAsync(30 * 60000);
    expect(deps.recover).toHaveBeenCalledTimes(1);
    expect(deps.read).not.toHaveBeenCalled();
    expect(deps.reconcile).not.toHaveBeenCalled();
    expect(deps.run).not.toHaveBeenCalled();
    supervisor.stop();
  });
  it("executes on demand and stops reading after completion", async () => {
    vi.useFakeTimers();
    const { supervisor, deps } = fixture(record());
    supervisor.enqueue("r");
    await vi.advanceTimersByTimeAsync(1);
    expect(deps.run).toHaveBeenCalledTimes(1);
    const reads = vi.mocked(deps.read).mock.calls.length;
    await vi.advanceTimersByTimeAsync(30 * 60000);
    expect(deps.read).toHaveBeenCalledTimes(reads);
    supervisor.stop();
  });
  it("waits for an existing lease instead of polling it", async () => {
    vi.useFakeTimers();
    const f = fixture(
      record({ status: "running", leaseUntil: Date.now() + 90000 })
    );
    f.supervisor.enqueue("r");
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(80000);
    expect(f.deps.read).toHaveBeenCalledTimes(1);
    expect(f.deps.run).not.toHaveBeenCalled();
    f.set(record());
    await vi.advanceTimersByTimeAsync(11000);
    expect(f.deps.run).toHaveBeenCalledTimes(1);
    f.supervisor.stop();
  });
  it("bounds dispatch retries and reports failure", async () => {
    vi.useFakeTimers();
    const f = fixture(record());
    vi.mocked(f.deps.run).mockRejectedValue(new Error("spawn failed"));
    f.supervisor.enqueue("r");
    await vi.advanceTimersByTimeAsync(60000);
    expect(f.deps.run).toHaveBeenCalledTimes(6);
    expect(f.deps.failed).toHaveBeenCalledTimes(1);
    f.supervisor.stop();
  });
});
