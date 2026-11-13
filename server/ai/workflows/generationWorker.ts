import "dotenv/config";
import { ENV } from "../../_core/env";
import { createDemandExecutor } from "./demandExecutor";
import { demandSessionQuery, demandSessionTimeouts } from "./demandSession";
import { withProviderFailureObserver, type ProviderFailureClass } from "./providerCooldown";

// A dedicated supervised process. It never launches work after an HTTP response.
async function main() {
  if (ENV.localDemandEnabled) throw new Error(
    "O modo local-demand está ativo. Inicie o backend (pnpm dev); generation:worker é exclusivo do modo external explícito."
  );
  if (!ENV.generationDatabaseSessionUrl) throw new Error(
    "GENERATION_DATABASE_SESSION_URL é obrigatória: use conexão PostgreSQL de sessão; pool transacional não suporta LISTEN."
  );
  const [{ Client }, { createServer }, { createGenerationStore }, { executeClaimedGeneration },
    { createGenerationWorkerIdentity }, renderer, { captureRpc, executeCapture }, { withCatalogRevision }] = await Promise.all([
    import("pg"), import("node:http"), import("./generationStore"), import("./generationRuntime"),
    import("./generationWorkerIdentity"), import("./proposalRenderer"), import("../../brandCapture"),
    import("../../designCatalog/versionedCatalog"),
  ]);
  const parentIpc = typeof process.send === "function";
  if (parentIpc && !process.connected) return;
  const store = createGenerationStore();
  const workerIdentity = await createGenerationWorkerIdentity({ rendererBundlePath: ENV.reviewRendererBundle });
  let stopped = false, session: InstanceType<typeof Client> | undefined;
  let reconnectTask: Promise<void> | undefined;
  let rendererReady = false, recovered = false;
  let notBefore = 0;
  let installationId: string | undefined;
  const pendingProviderFailures = new Set<ProviderFailureClass>();
  let finish!: () => void;
  const finished = new Promise<void>(resolve => { finish = resolve; });
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let finishDelay: (() => void) | undefined;
  let lastPrune = 0;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    executor.disconnected();
    if (retryTimer) clearTimeout(retryTimer);
    finishDelay?.();
    finish();
  };
  function invalidateSession(client: InstanceType<typeof Client>) {
    if (session !== client) return;
    session = undefined;
    recovered = false;
    executor.disconnected();
    void client.end().catch(() => undefined);
    if (!stopped) void reconnect();
  }
  function querySession(client: InstanceType<typeof Client>, text: string, values?: unknown[]) {
    return demandSessionQuery(() => client.query(text, values), () => invalidateSession(client));
  }
  async function persistProviderFailure(kind: ProviderFailureClass) {
    // Mark unready immediately, including while other proposals are in flight.
    recovered = false;
    pendingProviderFailures.add(kind);
    const minimum = { transient: 5_000, rate_limit: 60_000, credentials: 900_000, quota: 3_600_000 }[kind];
    notBefore = Math.max(notBefore, Date.now() + minimum);
    const client = session;
    if (!client) return; // reconnect flushes this state before advertising readiness
    const result = await querySession(client, "SELECT postspark.demand_executor_backoff($1) AS deadline", [kind]);
    pendingProviderFailures.delete(kind);
    notBefore = Math.max(notBefore, new Date(result.rows[0].deadline).getTime());
  }
  async function readSchedule() {
    if (!session) throw new Error("listener_disconnected");
    const r = await querySession(session, "SELECT postspark.demand_work_schedule() AS schedule");
    const value = r.rows[0]?.schedule;
    if (value?.version !== 1 || value.installationId !== installationId)
      throw new Error("demand_executor_schema_or_database_mismatch");
    const persistedDeadline = value.notBefore ? Date.parse(value.notBefore) : 0;
    notBefore = pendingProviderFailures.size ? Math.max(notBefore, persistedDeadline) : persistedDeadline;
    return value.wakeAt ? Date.parse(value.wakeAt) : null;
  }
  function observeWork<T>(work: () => Promise<T>): Promise<T> {
    return withProviderFailureObserver(persistProviderFailure, work);
  }
  const executor = createDemandExecutor({
    safetyScanMs: ENV.generationWorkerSafetyScanMs,
    runOne: async kind => {
      if (stopped || !session || notBefore > Date.now()) return false;
      if (kind === "capture") {
        const capture = await captureRpc("brand_capture_claim", { p_id: null, p_scope: null });
        if (!capture || capture.blockedUntil || stopped) return false;
        await observeWork(() => executeCapture(capture));
        return true;
      }
      const claim = await store.claim(workerIdentity.workerId);
      if (!claim || stopped) return false;
      const execute = () => executeClaimedGeneration(claim.record, claim.leaseToken, { store, workerIdentity });
      await observeWork(() => claim.record.catalogRevision ? withCatalogRevision(claim.record.catalogRevision, execute) : execute());
      return true;
    },
    reconcile: async () => {
      if (!session) throw new Error("listener_disconnected");
      // These bounded functions change only due work; no provider call is replayed.
      // A prior persistence failure may have occurred without losing the socket.
      for (const kind of Array.from(pendingProviderFailures)) await persistProviderFailure(kind);
      if (!session) throw new Error("listener_disconnected");
      await querySession(session, "SELECT postspark.generation_reconcile(), postspark.demand_reconcile_captures()");
      if (Date.now() - lastPrune >= ENV.generationWorkerSafetyScanMs) {
        lastPrune = Date.now();
        // Optional analytics retention is never a dependency of transactional work.
        await querySession(session, "SELECT postspark.generation_prune_telemetry()").catch(() => undefined);
      }
    },
    schedule: readSchedule,
    onError: async error => {
      recovered = false;
      // Never log connection strings or provider bodies in health diagnostics.
      console.warn("[generation-worker] Dependência indisponível; recuperação com backoff.", error instanceof Error ? error.name : "error");
      if (session) {
        const result = await querySession(session, "SELECT postspark.demand_executor_backoff('transient') AS deadline");
        notBefore = new Date(result.rows[0].deadline).getTime();
        return notBefore;
      }
    },
    onRecovered: () => { recovered = pendingProviderFailures.size === 0 && notBefore <= Date.now(); },
  });

  const health = createServer(async (req, res) => {
    if (req.url !== "/healthz" && req.url !== "/readyz") { res.writeHead(404).end(); return; }
    if (req.url === "/readyz" && !stopped) {
      try {
        await renderer.assertReviewRendererAvailable(); rendererReady = true;
        // Requested probes check the live local database, without a background heartbeat.
        await readSchedule();
      } catch { rendererReady = false; recovered = false; }
    }
    const ready = !stopped && pendingProviderFailures.size === 0 && notBefore <= Date.now() && recovered && executor.healthy && rendererReady && Boolean(ENV.openRouterApiKey);
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.statusCode = req.url === "/readyz" && !ready ? 503 : 200;
    res.end(JSON.stringify({ contractVersion: 1, transport: "postgres-notify", ready,
      listener: executor.connected, renderer: rendererReady, dependencies: recovered,
      notBefore: notBefore > Date.now() ? notBefore : null,
      active: executor.active, safetyScanMs: ENV.generationWorkerSafetyScanMs, metrics: executor.metrics }));
  });

  async function connect() {
    let attempt = 0;
    while (!stopped) {
      const client = new Client({ connectionString: ENV.generationDatabaseSessionUrl,
        application_name: "postspark-demand-listener", connectionTimeoutMillis: 10_000,
        ...demandSessionTimeouts, keepAlive: true, keepAliveInitialDelayMillis: 30_000 });
      let lost = false;
      const disconnected = () => {
        if (lost) return;
        lost = true;
        if (session !== client) return;
        invalidateSession(client);
      };
      client.on("error", disconnected);
      client.on("end", disconnected);
      client.on("notification", message => {
        if (message.channel === "postspark_work") executor.notify();
      });
      try {
        await client.connect();
        await client.query("LISTEN postspark_work"); // autocommit FIRST, recover durable state SECOND
        if (stopped || lost) { await client.end(); return; }
        const direct = (await client.query("SELECT postspark.demand_work_schedule() AS schedule")).rows[0]?.schedule;
        const runtime = await captureRpc("demand_work_schedule", {});
        if (direct?.version !== 1 || !direct.installationId || direct.installationId !== runtime?.installationId) {
          console.error("[generation-worker] Listener e runtime apontam bancos incompatíveis; executor bloqueado.");
          await client.end();
          process.exitCode = 1;
          stop();
          return;
        }
        if (stopped || lost) { await client.end().catch(() => undefined); if (stopped) return; throw new Error("listener_lost_during_handshake"); }
        installationId = direct.installationId;
        notBefore = direct.notBefore ? Date.parse(direct.notBefore) : 0;
        session = client;
        for (const kind of Array.from(pendingProviderFailures)) await persistProviderFailure(kind);
        if (session !== client) throw new Error("listener_lost_during_recovery");
        executor.reconnected();
        await executor.settled();
        return;
      } catch {
        await client.end().catch(() => undefined);
        if (stopped) return;
        const delay = Math.min(300_000, 5_000 * 2 ** Math.min(attempt++, 6)) * (0.8 + Math.random() * 0.4);
        await new Promise<void>(resolve => { finishDelay = resolve; retryTimer = setTimeout(resolve, delay); });
        finishDelay = undefined; retryTimer = undefined;
      }
    }
  }
  function reconnect() {
    if (!reconnectTask) reconnectTask = connect().finally(() => {
      reconnectTask = undefined;
      if (!stopped && !session) void reconnect();
    });
    return reconnectTask;
  }

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  if (parentIpc) process.once("disconnect", stop);
  try {
    await renderer.assertReviewRendererAvailable();
    rendererReady = true;
    await new Promise<void>((resolve, reject) => {
      health.once("error", reject);
      health.listen(ENV.generationWorkerHealthPort, ENV.generationWorkerHealthHost, resolve);
    });
    console.info("[generation-worker] Executor por demanda iniciado", { workerId: workerIdentity.workerId, safetyScanMs: ENV.generationWorkerSafetyScanMs });
    void reconnect();
    await finished;
  } finally {
    stop();
    // Existing work finishes with the original lease; no new claim after shutdown.
    await executor.stop();
    await reconnectTask;
    await session?.end().catch(() => undefined);
    await new Promise<void>(resolve => health.close(() => resolve()));
    await renderer.closeReviewRenderer().catch(() => undefined);
    if (parentIpc && process.connected) process.disconnect();
  }
}
main().catch(error => {
  console.error(error instanceof Error ? error.message : "generation-worker failed");
  process.exitCode = 1;
});
