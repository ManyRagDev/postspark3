import { readFile } from "node:fs/promises";

// NODE_OPTIONS inherits this preload into local-demand child workers. Await its
// installation before their entrypoint: no window for unbudgeted provider calls.
const configPath = process.env.POSTSPARK_LOCAL_PAID_GUARD_CONFIG;
if (!configPath) throw new Error("local_paid_guard_config_missing");
const config = JSON.parse(await readFile(configPath, "utf8"));
const { localPipelineFingerprint } = await import(
  "./localPipelineFingerprint.ts"
);
if (
  (await localPipelineFingerprint(config.rendererPath)) !== config.pipelineHash
)
  throw new Error("local_paid_guard_pipeline_changed");
const { installLocalJourneyGuard } = await import("./localJourneyGuard.ts");
const installed = await installLocalJourneyGuard(config);
const stop = () => {
  installed.budget.stop("operator_interrupt");
  void installed.budget
    .flush()
    .catch(error => console.error("[local-paid-guard]", error.message));
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
globalThis.__postsparkLocalPaidGuard = installed;
