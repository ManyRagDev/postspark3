import "dotenv/config";
import { ENV } from "../../_core/env";

// Dedicated Node process, not a promise launched after an HTTP/serverless response.
async function main() {
  if (ENV.localDemandEnabled) {
    throw new Error(
      "O modo local-demand está ativo. Inicie o backend (pnpm dev); generation:worker é exclusivo do modo external explícito."
    );
  }
  const [{createGenerationStore},{executeClaimedGeneration},{createGenerationWorkerIdentity}]=await Promise.all([import("./generationStore"),import("./generationRuntime"),import("./generationWorkerIdentity")]);
  const parentIpc = typeof process.send === "function";
  if (parentIpc && !process.connected) {
    console.info(
      "[generation-worker] IPC já desconectado; saindo sem iniciar o executor."
    );
    return;
  }

  let stop = false;
  if (parentIpc) {
    process.once("disconnect", () => {
      stop = true;
      console.info(
        "[generation-worker] IPC desconectado; encerrando após o trabalho atual."
      );
    });
  }

  let pulse: NodeJS.Timeout | undefined;
  let closeRenderer: (() => Promise<void>) | undefined;
  try {
    const { assertReviewRendererAvailable, closeReviewRenderer } = await import(
      "./proposalRenderer"
    );
    closeRenderer = closeReviewRenderer;
    await assertReviewRendererAvailable();
    const store = createGenerationStore();
    const workerIdentity = await createGenerationWorkerIdentity({
      rendererBundlePath: ENV.reviewRendererBundle,
    });
    const { workerId } = workerIdentity;
    console.info("[generation-worker] Executor iniciado:", workerIdentity);
    process.once("SIGINT", () => {
      stop = true;
    });
    process.once("SIGTERM", () => {
      stop = true;
    });
    let missedHeartbeats = 0;
    await store.workerHeartbeat(workerId).catch(err => {
      console.warn(
        "[generation-worker] Falha inicial no heartbeat (tentará novamente):",
        err?.message
      );
    });
    pulse = setInterval(() => {
      store
        .workerHeartbeat(workerId)
        .then(() => store.reconcile())
        .then(() => {
          missedHeartbeats = 0;
        })
        .catch(err => {
          missedHeartbeats++;
          console.warn(
            `[generation-worker] Falha transitória de heartbeat (${missedHeartbeats}/4):`,
            err?.message
          );
          if (missedHeartbeats >= 4) {
            console.error(
              "[generation-worker] Limite de heartbeats perdidos atingido; desconectando."
            );
            stop = true;
          }
        });
    }, 10000);

    while (!stop) {
      try {
        await store.reconcile();
        const {captureRpc,executeCapture}=await import("../../brandCapture");
        const capture=await captureRpc("brand_capture_claim",{p_id:null,p_scope:null});
        if(capture&&!capture.blockedUntil){await executeCapture(capture);continue;}
        const claim = await store.claim(workerId);
        // A parent reload may disconnect while claim() is in flight. Leave any
        // newly acquired lease to expire rather than starting work after reload.
        if (stop) break;
        if (claim) {
          console.info(
            `[generation-worker] 📥 Job capturado da fila: ID=${claim.record.id} (modo: ${claim.record.input.postMode})`
          );
          const execute=()=>executeClaimedGeneration(claim.record, claim.leaseToken, {store,workerIdentity});
          const {withCatalogRevision}=await import("../../designCatalog/versionedCatalog");
          await (claim.record.catalogRevision?withCatalogRevision(claim.record.catalogRevision,execute):execute()).catch(error =>
            console.error(
              `[generation-worker] ❌ Falha no job ID=${claim.record.id}:`,
              error instanceof Error ? error.message : error
            )
          );
          console.info(
            `[generation-worker] 📤 Job ID=${claim.record.id} processado.`
          );
        } else {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (err: any) {
        if (stop) break;
        console.warn(
          "[generation-worker] Erro transitório durante claim:",
          err?.message
        );
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  } finally {
    if (pulse) clearInterval(pulse);
    await closeRenderer?.().catch(error =>
      console.warn(
        "[generation-worker] Falha ao fechar renderer:",
        error instanceof Error ? error.message : "failed"
      )
    );
    if (parentIpc && process.connected) process.disconnect();
  }
}
main().catch(error => {
  console.error(
    error instanceof Error ? error.message : "generation-worker failed"
  );
  process.exitCode = 1;
});
