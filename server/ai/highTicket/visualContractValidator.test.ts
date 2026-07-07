import { describe, expect, it } from "vitest";
import type { MasterBriefing, WorkerPayload } from "@shared/highTicket";
import { validateVisualContract } from "./visualContractValidator";

function briefing(): MasterBriefing {
  return {
    version: 1,
    userInput: {
      inputType: "text",
      content: "conteudo",
      platform: "instagram",
      postMode: "static",
      creationMode: "ideation",
    },
    brand: {
      formattingRules: [],
      forbiddenTerms: ["proibido"],
      requiredTerms: [],
      dictionary: {},
      colors: ["#111827", "#f59e0b"],
      fallbackUsed: false,
    },
    persona: {
      pains: [],
      goals: [],
      objections: [],
      fallbackUsed: false,
    },
    site: {
      evidence: [],
      toneGuidelines: [],
      prohibitedClaims: [],
      fallbackUsed: true,
    },
    constraints: {
      forbiddenTerms: ["proibido"],
      requiredTerms: [],
      toneGuidelines: [],
      formattingRules: [],
      preferredColors: ["#111827", "#f59e0b"],
      maxHeadlineChars: 60,
      maxBodyChars: 110,
    },
    compressed: false,
    compressionNotes: [],
    fallbackNotes: [],
  };
}

function payload(patch: Partial<WorkerPayload> = {}): WorkerPayload {
  const base: WorkerPayload = {
    angleId: "angle-1",
    copy: {
      headline: "Mensagem premium",
      body: "Clareza para decidir melhor",
      caption: "Mensagem premium. Clareza para decidir melhor.",
      hashtags: ["#marca"],
      callToAction: "Conheca",
      tone: "profissional",
    },
    visual: {
      concept: "Editorial premium",
      imagePrompt: "premium editorial background, no text",
      layout: "centered",
      aspectRatio: "1:1",
      template: "simple",
      sections: [],
      backgroundColor: "#111827",
      textColor: "#ffffff",
      accentColor: "#f59e0b",
      aspectRatioOptimizations: {
        "1:1": { layout: "centered", backgroundColor: "#111827", textColor: "#ffffff", accentColor: "#f59e0b" },
        "5:6": { layout: "left-aligned", backgroundColor: "#111827", textColor: "#ffffff", accentColor: "#f59e0b" },
        "9:16": { layout: "left-aligned", backgroundColor: "#111827", textColor: "#ffffff", accentColor: "#f59e0b" },
      },
    },
  };
  return { ...base, ...patch };
}

describe("validateVisualContract", () => {
  it("accepts a complete high ticket payload", () => {
    const result = validateVisualContract({
      payloads: [payload()],
      briefing: briefing(),
      postMode: "static",
    });

    expect(result.valid).toBe(true);
  });

  it("rejects forbidden terms and incomplete format optimizations", () => {
    const bad = payload({
      copy: {
        ...payload().copy,
        headline: "Termo proibido aqui",
      },
      visual: {
        ...payload().visual,
        aspectRatioOptimizations: undefined,
      },
    });

    const result = validateVisualContract({
      payloads: [bad],
      briefing: briefing(),
      postMode: "static",
    });

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["forbidden_term", "missing_aspect_ratio_optimizations"]),
    );
  });
});
