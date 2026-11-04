import { resolve, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { Server } from "node:net";

/** Explicit local live bootstrap. Merely preparing/reading this file starts nothing. */
async function main() {
  const args = process.argv.slice(2),
    values = new Map<string, string>();
  let live = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--live") {
      if (live) throw new Error("duplicate_live_flag");
      live = true;
      continue;
    }
    if (
      ![
        "--shared-budget",
        "--campaign-id",
        "--max-usd",
        "--max-calls",
        "--catalog-revision",
        "--port",
      ].includes(args[i]) ||
      values.has(args[i]) ||
      !args[i + 1] ||
      args[i + 1].startsWith("--")
    )
      throw new Error("invalid_local_bootstrap_argument");
    values.set(args[i], args[++i]);
  }
  if (
    !live ||
    !values.has("--shared-budget") ||
    !values.has("--campaign-id") ||
    !values.has("--max-usd") ||
    !values.has("--max-calls") ||
    !/^[1-9]\d*$/.test(values.get("--catalog-revision") ?? "")
  )
    throw new Error(
      "local_bootstrap_requires_explicit_live_budget_campaign_and_revision"
    );
  if (process.env.VERCEL || process.env.NODE_ENV === "production")
    throw new Error("local_bootstrap_forbidden_in_production");
  const port = Number(values.get("--port") ?? 3000);
  if (!Number.isInteger(port) || port < 1024 || port > 65000)
    throw new Error("local_bootstrap_invalid_port");
  await new Promise<void>((resolve, reject) => {
    const probe = new Server();
    probe.once("error", () =>
      reject(
        new Error(
          "local_bootstrap_port_busy_stop_previous_server_without_changing_origin"
        )
      )
    );
    probe.listen(port, "127.0.0.1", () => probe.close(() => resolve()));
  });
  // Temporary process flags only. No .env, product code or credentials changed.
  process.env.NODE_ENV = "development";
  process.env.GENERATION_WORKER_MODE = "local-demand";
  process.env.GENERATION_LOCAL_DEMAND_ENABLED = "true";
  process.env.GENERATION_STRATEGY_VERSION = "2";
  process.env.GENERATION_LOCAL_CATALOG_REVISION =
    values.get("--catalog-revision")!;
  process.env.PORT = String(port);
  const [
    { ENV },
    { localPipelineFingerprint },
    { readSharedBudget },
    { writeJson },
  ] = await Promise.all([
    import("../../_core/env"),
    import("./localPipelineFingerprint"),
    import("./sharedBudget"),
    import("./journal"),
  ]);
  const budgetFile = resolve(values.get("--shared-budget")!),
    state = await readSharedBudget(budgetFile);
  const campaignId = values.get("--campaign-id")!;
  if (
    state.maxUsd !== Number(values.get("--max-usd")) ||
    state.maxCalls !== Number(values.get("--max-calls")) ||
    state.campaigns[campaignId]?.kind !== "local-journeys"
  )
    throw new Error("local_bootstrap_budget_mismatch");
  if (
    !ENV.openRouterApiKey ||
    !ENV.supabaseUrl ||
    ENV.generationStrategyVersion !== 2
  )
    throw new Error(
      "local_bootstrap_requires_existing_credentials_and_strategy_2"
    );
  const origin = new URL(ENV.supabaseUrl).origin;
  if (
    process.env.VITE_SUPABASE_URL &&
    new URL(process.env.VITE_SUPABASE_URL).origin !== origin
  )
    throw new Error("local_bootstrap_frontend_backend_project_mismatch");
  const { readCatalogSnapshot, readCatalogDefinition } = await import(
    "../../designCatalog/versionedCatalog"
  );
  const remote = await readCatalogSnapshot(values.get("--catalog-revision")!);
  if (!state.catalogSnapshots || !state.revisedPackage)
    throw new Error("local_bootstrap_catalog_alignment_not_prepared");
  const {
    readSnapshotFile,
    describeSnapshotFile,
    verifyJourneyCatalogAlignment,
  } = await import("./catalogAlignment");
  const [overlayDescriptor, packageDescriptor] = await Promise.all([
    describeSnapshotFile(state.catalogSnapshots.revised.path),
    describeSnapshotFile(state.revisedPackage.path),
  ]);
  if (
    overlayDescriptor.sha256 !== state.catalogSnapshots.revised.sha256 ||
    packageDescriptor.sha256 !== state.revisedPackage.sha256
  )
    throw new Error("local_bootstrap_catalog_file_changed");
  const alignment = await verifyJourneyCatalogAlignment({
    remote,
    overlay: await readSnapshotFile(overlayDescriptor.path),
    revisedPackage: await readSnapshotFile(packageDescriptor.path),
    hydrate: (id, hash) =>
      readCatalogDefinition(values.get("--catalog-revision")!, id, hash),
  });
  await writeJson(
    join(dirname(budgetFile), `${campaignId}-catalog-alignment.json`),
    alignment
  );
  const pipelineHash = await localPipelineFingerprint(ENV.reviewRendererBundle);
  const config = {
    live: true,
    budgetFile,
    campaignId,
    maxUsd: state.maxUsd,
    maxCalls: state.maxCalls,
    supabaseOrigin: origin,
    catalogRevision: values.get("--catalog-revision"),
    pipelineHash,
    reviewModel: ENV.openRouterProposalReviewModel,
    rendererPath: ENV.reviewRendererBundle,
  };
  const configPath = join(dirname(budgetFile), `${campaignId}-bootstrap.json`);
  await writeJson(configPath, config);
  process.env.POSTSPARK_LOCAL_PAID_GUARD_CONFIG = configPath;
  const preload = pathToFileURL(
    resolve("server/benchmarks/generationMatrix/localPaidPreload.mjs")
  ).href;
  process.env.NODE_OPTIONS =
    `${process.env.NODE_OPTIONS ?? ""} --import=tsx --import=${preload}`.trim();
  await import(preload);
  // The real app owns routes/auth/Sparks/persistence; only TCP binding is local.
  const listen = Server.prototype.listen;
  Server.prototype.listen = function (this: Server, ...args: any[]) {
    if (typeof args[0] === "number") {
      if (args[0] !== port)
        throw new Error("local_bootstrap_refuses_origin_port_change");
      if (typeof args[1] === "string") args[1] = "127.0.0.1";
      else args.splice(1, 0, "127.0.0.1");
    } else if (args[0] && typeof args[0] === "object" && "port" in args[0])
      args[0] = { ...args[0], host: "127.0.0.1" };
    return Reflect.apply(listen, this, args);
  } as typeof listen;
  process.stdout.write(
    `Local paid guard: campaign ${campaignId}; cumulative cap USD ${state.maxUsd}/${state.maxCalls} calls; requested port ${port}. No browser submission performed.\n`
  );
  await import("../../_core/index");
}
void main().catch(error => {
  console.error(
    error instanceof Error ? error.message : "local_bootstrap_failed"
  );
  process.exitCode = 1;
});
