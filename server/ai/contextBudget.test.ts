import { describe, expect, it } from "vitest";
import { HIGH_TICKET_CONTEXT_BUDGET_CHARS, applyContextBudget } from "./contextBudget";
import type { MasterBriefing } from "@shared/contextBriefing";

// applyContextBudget com budget abaixo do limite não chama LLM (path determinístico).
// O fallback LLM é testado indiretamente — quando o contexto excede o budget
// mesmo após compressão determinística, o catch retorna o comprimido com nota.

function makeBriefing(overrides: Partial<MasterBriefing> = {}): MasterBriefing {
  return {
    version: 1,
    userInput: {
      inputType: "text",
      content: "Conteudo de teste",
      platform: "instagram",
      postMode: "static",
      creationMode: "execution",
    },
    brand: {
      toneOfVoice: "profissional",
      formattingRules: [],
      forbiddenTerms: [],
      requiredTerms: [],
      dictionary: {},
      colors: [],
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
      fallbackUsed: false,
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
    ...overrides,
  };
}

describe("applyContextBudget", () => {
  it("returns briefing unchanged when under budget", async () => {
    const briefing = makeBriefing();
    const result = await applyContextBudget(briefing);
    expect(result.compressed).toBe(false);
    expect(result.compressionNotes).toEqual([]);
  });

  it("deterministic-compresses when over budget (top 12 evidence, 1k each)", async () => {
    // Cria evidence suficiente para estourar 18k chars
    const bigEvidence = Array.from({ length: 20 }, (_, i) => ({
      id: `ev-${i}`,
      text: "A".repeat(2000),
      kind: "claim",
    }));
    const briefing = makeBriefing({
      site: {
        evidence: bigEvidence,
        toneGuidelines: [],
        prohibitedClaims: [],
        fallbackUsed: false,
      },
    });
    const result = await applyContextBudget(briefing);
    expect(result.compressed).toBe(true);
    expect(result.site.evidence.length).toBeLessThanOrEqual(12);
    expect(result.site.evidence.every(e => e.text.length <= 1000)).toBe(true);
    expect(result.compressionNotes.length).toBeGreaterThan(0);
  });

  it("budget constant is 18000 chars", () => {
    expect(HIGH_TICKET_CONTEXT_BUDGET_CHARS).toBe(18_000);
  });
});
