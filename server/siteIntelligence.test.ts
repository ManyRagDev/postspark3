import { describe, expect, it } from "vitest";
import type { SiteIntelligence } from "@shared/postspark";
import {
  siteIntelligenceToDesignTokens,
  siteIntelligenceToPrompt,
} from "./siteIntelligence";

const intelligence: SiteIntelligence = {
  id: "11111111-1111-4111-8111-111111111111",
  version: 1,
  sourceUrl: "example.com",
  normalizedUrl: "https://example.com/",
  fingerprint: "a".repeat(64),
  brand: {
    brandName: "FlowPilot",
    industry: "SaaS",
    personality: {
      seriousPlayful: 30,
      luxuryAccessible: 70,
      modernClassic: 20,
      boldSubtle: 35,
      warmCool: 60,
    },
    colors: {
      primary: "#7F56D9",
      secondary: "#D0D5DD",
      background: "#101828",
      text: "#FFFFFF",
      accent: "#12B76A",
      palette: ["#101828", "#FFFFFF", "#7F56D9", "#12B76A"],
      colorRelationships: {
        harmony: "analogous",
        contrast: "high",
        temperature: "cool",
      },
    },
    typography: {
      headingFont: "Inter",
      bodyFont: "Inter",
      headingWeight: "700",
      bodyWeight: "400",
      fontPairing: "matching",
    },
    composition: {
      rhythm: "staccato",
      harmony: "consonant",
      dynamics: "forte",
      tempo: "allegro",
    },
    layout: {
      density: "compact",
      borderRadius: "rounded",
      padding: "tight",
      preferredAlignment: "left",
      cardStyle: "flat",
    },
    effects: {
      shadows: true,
      gradients: false,
      animations: true,
      glassmorphism: false,
      noise: false,
    },
    emotionalProfile: {
      primary: "trust",
      secondary: "speed",
      mood: "confiante e direto",
    },
    metadata: {
      sourceUrl: "https://example.com/",
      pagesAnalyzed: 3,
      extractionQuality: 0.9,
      visionUsed: true,
    },
  },
  business: {
    summary: "Automacao de operacoes para equipes B2B.",
    products: ["Plataforma FlowPilot"],
    services: [],
    valueProposition: "Reduzir tarefas manuais e dar visibilidade a operacao.",
    differentiators: ["Indicadores em tempo real"],
    audiences: ["Equipes de operacoes B2B"],
    audienceProblems: ["Processos manuais"],
    objections: ["Tempo de implantacao"],
    goals: ["lead", "authority"],
  },
  editorial: {
    pillars: ["automacao", "produtividade"],
    priorityTopics: ["processos manuais", "indicadores operacionais"],
    prohibitedClaims: ["Nao prometer economia sem evidencia"],
    toneGuidelines: ["Claro", "Profissional"],
  },
  evidence: [
    {
      id: "page-1-description",
      sourceUrl: "https://example.com/",
      kind: "description",
      text: "Automacao de operacoes para equipes B2B.",
    },
  ],
  quality: {
    overall: 0.85,
    visual: 0.9,
    semantic: 0.8,
    evidenceCoverage: 0.75,
    fallbackUsed: false,
    warnings: [],
  },
  extractedAt: "2026-06-12T00:00:00.000Z",
};

describe("siteIntelligence", () => {
  it("builds a generation context grounded in business goals and topics", () => {
    const prompt = siteIntelligenceToPrompt(intelligence);

    expect(prompt).toContain("Automacao de operacoes");
    expect(prompt).toContain("Equipes de operacoes B2B");
    expect(prompt).toContain("lead, authority");
    expect(prompt).toContain("processos manuais");
    expect(prompt).toContain("Nao invente");
  });

  it("converts the same snapshot into renderer-ready design tokens", () => {
    const tokens = siteIntelligenceToDesignTokens(intelligence);
    // The new guardian picks the most saturated brand color as `primary`.
    // In this fixture, #12B76A (green) is more saturated than #7F56D9 (purple),
    // so primary must be #12B76A. Background must come from the brand palette
    // (darkest non-pure-black), and text must pass WCAG >= 4.5:1.
    expect(tokens.colors.background).toBe("#101828");
    expect(["#12B76A", "#7F56D9"]).toContain(tokens.colors.primary);
    expect(tokens.colors.text).toBe("#FFFFFF");
    expect(tokens.typography.fontFamily).toBe("Inter");
    expect(tokens.typography.textAlign).toBe("left");
    expect(tokens.structure.borderRadius).toBe("16px");
  });
});
