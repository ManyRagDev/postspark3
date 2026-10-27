import "dotenv/config";
import {installNetworkDiagnostics,withNetworkDiagnosticScope} from "../../_core/networkDiagnostics";
import { claimLocal } from "./localDemandStore";
import { createGenerationStore } from "./generationStore";
import { executeClaimedGeneration } from "./generationRuntime";
import { createGenerationWorkerIdentity } from "./generationWorkerIdentity";
import { ENV } from "../../_core/env";
import { withCatalogRevision } from "../../designCatalog/versionedCatalog";
import { publishGenerationRecord } from "./generationEvents";
async function main() {
  if (!ENV.localDemandEnabled || !process.send || !process.connected)
    throw new Error("local_worker_requires_supervisor");
  const [id, scope,kind] = process.argv.slice(2);
  if (!id || !scope) throw new Error("local_worker_missing_request");
  const shutdown = new AbortController();
  const stop = () => shutdown.abort();
  process.once("disconnect", stop);
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  if(kind==="brand-capture"){
    try{const {captureRpc,executeCapture}=await import("../../brandCapture");const c=await captureRpc("brand_capture_claim",{p_id:id,p_scope:scope});if(c?.blockedUntil){process.send?.({type:"generation-blocked",until:Date.parse(c.blockedUntil)});return;}if(c)await executeCapture(c,shutdown.signal);}finally{if(process.connected)process.disconnect();}return;
  }
  const { assertReviewRendererAvailable, closeReviewRenderer } = await import(
    "./proposalRenderer"
  );
  try {
    await assertReviewRendererAvailable();
    const workerIdentity = await createGenerationWorkerIdentity({
      rendererBundlePath: ENV.reviewRendererBundle,
    });
    if (shutdown.signal.aborted) return;
    const claim = await claimLocal(id, scope, workerIdentity.workerId);
    if (!claim) return;
    if ("blockedUntil" in claim) {
      process.send?.({ type: "generation-blocked", until: claim.blockedUntil });
      return;
    }
    if (shutdown.signal.aborted) return;
    if (!claim.record.catalogRevision)
      throw new Error("catalog_revision_missing");
    publishGenerationRecord(claim.record);
    await withCatalogRevision(claim.record.catalogRevision, () =>
      executeClaimedGeneration(claim.record, claim.leaseToken, {
        store: createGenerationStore(),
        workerIdentity,
        shutdownSignal: shutdown.signal,
      })
    );
  } finally {
    await closeReviewRenderer();
    if (process.connected) process.disconnect();
  }
}
const networkDiagnostics=installNetworkDiagnostics("worker");
networkDiagnostics.ready.then(()=>withNetworkDiagnosticScope({source:"generation-worker"},main)).catch(error => {
  console.error("[generation:local]", error);
  process.exitCode = 1;
}).finally(()=>networkDiagnostics.stop());
