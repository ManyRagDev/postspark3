import { describe, expect, it } from "vitest";
import {
  buildEditorialMessages,
  measureFactCoverage,
  parseEditorialResponse,
  shuffledAnonymousLabels,
} from "./core";
import { EDITORIAL_BENCHMARK_CORPUS } from "./corpus";

const validResponse = {
  literalClaim: "A clínica oferece 20% de desconto no Dia das Mães.",
  confirmedFacts: ["20%", "Dia das Mães"],
  unknowns: ["procedimentos participantes"],
  allowedInferences: ["associar a data a cuidado"],
  semanticVariationBudget: 1,
  variations: ["direto", "comercial", "afetivo"].map((tone) => ({
    tone,
    headline: "Dia das Mães com 20% de desconto",
    body: "Uma condição especial na clínica.",
    cta: "Consulte as condições.",
    assumptions: [],
  })),
};

describe("editorial model benchmark", () => {
  it("aceita JSON cercado por markdown e valida o contrato", () => {
    const parsed = parseEditorialResponse(`\`\`\`json\n${JSON.stringify(validResponse)}\n\`\`\``);
    expect(parsed.valid).toBe(true);
    expect(parsed.value?.semanticVariationBudget).toBe(1);
  });

  it("rejeita resposta com menos de três variações", () => {
    const parsed = parseEditorialResponse(JSON.stringify({
      ...validResponse,
      variations: validResponse.variations.slice(0, 2),
    }));
    expect(parsed.valid).toBe(false);
  });

  it("mede preservação de fatos com normalização de acentos", () => {
    const parsed = parseEditorialResponse(JSON.stringify(validResponse));
    expect(parsed.value).toBeDefined();
    const coverage = measureFactCoverage(parsed.value!, [
      { label: "Dia das Mães", anyOf: ["dia das maes"] },
      { label: "20%", anyOf: ["20 %", "20%"] },
    ]);
    expect(coverage.rate).toBe(1);
  });

  it("mantém o briefing separado das instruções editoriais", () => {
    const messages = buildEditorialMessages(EDITORIAL_BENCHMARK_CORPUS[0]);
    expect(messages[0].content).toContain("Planeje o significado antes de estilizar");
    expect(messages[1].content).toContain("desconto de 20%");
  });

  it("gera um rótulo cego único para cada modelo", () => {
    const models = [
      { id: "a", defaultEnabled: true, nativeStructuredOutput: true, requireParameters: true, reasoningEffort: "none", inputUsdPerMillion: 1, outputUsdPerMillion: 1 },
      { id: "b", defaultEnabled: true, nativeStructuredOutput: true, requireParameters: true, reasoningEffort: "none", inputUsdPerMillion: 1, outputUsdPerMillion: 1 },
    ] as const;
    const labels = shuffledAnonymousLabels(models, () => 0);
    expect(new Set(Object.values(labels)).size).toBe(2);
  });
});
