import { fork, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, writeFile, link, unlink } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { ENV } from "../../_core/env";
import { generationEvents, publishGenerationRecord } from "./generationEvents";
import {
  localRequest,
  localRequests,
  reconcileLocal,
  markDispatchError,
} from "./localDemandStore";
import type { RequestRecord } from "./generationStore";

export type DemandRecord=Pick<RequestRecord,"id"|"status"|"deadlineAt"|"leaseUntil"> & Partial<Pick<RequestRecord,"billingMode"|"billingSettledAt">>;
export type DemandDeps<T extends DemandRecord=RequestRecord> = {
  publish?:(record:T)=>void;
  read: (id: string) => Promise<T | null>;
  recover: () => Promise<T[]>;
  reconcile: (id: string) => Promise<void>;
  run: (id: string) => Promise<void | number>;
  failed: (id: string) => Promise<void>;
};
const delays = [1000, 2000, 5000, 10000, 30000];
export class DemandSupervisor<T extends DemandRecord=RequestRecord> {
  private pending = new Set<string>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private attempts = new Map<string, number>();
  private busy = false;
  private stopped = false;
  constructor(private deps: DemandDeps<T>) {}
  private publish(r:T){if(this.deps.publish)this.deps.publish(r);else publishGenerationRecord(r as unknown as RequestRecord);}
  async recover() {
    for (const r of await this.deps.recover()) this.enqueue(r.id);
  }
  enqueue(id: string) {
    if (this.stopped) return;
    this.attempts.delete(id);
    const t = this.timers.get(id);
    if (t) {
      clearTimeout(t);
      this.timers.delete(id);
    }
    this.pending.add(id);
    void this.drain();
  }
  private later(id: string, ms: number) {
    if (this.stopped) return;
    this.timers.set(
      id,
      setTimeout(
        () => {
          this.timers.delete(id);
          this.pending.add(id);
          void this.drain();
        },
        Math.max(1, ms)
      )
    );
  }
  private async drain() {
    if (this.busy || this.stopped) return;
    this.busy = true;
    try {
      while (this.pending.size && !this.stopped) {
        const id = this.pending.values().next().value!;
        this.pending.delete(id);
        try {
          await this.deps.reconcile(id);
          let r = await this.deps.read(id);
          if (this.stopped) break;
          if (!r) continue;
          if(r.status==="awaiting_reconciliation"){this.publish(r);this.later(id,r.deadlineAt-Date.now()+50);continue;}
          if (!["queued", "running"].includes(r.status)) {
            this.publish(r);
            if (r.billingMode === "reserved" && !r.billingSettledAt)
              throw new Error("billing_recovery_pending");
            this.attempts.delete(id);
            continue;
          }
          if (r.leaseUntil && r.leaseUntil > Date.now()) {
            this.later(
              id,
              Math.min(r.leaseUntil, r.deadlineAt) - Date.now() + 50
            );
            continue;
          }
          const blockedUntil = await this.deps.run(id);
          if (typeof blockedUntil === "number") {
            this.later(
              id,
              Math.min(blockedUntil, r.deadlineAt) - Date.now() + 50
            );
            continue;
          }
          r = await this.deps.read(id);
          if (r) {
            this.publish(r);
            if(r.status==="awaiting_reconciliation"){this.later(id,r.deadlineAt-Date.now()+50);continue;}
            if (
              ["queued", "running"].includes(r.status) ||
              (r.billingMode === "reserved" && !r.billingSettledAt)
            )
              throw new Error("request_pending");
          }
          this.attempts.delete(id);
        } catch (error) {
          const attempt = this.attempts.get(id) ?? 0;
          this.attempts.set(id, attempt + 1);
          if (attempt < delays.length) this.later(id, delays[attempt]);
          else {
            await this.deps.failed(id).catch(() => {});
            const pending = await this.deps.read(id).catch(() => null);
            if (pending) this.publish(pending);
            if (
              pending &&
              ["queued", "running"].includes(pending.status) &&
              pending.deadlineAt > Date.now()
            )
              this.later(id, pending.deadlineAt - Date.now() + 50);
            console.error(
              "[generation:dispatch] Retomada manual necessária",
              id,
              error instanceof Error ? error.message : "failed"
            );
          }
        }
      }
    } finally {
      this.busy = false;
    }
  }
  stop() {
    this.stopped = true;
    this.pending.clear();
    for (const t of Array.from(this.timers.values())) clearTimeout(t);
    this.timers.clear();
  }
}
let scopePromise: Promise<string> | undefined;
export function localExecutorScope() {
  return (scopePromise ??= (async () => {
    const dir = join(process.cwd(), ".postspark-local");
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const file = join(dir, "executor-id");
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, randomUUID(), { flag: "wx", mode: 0o600 });
    try {
      await link(temporary, file);
    } catch (error: any) {
      if (error.code !== "EEXIST") throw error;
    } finally {
      await unlink(temporary);
    }

    const id = (await readFile(file, "utf8")).trim();
    if (!/^[a-f0-9-]{36}$/.test(id))
      throw new Error("local_executor_identity_invalid");
    return id;
  })());
}
let closing = false;
let supervisor: DemandSupervisor | undefined;
let child: ChildProcess | undefined;
export async function getDemandSupervisor() {
  if (
    closing ||
    !ENV.localDemandEnabled ||
    ENV.generationWorkerMode !== "local-demand"
  )
    throw new Error("local_demand_not_activated");
  const scope = await localExecutorScope();
  if (closing) throw new Error("local_executor_shutting_down");
  if (supervisor) return supervisor;
  supervisor = new DemandSupervisor({
    read: id => localRequest(id, scope),
    recover: () => localRequests(scope),
    reconcile: id => reconcileLocal(id, scope),
    failed: id => markDispatchError(id, scope),
    run: id =>
      new Promise<void | number>((resolve, reject) => {
        let blockedUntil: number | undefined;
        child = fork(
          fileURLToPath(new URL("./localDemandWorker.ts", import.meta.url)),
          [id, scope],
          {
            env: { ...process.env, POSTSPARK_DEMAND_CHILD: "1" },
            execArgv: ["--import", "tsx"],
            stdio: ["inherit", "inherit", "inherit", "ipc"],
          }
        );
        child.on("message", (message: any) => {
          if (
            message?.type === "generation-blocked" &&
            Number.isFinite(message.until)
          )
            blockedUntil = message.until;
          if (
            message?.type === "generation-progress" &&
            message.event?.requestId === id
          )
            generationEvents.emit(id, message.event);
        });
        child.once("error", reject);
        child.once("exit", code => {
          child = undefined;
          code === 0
            ? resolve(blockedUntil)
            : reject(new Error("local_worker_exited"));
        });
      }),
  });
  return supervisor;
}
export async function enqueueLocal(record: RequestRecord) {
  if (
    record.executionMode !== "local-demand" ||
    record.executorScope !== (await localExecutorScope())
  )
    throw new Error("generation_executor_scope_mismatch");
  (await getDemandSupervisor()).enqueue(record.id);
}
export async function startDemandRecovery() {
  if (!ENV.localDemandEnabled) return;
  try {
    await (await import("./brandCaptureDemand")).recoverCaptures();
    await (await getDemandSupervisor()).recover();
  } catch (error) {
    console.error(
      "[generation:recovery] Recuperação inicial falhou; nenhuma varredura será iniciada.",
      error
    );
  }
}
export function stopDemandSupervisor() {
  closing = true;
  void import("./brandCaptureDemand").then(m=>m.stopCaptures());
  supervisor?.stop();
  if (child?.connected) child.disconnect();
}
