import { describe, expect, it } from "vitest";
import { reconcile82Data } from "../../scripts/reconcile82Catalog";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { compactComponentCard, textFragmentCount } from "@shared/componentAssembly";

describe("Fase 5: Reconciliação de dados dos 82 designs", () => {
  it("executa reconciliação completa emitindo valor_antigo → valor_novo → fonte", () => {
    const { reconciled, changes } = reconcile82Data();

    expect(reconciled).toHaveLength(82);
    expect(changes.length).toBeGreaterThan(100);

    // Contagem de correções por campo bate com o relatório de medição
    const byField = changes.reduce<Record<string, number>>((acc, c) => {
      acc[c.field] = (acc[c.field] || 0) + 1;
      return acc;
    }, {});

    expect(byField.density).toBe(49);
    expect(byField.roles).toBe(26);
    expect(byField.imageRole).toBeGreaterThanOrEqual(6);
    expect(byField.typography).toBeGreaterThanOrEqual(8);

    // Validar formato estrito das alterações
    for (const change of changes) {
      expect(change.family).toMatch(/^acervo82-(reference|r9|concept)-\d{2}$/);
      expect(change.oldValue).toBeDefined();
      expect(change.newValue).toBeDefined();
      expect(change.source).toBeDefined();
      expect(change.oldValue).not.toBe(change.newValue);
    }
  });

  it("contrato: compactComponentCard projeta fragmentCount sincronizado com minWords", () => {
    const def = completeDesignTestDefinitions()[0];
    const card = compactComponentCard(def);

    expect(card.capacity.textRegions.length).toBeGreaterThan(0);
    for (const region of card.capacity.textRegions) {
      expect(region).toHaveProperty("fragmentCount");
      expect(region.fragmentCount).toBe(region.minWords);
      expect(textFragmentCount(region)).toBe(region.fragmentCount);
    }
  });
});
