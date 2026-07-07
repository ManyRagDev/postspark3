import { describe, expect, it } from "vitest";
import { workerPayloadSchema } from "./highTicketSchemas";

const payload = {
  angleId: "angle-authority",
  copy: {
    headline: "Autoridade sem ruido",
    body: "Um criterio claro para decidir melhor",
    caption: "Autoridade sem ruido. Um criterio claro para decidir melhor.",
    hashtags: ["#marca", "#conteudo"],
    callToAction: "Veja o criterio",
    tone: "profissional",
  },
  visual: {
    concept: "Editorial premium com contraste alto",
    imagePrompt: "premium editorial abstract background, no text",
    layout: "left-aligned",
    aspectRatio: "1:1",
    template: "simple",
    sections: [],
    backgroundColor: "#111827",
    textColor: "#ffffff",
    accentColor: "#f59e0b",
    aspectRatioOptimizations: {
      "1:1": {
        layout: "centered",
        backgroundColor: "#111827",
        textColor: "#ffffff",
        accentColor: "#f59e0b",
      },
      "5:6": {
        layout: "left-aligned",
        backgroundColor: "#111827",
        textColor: "#ffffff",
        accentColor: "#f59e0b",
      },
      "9:16": {
        layout: "left-aligned",
        backgroundColor: "#111827",
        textColor: "#ffffff",
        accentColor: "#f59e0b",
      },
    },
  },
};

describe("highTicket schemas", () => {
  it("accepts a complete worker payload with all format optimizations", () => {
    expect(workerPayloadSchema.safeParse(payload).success).toBe(true);
  });

  it("rejects incomplete aspect ratio optimizations", () => {
    const result = workerPayloadSchema.safeParse({
      ...payload,
      visual: {
        ...payload.visual,
        aspectRatioOptimizations: {
          "1:1": payload.visual.aspectRatioOptimizations["1:1"],
        },
      },
    });

    expect(result.success).toBe(false);
  });
});
