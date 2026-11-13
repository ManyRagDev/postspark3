/** One owned drain, a durable deadline and a five-minute metadata safety scan.
 * LISTEN must be committed before start()/reconnected() is called. Notifications
 * are hints only: claims and the operation journal remain the execution fence.
 */
export interface DemandExecutorDependencies {
  runOne(kind: "generation" | "capture"): Promise<boolean>;
  reconcile(): Promise<void>;
  schedule(): Promise<number | null>;
  onError(error: unknown): void | number | Promise<void | number>;
  onRecovered?(): void;
  safetyScanMs?: number;
  now?: () => number;
  random?: () => number;
}

export function createDemandExecutor(deps: DemandExecutorDependencies) {
  const now = deps.now ?? Date.now;
  const random = deps.random ?? Math.random;
  const safetyScanMs = Math.max(60_000, deps.safetyScanMs ?? 300_000);
  let stopped = false, connected = false, dirty = false;
  let task: Promise<void> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let failures = 0, retryAt = 0;
  let nextKind: "generation" | "capture" = "generation";
  const metrics = { drains: 0, notifications: 0, safetyScans: 0, deadlineWakes: 0, failures: 0, executions: 0 };

  function arm(at: number | null) {
    if (timer) clearTimeout(timer);
    if (stopped || !connected) return;
    const delay = at === null ? safetyScanMs : Math.max(25, Math.min(safetyScanMs, at - now()));
    const safety = delay === safetyScanMs;
    timer = setTimeout(() => {
      timer = undefined;
      if (safety) metrics.safetyScans++; else metrics.deadlineWakes++;
      wake();
    }, delay);
  }

  async function drain() {
    try {
      do {
        dirty = false;
        metrics.drains++;
        await deps.reconcile();
        // Readiness means durable recovery/dependencies are consistent, not that
        // all queued jobs have completed. A long backlog must still admit work.
        await deps.schedule();
        failures = 0; retryAt = 0;
        deps.onRecovered?.();
        while (connected && !stopped) {
          // Alternate after every actual job; a stream of captures cannot starve generation.
          const first = nextKind;
          let ran = await deps.runOne(first);
          if (!ran && connected && !stopped) {
            nextKind = first === "generation" ? "capture" : "generation";
            ran = await deps.runOne(nextKind);
          }
          if (!ran) break;
          metrics.executions++;
          nextKind = nextKind === "generation" ? "capture" : "generation";
          // Expiry and settlement continue even while the other queue is busy.
          await deps.reconcile();
        }
        if (!connected || stopped) return;
        const deadline = await deps.schedule();
        failures = 0; retryAt = 0;
        deps.onRecovered?.();
        arm(deadline);
      } while (dirty && connected && !stopped);
    } catch (error) {
      metrics.failures++;
      failures++;
      // Infrastructure failures are retried, never the paid operation itself.
      // Signals do not bypass this backoff. Operation ambiguity is journal-owned.
      retryAt = now() + Math.min(300_000, 5_000 * 2 ** Math.min(failures - 1, 6)) * (0.8 + random() * 0.4);
      try {
        const persistedRetry = await deps.onError(error);
        if (typeof persistedRetry === "number" && Number.isFinite(persistedRetry))
          retryAt = Math.max(retryAt, persistedRetry);
      } catch { /* A dead DB cannot persist its own outage; reconnect retains local backoff. */ }
      arm(retryAt);
    }
  }

  function wake() {
    if (stopped || !connected) return;
    dirty = true;
    if (task) return;
    if (retryAt > now()) { arm(retryAt); return; }
    if (timer) clearTimeout(timer);
    task = drain().finally(() => { task = undefined; });
  }
  return {
    metrics,
    get connected() { return connected; },
    get healthy() { return connected && failures === 0 && !stopped; },
    get active() { return Boolean(task); },
    reconnected() { if (stopped) return; connected = true; wake(); },
    disconnected() { connected = false; if (timer) clearTimeout(timer); },
    notify() { metrics.notifications++; wake(); },
    async stop() { stopped = true; connected = false; if (timer) clearTimeout(timer); await task; },
    async settled() { await task; },
  };
}
