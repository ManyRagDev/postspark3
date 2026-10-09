import { describe, it, expect } from "vitest";
import {
  arsenalBriefProfile,
  variableArsenalBriefProfile,
} from "./arsenalBriefProfile";
import { deriveVariableContentContract } from "@shared/variableContent";
describe("pistas semânticas V3", () => {
  it("lista livre não envia uma contagem artificial à recuperação", () => {
    const p = variableArsenalBriefProfile(
      deriveVariableContentContract("lista de dicas"),
      "Café fresco",
      "lista de dicas"
    );
    expect(p.present).toContain("items");
    expect(p.items).toBeUndefined();
  });
  it("uma frase sem título não solicita título do catálogo", () => {
    const p = variableArsenalBriefProfile(
      deriveVariableContentContract("apenas uma frase, sem título"),
      "Café fresco",
      "apenas uma frase"
    );
    expect(p.present).toEqual([]);
    expect(p.available).toEqual(["body"]);
    expect(p.variable).toBe(true);
  });
  it("15 itens mantém a cardinalidade de 15", () => {
    const p = variableArsenalBriefProfile(
      deriveVariableContentContract("15 itens"),
      "Café fresco",
      "15 itens"
    );
    expect(p.present).toEqual(["items"]);
    expect(p.items).toBe(15);
    expect(p.available).not.toContain("metric.value");
  });
  it("citação literal sem autoria pode preencher citação sem inventar autor", () => {
    const p = variableArsenalBriefProfile(
      deriveVariableContentContract("apenas uma citação"),
      '"Café inspira"',
      "apenas uma citação"
    );
    expect(p.present).toContain("attribution.quote");
    expect(p.available).toContain("attribution.quote");
    expect(p.available).not.toContain("attribution.author");
  });
});

// Legacy retrieval hints remain supported for older clients.
describe("pistas semânticas V2", () => {
  it("contagem de instrução não vira evidência factual", () => {
    const p = arsenalBriefProfile("Café fresco", "12 dicas de preparo");
    expect(p.items).toBe(12);
    expect(p.present).toContain("items");
    expect(p.available).not.toContain("metric.value");
  });
  it("fato numérico explícito habilita campos de métrica", () => {
    const p = arsenalBriefProfile(
      "Resultado: 20% de crescimento",
      "post sobre o resultado"
    );
    expect(p.available).toContain("metric.value");
    expect(p.present).toContain("metric.label");
  });
  it("citação sem autor não preenche autoria obrigatória", () => {
    const p = arsenalBriefProfile('"Café inspira"', "post com citação");
    expect(p.available).not.toContain("attribution.author");
    const attributed = arsenalBriefProfile(
      '"Café inspira" — Maria',
      "post com citação"
    );
    expect(attributed.available).toContain("attribution.author");
  });
  it("comparação inclui os dois lados e texto comum conserva título", () => {
    const p = arsenalBriefProfile(
      "Antes: preparo frio; depois: quente",
      "comparar resultados"
    );
    expect(p.present).toContain("comparison.left.text");
    expect(p.present).toContain("comparison.right.text");
    expect(arsenalBriefProfile("Café fresco", "post").present).toEqual([
      "headline",
    ]);
  });
});
