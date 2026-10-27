import type { ChildProcess } from "node:child_process";
import { startDemandRecovery } from "./localDemandSupervisor";
import { ENV } from "../../_core/env";
/** Bootstrap does one scoped recovery. Only the supervisor may spawn an executor. */
export function startLocalGenerationWorker(): ChildProcess | undefined {
  if (
    process.env.NODE_ENV === "development" &&
    !process.env.VERCEL &&
    ENV.generationWorkerMode === "local-demand"
  )
    void startDemandRecovery();
  return undefined;
}
