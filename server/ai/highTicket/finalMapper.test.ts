import { describe, expect, it } from "vitest";
import type { AngleAssignment, MasterBriefing, WorkerPayload } from "@shared/highTicket";
import { mapWorkerPayloadsToPostVariations } from "./finalMapper";

const briefing: MasterBriefing = {
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
    forbiddenTerms: [],
    requiredTerms: [],
    dictionary: {},
    colors: [],
    fallbackUsed: true,
  },
  persona: {
    pains: [],
    goals: [],
    objections: [],
    fallbackUsed: true,
  },
  site: {
    evidence: [],
    toneGuidelines: [],
    prohibitedClaims: [],
    fallbackUsed: true,
  },
  constraints: {
    forbiddenTerms: [],
    requiredTerms: [],
    toneGuidelines: [],
    formattingRules: [],
    preferredColors: [],
    maxHeadlineChars: 60,
    maxBodyChars: 110,
  },
  compressed: false,
  compressionNotes: [],
  fallbackNotes: [],
};

const angle: AngleAssignment = {
  angleId: "angle-authority",
  title: "Autoridade",
  thesis: "Tese",
  mechanism: "authority",
  audience: "decisores",
  hook: "Hook",
  promise: "Promise",
  visualDirection: "Editorial",
  risks: [],
};

const payload: WorkerPayload = {
  angleId: "angle-authority",
  copy: {
    headline: "Headline",
    body: "Body",
    caption: "Caption",
    hashtags: ["#a"],
    callToAction: "CTA",
    tone: "profissional",
  },
  visual: {
    concept: "Concept",
    imagePrompt: "Image prompt",
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

describe("mapWorkerPayloadsToPostVariations", () => {
  it("maps worker payloads without creating visual snapshots", () => {
    const [variation] = mapWorkerPayloadsToPostVariations({
      payloads: [payload],
      angles: [angle],
      briefing,
      runId: "run-1",
    });

    expect(variation.id).toBe("run-1-1");
    expect((variation as any).snapshotVersion).toBeUndefined();
    expect(variation.copyAngle?.type).toBe("autoridade");
    expect(variation.aspectRatioOptimizations?.["9:16"]).toBeDefined();
  });
});
