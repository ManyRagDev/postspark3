import { expect, it, vi } from "vitest";
import { durableOperations } from "./generationRuntime";
import type { GenerationStore, RequestRecord } from "./generationStore";
import { withProviderFailureObserver } from "./providerCooldown";

function setup() {
  let state: "new" | "uncertain" = "new";
  const markOperationUncertain = vi.fn(async () => { state = "uncertain"; });
  const store = { beginOperation: async () => ({ state }), markOperationUncertain } as unknown as GenerationStore;
  const record = { id: "test-provider-wait", deadlineAt: Date.now() + 60_000 } as RequestRecord;
  return { run: durableOperations(store, record, "lease", new AbortController().signal), markOperationUncertain };
}

it("awaits the persisted provider wait at the failing operation, before other work completes", async () => {
  const s = setup(), order: string[] = [];
  let persist!: () => void, observationStarted!: () => void, finishSibling!: () => void;
  const persisted = new Promise<void>(resolve => { persist = resolve; });
  const observing = new Promise<void>(resolve => { observationStarted = resolve; });
  const sibling = new Promise<void>(resolve => { finishSibling = resolve; });
  const rejection = Object.assign(new Error("provider rejected"), { name: "ProviderRequestError", status: 401 });
  let jobFinished = false;
  const job = withProviderFailureObserver(async kind => {
    order.push(kind); observationStarted(); await persisted; order.push("persisted");
  }, async () => {
    await expect(s.run("paid:copy", async () => { throw rejection; })).rejects.toBe(rejection);
    order.push("journal");
    await sibling;
    jobFinished = true;
  });
  await observing;
  expect(s.markOperationUncertain).not.toHaveBeenCalled();
  persist();
  await vi.waitFor(() => expect(s.markOperationUncertain).toHaveBeenCalledOnce());
  expect(order).toEqual(["credentials", "persisted", "journal"]);
  expect(jobFinished).toBe(false);
  finishSibling(); await job;
});

it("retains the original provider error and journal fence even if cooldown persistence fails", async () => {
  const s = setup();
  const rejection = Object.assign(new Error("provider rejected"), { name: "ProviderRequestError", status: 429 });
  const effect = vi.fn(async () => { throw rejection; });
  await withProviderFailureObserver(async () => { throw new Error("database offline"); }, async () => {
    await expect(s.run("paid:copy", effect)).rejects.toBe(rejection);
  });
  expect(s.markOperationUncertain).toHaveBeenCalledOnce();
  await expect(s.run("paid:copy", effect)).rejects.toThrow(/reconciliation/);
  expect(effect).toHaveBeenCalledOnce();
});
