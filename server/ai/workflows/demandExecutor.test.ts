import { afterEach, describe, expect, it, vi } from "vitest";
import { createDemandExecutor } from "./demandExecutor";

afterEach(() => vi.useRealTimers());
describe("demand executor ownership and recovery", () => {
  it("performs only 12 residual scans during an idle hour, with no heartbeat or frequent claim", async () => {
    vi.useFakeTimers();
    const runOne = vi.fn(async () => false), reconcile = vi.fn(async () => {});
    const executor = createDemandExecutor({ runOne, reconcile, schedule: async () => null, onError: vi.fn() });
    executor.reconnected(); await executor.settled();
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(executor.metrics.safetyScans).toBe(12);
    expect(reconcile).toHaveBeenCalledTimes(13);
    expect(runOne).toHaveBeenCalledTimes(26);
    await executor.stop();
  });
  it("coalesces duplicate signals, drains arrivals during work and alternates queues", async () => {
    const queues = { generation: [1, 2], capture: [1, 2, 3] }, order: string[] = [];
    let unblock!: () => void;
    const wait = new Promise<void>(resolve => { unblock = resolve; });
    const executor = createDemandExecutor({
      runOne: async kind => {
        if (!queues[kind].shift()) return false;
        order.push(kind);
        if (order.length === 1) await wait;
        return true;
      }, reconcile: async () => {}, schedule: async () => null, onError: vi.fn(),
    });
    executor.reconnected();
    for (let i = 0; i < 50; i++) executor.notify();
    unblock(); await executor.settled();
    expect(order).toEqual(["generation", "capture", "generation", "capture", "capture"]);
    expect(executor.metrics.executions).toBe(5);
    await executor.stop();
  });
  it("does not query while disconnected, and reconstructs a persisted deadline on reconnect", async () => {
    vi.useFakeTimers();
    const runOne = vi.fn(async () => false), reconcile = vi.fn(async () => {});
    let deadline: number | null = Date.now() + 30_000;
    const executor = createDemandExecutor({ runOne, reconcile, schedule: async () => deadline, onError: vi.fn() });
    executor.reconnected(); await executor.settled();
    executor.disconnected();
    await vi.advanceTimersByTimeAsync(90_000);
    expect(reconcile).toHaveBeenCalledTimes(1);
    deadline = Date.now() + 10_000;
    executor.reconnected(); await executor.settled();
    deadline = null;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(reconcile).toHaveBeenCalledTimes(3);
    await executor.stop();
  });
  it("does not let duplicate notifications bypass infrastructure backoff", async () => {
    vi.useFakeTimers();
    const failure = vi.fn();
    const reconcile = vi.fn(async () => { throw new Error("offline"); });
    const executor = createDemandExecutor({ reconcile, runOne: async () => false, schedule: async () => null, onError: failure, random: () => 0.5 });
    executor.reconnected(); await executor.settled();
    for (let i = 0; i < 20; i++) executor.notify();
    await vi.advanceTimersByTimeAsync(4_999);
    expect(reconcile).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(reconcile).toHaveBeenCalledTimes(2);
    expect(executor.healthy).toBe(false);
    await executor.stop();
  });
  it("marks dependencies recovered before a healthy backlog completes", async () => {
    let unblock!: () => void, markStarted!: () => void;
    const wait = new Promise<void>(resolve => { unblock = resolve; });
    const started = new Promise<void>(resolve => { markStarted = resolve; });
    const recovered = vi.fn();
    let hasWork = true;
    const executor = createDemandExecutor({
      reconcile: async () => {}, schedule: async () => null, onError: vi.fn(), onRecovered: recovered,
      runOne: async () => { if (!hasWork) return false; hasWork = false; markStarted(); await wait; return true; },
    });
    executor.reconnected(); await started;
    expect(recovered).toHaveBeenCalledOnce();
    expect(executor.healthy).toBe(true);
    expect(executor.active).toBe(true);
    unblock(); await executor.settled(); await executor.stop();
  });
  it("does not advertise recovery or start work when initial metadata validation fails", async () => {
    const recovered = vi.fn(), runOne = vi.fn(async () => false);
    const executor = createDemandExecutor({ reconcile: async () => {}, runOne,
      schedule: async () => { throw new Error("wrong database"); }, onError: vi.fn(), onRecovered: recovered });
    executor.reconnected(); await executor.settled();
    expect(recovered).not.toHaveBeenCalled();
    expect(runOne).not.toHaveBeenCalled();
    expect(executor.healthy).toBe(false);
    await executor.stop();
  });
  it("waits for active work at shutdown and never claims the next queue", async () => {
    let unblock!: () => void;
    const wait = new Promise<void>(resolve => { unblock = resolve; });
    let markStarted!: () => void;
    const started = new Promise<void>(resolve => { markStarted = resolve; });
    const runOne = vi.fn(async () => { markStarted(); await wait; return true; });
    const executor = createDemandExecutor({ runOne, reconcile: async () => {}, schedule: async () => null, onError: vi.fn() });
    executor.reconnected();
    await started;
    const stopping = executor.stop();
    unblock(); await stopping;
    expect(runOne).toHaveBeenCalledTimes(1);
    expect(executor.healthy).toBe(false);
  });
});
