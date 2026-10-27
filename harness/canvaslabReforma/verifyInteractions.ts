import assert from "node:assert/strict";
import { createTestComposedPost } from "./fixtures";
import {
  overrideArsenalElement,
  reorderArsenalLayer,
  resolveArsenalComposition,
} from "../../client/src/pages/CanvasLab/lib/arsenalComposition";
import { reorderExtraElement } from "../../client/src/pages/CanvasLab/lib/documentCommands";

export async function runInteractionsVerification(): Promise<{ checks: Record<string, boolean>; details: string[] }> {
  const details: string[] = [];
  const checks: Record<string, boolean> = {};

  const post = createTestComposedPost();
  const comp = post.slides[0].composition!;

  // 1. Reordenação de camada autoral Arsenal (front / back)
  const layerId = "tx-integrated-0";
  const reorderedFront = reorderArsenalLayer(comp, layerId, "front");
  assert.ok(reorderedFront.overrides[layerId]);
  checks.layerReorderFront = true;
  details.push("Reordenação de camada autoral para frente verificada");

  // 2. Modificação de geometria e resolução de composição
  const modified = overrideArsenalElement(comp, layerId, { x: 75, y: 150 });
  const resolved = resolveArsenalComposition(modified);
  const elem = resolved.elements.find((e) => e.id === layerId);
  assert.ok(elem);
  assert.equal(elem.x, 75);
  assert.equal(elem.y, 150);
  checks.elementOverrideGeometry = true;
  details.push("Override e resolução geométrica da camada verificados");

  // 3. Reordenação de elementos nativos
  const nativePost = structuredClone(post);
  nativePost.slides[0].extraTexts = [
    { id: "tx-1", text: "T1", x: 0, y: 0, width: 100, fontSize: 16, fontFamily: "Arial", color: "#fff", align: "left", rotation: 0 },
    { id: "tx-2", text: "T2", x: 0, y: 0, width: 100, fontSize: 16, fontFamily: "Arial", color: "#fff", align: "left", rotation: 0 },
  ];
  const reorderedNative = reorderExtraElement(nativePost, "tx-2", "back");
  assert.equal(reorderedNative.slides[0].extraTexts![0].id, "tx-2");
  checks.nativeExtraElementReorder = true;
  details.push("Reordenação de elementos nativos verificada");

  return { checks, details };
}

