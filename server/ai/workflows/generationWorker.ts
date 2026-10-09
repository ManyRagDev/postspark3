import "dotenv/config";
import { randomUUID } from "node:crypto";
import { createGenerationStore } from "./generationStore";
import {
  executeClaimedGeneration,
  generationV5Enabled,
} from "./generationRuntime";

// Dedicated Node process, not a promise launched after an HTTP/serverless response.
async function main() {
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
  try {
    if (!generationV5Enabled())
      throw new Error("Defina GENERATION_V5_MODE=dev para iniciar o piloto");
    const store = createGenerationStore(),
      workerId = randomUUID();
    process.once("SIGINT", () => {
      stop = true;
    });
    process.once("SIGTERM", () => {
      stop = true;
    });
    let missedHeartbeats = 0;
    await store.workerHeartbeat(workerId).catch(err => {
      console.warn("[generation-worker] Falha inicial no heartbeat (tentará novamente):", err?.message);
    });
    pulse = setInterval(() => {
      store.workerHeartbeat(workerId)
        .then(() => {
          missedHeartbeats = 0;
        })
        .catch(err => {
          missedHeartbeats++;
          console.warn(`[generation-worker] Falha transitória de heartbeat (${missedHeartbeats}/4):`, err?.message);
          if (missedHeartbeats >= 4) {
            console.error("[generation-worker] Limite de heartbeats perdidos atingido; desconectando.");
            stop = true;
          }
        });
    }, 10000);

    while (!stop) {
      try {
        const claim = await store.claim(workerId);
        // A parent reload may disconnect while claim() is in flight. Leave any
        // newly acquired lease to expire rather than starting work after reload.
        if (stop) break;
        if (claim) {
          await executeClaimedGeneration(claim.record, claim.leaseToken, {
            store,
          }).catch(error =>
            console.error(
              "[generation-worker]",
              error instanceof Error ? error.message : "failed"
            )
          );
        } else {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (err: any) {
        if (stop) break;
        console.warn("[generation-worker] Erro transitório durante claim:", err?.message);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  } finally {
    if (pulse) clearInterval(pulse);
    if (parentIpc && process.connected) process.disconnect();
  }
}
main().catch(error => {
  console.error(
    error instanceof Error ? error.message : "generation-worker failed"
  );
  process.exitCode = 1;
});
