import assert from "node:assert/strict";
import { createTestComposedPost } from "./fixtures";
import { pendingMediaCount } from "../../client/src/pages/CanvasLab/lib/mediaSlots";

export async function runExportVerification(): Promise<{ checks: Record<string, boolean>; details: string[] }> {
  const details: string[] = [];
  const checks: Record<string, boolean> = {};

  const post = createTestComposedPost();

  // 1. Validação de mídia pendente: data URLs ou assets locais não contam como pendentes
  const pendingCount = pendingMediaCount(post);
  assert.equal(pendingCount, 0);
  checks.noPendingMediaWhenFilled = true;
  details.push(`Avaliação de recursos completos sem pendências concluída`);

  // 2. Post com slot deferido sem URL deve sinalizar mídia pendente
  const postWithDeferred = structuredClone(post);
  const comp = postWithDeferred.slides[0].composition!;
  const mediaElem = comp.elements.find((e) => e.kind === "media");
  if (mediaElem) {
    (mediaElem as any).mediaSlot = { deferred: true, label: "Foto", function: "ilustração" };
    delete comp.media[mediaElem.id];
  }
  const deferredPending = pendingMediaCount(postWithDeferred, false);
  assert.equal(deferredPending, 1);
  checks.deferredMediaPendingCheck = true;
  details.push("Bloqueio de slot deferido pendente verificado com sucesso");

  return { checks, details };
}
