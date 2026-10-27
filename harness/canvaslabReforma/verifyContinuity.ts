import assert from "node:assert/strict";
import { createTestComposedPost } from "./fixtures";
import { duplicateSlide, removeSlide } from "../../client/src/pages/CanvasLab/lib/documentCommands";
import { canvasModelToSavePayload, savedPostToCanvasModel } from "../../client/src/pages/CanvasLab/lib/saveAdapter";
import { readArsenalComposition } from "@shared/designArsenal";

export async function runContinuityVerification(): Promise<{ checks: Record<string, boolean>; details: string[] }> {
  const details: string[] = [];
  const checks: Record<string, boolean> = {};

  // 1. Criar post e duplicar slide preservando integridade da composição
  const initial = createTestComposedPost();
  assert.equal(initial.slides.length, 2);
  const duplicated = duplicateSlide(initial, 0);
  assert.equal(duplicated.slides.length, 3);
  assert.ok(duplicated.slides[1].composition);
  assert.notEqual(duplicated.slides[1].id, duplicated.slides[0].id);

  // Validar integridade via readArsenalComposition
  const compSlide0 = readArsenalComposition(duplicated.slides[0].composition);
  const compSlide1 = readArsenalComposition(duplicated.slides[1].composition);
  assert.equal(compSlide0.version, compSlide1.version);
  checks.duplicateSlideIntegrity = true;
  details.push("Slide duplicado com integridade canônica preservada");

  // 2. Remoção de slide sem perder outros slides
  const removed = removeSlide(duplicated, 1);
  assert.equal(removed.slides.length, 2);
  checks.removeSlideIntegrity = true;
  details.push("Slide intermediário removido mantendo integridade dos demais");

  // 3. Roundtrip de persistência (save -> reopen)
  const payload = canvasModelToSavePayload(initial, { inputType: "text", inputContent: "Continuity Test" });
  const reopened = savedPostToCanvasModel({
    id: 101,
    canvas_model: JSON.parse(JSON.stringify(payload.canvasModel)),
  });
  assert.equal(reopened.slides.length, initial.slides.length);
  assert.equal(reopened.caption, initial.caption);
  checks.persistenceRoundtrip = true;
  details.push("Roundtrip de salvamento e reabertura preservado");

  return { checks, details };
}

