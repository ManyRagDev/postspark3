import { afterEach, describe, expect, it, vi } from "vitest";
import { createGenerationTelemetry } from "./generationTelemetry";
import { generationTelemetryBatchSchema, generationTelemetryEventSchema } from "@shared/generationTelemetry";
import { computePostEditDelta } from "@/pages/CanvasLab/lib/editDelta";
import { getGalleryPermutation } from "@/pages/StudioApp/StudioAppV2BPage";
import { INITIAL_POST, type CanvasPostModel } from "@/pages/CanvasLab/components/types";

const requestId = "00000000-0000-4000-8000-000000000001";
const exposureId = "00000000-0000-4000-8000-000000000002";
const identity = { requestId, proposalId: "proposal-1", revision: 1 };

afterEach(() => vi.useRealTimers());

describe("FASE 7 — Telemetria de geração e edição", () => {
  it("aceita e valida eventos com delta granular (fieldId, property, changeType)", () => {
    const validEvent = {
      eventId: "00000000-0000-4000-8000-000000000010",
      exposureId,
      requestId,
      proposalId: "prop-1",
      revision: 0,
      kind: "edit" as const,
      delta: {
        fieldId: "s1:headline",
        property: "headline",
        changeType: "text",
      },
      changes: 1,
    };

    const parsed = generationTelemetryEventSchema.safeParse(validEvent);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.delta).toEqual({
        fieldId: "s1:headline",
        property: "headline",
        changeType: "text",
      });
    }

    const batchParsed = generationTelemetryBatchSchema.safeParse({ events: [validEvent] });
    expect(batchParsed.success).toBe(true);
  });

  it("aceita originalPosition e position para desassociar viés de posição", () => {
    const exposureEvent = {
      eventId: "00000000-0000-4000-8000-000000000020",
      exposureId,
      requestId,
      proposalId: "prop-2",
      revision: 0,
      kind: "exposure" as const,
      position: 0, // posição visual na galeria
      originalPosition: 2, // ordem original de materialização
    };

    const parsed = generationTelemetryEventSchema.safeParse(exposureEvent);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.position).toBe(0);
      expect(parsed.data.originalPosition).toBe(2);
    }
  });

  it("registra deltas distintos para edições de diferentes campos", async () => {
    vi.useFakeTimers();
    const send = vi.fn().mockResolvedValue(undefined);
    const tracker = createGenerationTelemetry(send);

    tracker.record(identity, exposureId, "edit", {
      delta: { fieldId: "title", property: "headline", changeType: "text" },
    });
    // Segunda edição no mesmo campo deve coalescer
    tracker.record(identity, exposureId, "edit", {
      delta: { fieldId: "title", property: "headline", changeType: "text" },
    });
    // Edição em outro campo deve gerar evento separado com seu delta
    tracker.record(identity, exposureId, "edit", {
      delta: { fieldId: "caption", property: "caption", changeType: "text" },
    });

    await vi.advanceTimersByTimeAsync(2000);
    expect(send).toHaveBeenCalledTimes(1);
    const events = send.mock.calls[0][0];
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      kind: "edit",
      changes: 2,
      delta: { fieldId: "title", property: "headline", changeType: "text" },
    });
    expect(events[1]).toMatchObject({
      kind: "edit",
      changes: 1,
      delta: { fieldId: "caption", property: "caption", changeType: "text" },
    });

    tracker.dispose();
  });

  it("getGalleryPermutation gera permutação válida de [0, 1, 2] e estável para a mesma semente", () => {
    const seedA = "session-seed-12345";
    const permA1 = getGalleryPermutation(seedA);
    const permA2 = getGalleryPermutation(seedA);

    expect(permA1).toEqual(permA2);
    expect([...permA1].sort()).toEqual([0, 1, 2]);

    const seedB = "session-seed-67890";
    const permB = getGalleryPermutation(seedB);
    expect([...permB].sort()).toEqual([0, 1, 2]);
  });

  it("computePostEditDelta detecta com precisão mudanças no modelo de post", () => {
    const basePost: CanvasPostModel = {
      ...INITIAL_POST,
      id: "test-post",
      caption: "Legenda original",
      aspectRatio: "1:1",
      slides: [
        {
          id: "s1",
          step: "Passo 1",
          headline: "Título 1",
          subtext: "Subtítulo 1",
        },
      ],
    };

    // 1. Mudança de proporção
    const resized: CanvasPostModel = { ...basePost, aspectRatio: "9:16" };
    expect(computePostEditDelta(basePost, resized)).toEqual({
      property: "aspectRatio",
      changeType: "resize",
    });

    // 2. Mudança de legenda
    const captionEdited: CanvasPostModel = { ...basePost, caption: "Nova legenda" };
    expect(computePostEditDelta(basePost, captionEdited)).toEqual({
      fieldId: "caption",
      property: "caption",
      changeType: "text",
    });

    // 3. Mudança no título do slide
    const titleEdited: CanvasPostModel = {
      ...basePost,
      slides: [
        {
          ...basePost.slides[0],
          headline: "Novo título editado",
        },
      ],
    };
    expect(computePostEditDelta(basePost, titleEdited)).toEqual({
      fieldId: "s1:headline",
      property: "headline",
      changeType: "text",
    });

    // 4. Mudança de cores da paleta
    const paletteEdited: CanvasPostModel = {
      ...basePost,
      palette: {
        ...basePost.palette,
        accent: "#FF0000",
      },
    };
    expect(computePostEditDelta(basePost, paletteEdited)).toEqual({
      property: "palette",
      changeType: "color",
    });
  });
});
