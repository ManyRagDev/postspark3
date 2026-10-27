import { generationEvents } from "./generationEvents";
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  DemandSupervisor,
  localExecutorScope,
  type DemandRecord,
} from "./localDemandSupervisor";
import {
  captureRpc,
  readCapture,
  type CaptureRecord,
} from "../../brandCapture";
import { getDb } from "../../db";
import { ENV } from "../../_core/env";
const item = (c: CaptureRecord): DemandRecord => ({
  id: c.id,
  status: c.status,
  deadlineAt: Date.parse(c.deadline_at),
  leaseUntil: c.lease_until ? Date.parse(c.lease_until) : undefined,
});
let supervisor: DemandSupervisor<DemandRecord> | undefined;
async function get() {
  const scope = await localExecutorScope();
  return (supervisor ??= new DemandSupervisor<DemandRecord>({
    publish: () => {},
    read: async id => {
      const c = await readCapture(id, undefined, scope);
      return c ? item(c) : null;
    },
    recover: async () => {
      const r = await getDb()
        .from("brand_captures")
        .select("*")
        .eq("executor_scope", scope)
        .in("status", ["queued", "running"]);
      if (r.error) throw r.error;
      return (r.data ?? []).map(item);
    },
    reconcile: async id => {
      const c = await readCapture(id, undefined, scope);
      if (
        c &&
        ["queued", "running"].includes(c.status) &&
        Date.parse(c.deadline_at) <= Date.now()
      ) {
        const r = await getDb()
          .from("brand_captures")
          .update({
            status: "failed",
            error_reason: "capture_deadline_expired",
            lease_token: null,
            lease_until: null,
          })
          .eq("id", id)
          .eq("executor_scope", scope)
          .in("status", ["queued", "running"]);
        if (r.error) throw r.error;
      }
    },
    failed: async () => {},
    run: id =>
      new Promise<void | number>((resolve, reject) => {
        const child = fork(
          fileURLToPath(new URL("./localDemandWorker.ts", import.meta.url)),
          [id, scope, "brand-capture"],
          {
            env: { ...process.env, POSTSPARK_DEMAND_CHILD: "1" },
            execArgv: ["--import", "tsx"],
            stdio: ["inherit", "inherit", "inherit", "ipc"],
          }
        );
        let blocked: number | undefined;
        child.on("message", (m: any) => {
          if (m?.type === "generation-progress" && m.event?.requestId === id)
            generationEvents.emit(id, m.event);
          if (m?.type === "generation-blocked") blocked = m.until;
        });
        child.once("error", reject);
        child.once("exit", code =>
          code === 0
            ? resolve(blocked)
            : reject(new Error("capture_worker_exited"))
        );
      }),
  }));
}
export async function enqueueCapture(c: CaptureRecord) {
  if (
    !ENV.localDemandEnabled ||
    c.executor_scope !== (await localExecutorScope())
  )
    throw new Error("Capture executor mismatch");
  (await get()).enqueue(c.id);
}
export async function recoverCaptures() {
  if (ENV.localDemandEnabled) await (await get()).recover();
}
export function stopCaptures() {
  supervisor?.stop();
}
