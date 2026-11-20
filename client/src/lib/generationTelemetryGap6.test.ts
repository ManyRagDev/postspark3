import { describe, expect, it } from "vitest";
import { INITIAL_POST, type CanvasPostModel } from "@/pages/CanvasLab/components/types";
import { computePostEditDelta } from "@/pages/CanvasLab/lib/editDelta";
import { createGenerationTelemetry } from "./generationTelemetry";

const reqId = "11111111-1111-4111-8111-111111111111";
const expId = "22222222-2222-4222-8222-222222222222";

function clonePost(): CanvasPostModel {
  return structuredClone(INITIAL_POST);
}

describe("Gap 6: coalescência por documento/revisão/campo/propriedade e deltas completos", () => {
  it("coalesce apenas quando documento, revisão, fieldId e property coincidem", async () => {
    const sent: unknown[][] = [];
    const telemetry = createGenerationTelemetry(async events => {
      sent.push(events);
    });

    telemetry.record(
      { requestId: reqId, proposalId: "p-1", revision: 1 },
      expId,
      "edit",
      { changes: 1, delta: { fieldId: "headline", property: "text", changeType: "text" } }
    );
    // Mesmo doc/revisão/fieldId/property -> deve coalescer
    telemetry.record(
      { requestId: reqId, proposalId: "p-1", revision: 1 },
      expId,
      "edit",
      { changes: 1, delta: { fieldId: "headline", property: "text", changeType: "text" } }
    );
    // Mesmo fieldId, property distinta -> NÃO coalesce
    telemetry.record(
      { requestId: reqId, proposalId: "p-1", revision: 1 },
      expId,
      "edit",
      { changes: 1, delta: { fieldId: "headline", property: "style", changeType: "color" } }
    );
    // Mesmo fieldId e property, MAS revisão diferente -> NÃO coalesce
    telemetry.record(
      { requestId: reqId, proposalId: "p-1", revision: 2 },
      expId,
      "edit",
      { changes: 1, delta: { fieldId: "headline", property: "text", changeType: "text" } }
    );
    // Evento sem delta não pode coalescer com evento com delta e vice-versa
    telemetry.record(
      { requestId: reqId, proposalId: "p-1", revision: 1 },
      expId,
      "edit",
      { changes: 1 }
    );

    telemetry.flush();
    await Promise.resolve();
    expect(sent).toHaveLength(1);
    const batch = sent[0] as Array<{
      revision: number;
      changes?: number;
      delta?: { fieldId?: string; property?: string };
    }>;
    expect(batch).toHaveLength(4);
    expect(batch[0]).toMatchObject({
      revision: 1,
      changes: 2,
      delta: { fieldId: "headline", property: "text" },
    });
    expect(batch[1]).toMatchObject({
      revision: 1,
      changes: 1,
      delta: { fieldId: "headline", property: "style" },
    });
    expect(batch[2]).toMatchObject({
      revision: 2,
      changes: 1,
      delta: { fieldId: "headline", property: "text" },
    });
    expect(batch[3].delta).toBeUndefined();
    expect(batch[3].changes).toBe(1);
    telemetry.dispose();
  });

  it("não deduplica exposição em nova exposureId quando posição visível muda na galeria", async () => {
    const sent: unknown[][] = [];
    const telemetry = createGenerationTelemetry(async events => {
      sent.push(events);
    });
    const exp2 = "33333333-3333-4333-8333-333333333333";

    telemetry.record({ requestId: reqId, proposalId: "p-2", revision: 1 }, expId, "exposure", {
      position: 0,
      originalPosition: 2,
    });
    // Mesma exposureId + documento deve deduplicar
    telemetry.record({ requestId: reqId, proposalId: "p-2", revision: 1 }, expId, "exposure", {
      position: 0,
      originalPosition: 2,
    });
    // Nova exposureId após reordenação progressiva deve ser emitida com nova posição exibida
    telemetry.record({ requestId: reqId, proposalId: "p-2", revision: 1 }, exp2, "exposure", {
      position: 1,
      originalPosition: 2,
    });

    telemetry.flush();
    await Promise.resolve();
    expect(sent[0]).toHaveLength(2);
    expect(sent[0]).toMatchObject([
      { exposureId: expId, position: 0, originalPosition: 2 },
      { exposureId: exp2, position: 1, originalPosition: 2 },
    ]);
    telemetry.dispose();
  });

  it("calcula deltas completos para extraTexts, extraImages, extraShapes, visualStyle e bgTransform", () => {
    const base = clonePost();
    const withText = clonePost();
    withText.extraTexts = [
      { id: "et-1", text: "A", x: 10, y: 20, width: 100, color: "#000000", fontSize: 20, fontFamily: "Inter", fontWeight: 600, align: "left" },
    ];
    expect(computePostEditDelta(base, withText)).toEqual({
      fieldId: "post",
      property: "extraTexts",
      changeType: "element_add",
    });

    const editedText = structuredClone(withText);
    editedText.extraTexts![0].text = "B";
    expect(computePostEditDelta(withText, editedText)).toEqual({
      fieldId: "et-1",
      property: "text",
      changeType: "text",
    });

    const withImage = clonePost();
    withImage.extraImages = [{ id: "img-1", url: "https://example.com/a.png", x: 0, y: 0, width: 200, height: 200 }];
    expect(computePostEditDelta(base, withImage)).toEqual({
      fieldId: "post",
      property: "extraImages",
      changeType: "element_add",
    });

    const movedImage = structuredClone(withImage);
    movedImage.extraImages![0].x = 40;
    expect(computePostEditDelta(withImage, movedImage)).toEqual({
      fieldId: "img-1",
      property: "layout",
      changeType: "geometry",
    });

    const slideWithShapePrev = clonePost();
    slideWithShapePrev.slides = [
      { id: "s-1", headline: "H", subtext: "S", extraShapes: [{ id: "sh-1", kind: "rect", x: 0, y: 0, width: 50, height: 50, color: "#111111" }] },
    ];
    const slideWithShapeNext = structuredClone(slideWithShapePrev);
    slideWithShapeNext.slides![0].extraShapes![0].color = "#ff0000";
    expect(computePostEditDelta(slideWithShapePrev, slideWithShapeNext)).toEqual({
      fieldId: "sh-1",
      property: "color",
      changeType: "color",
    });

    const bgStyled = clonePost();
    bgStyled.bgTransform = { x: 15, y: 0, scale: 1.2 };
    expect(computePostEditDelta(base, bgStyled)).toEqual({
      property: "bgTransform",
      changeType: "geometry",
    });

    const visPrev = clonePost();
    visPrev.slides = [{ id: "s-vs", headline: "H", subtext: "S" }];
    const visStyled = structuredClone(visPrev);
    visStyled.slides![0].visualStyle = { headlineEffect: "shadow" };
    expect(computePostEditDelta(visPrev, visStyled)).toEqual({
      fieldId: "s-vs",
      property: "visualStyle",
      changeType: "style",
    });
  });
});
