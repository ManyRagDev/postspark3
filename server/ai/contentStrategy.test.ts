import { describe, expect, it, vi } from "vitest";

vi.mock("../_core/llm", () => ({
  invokeLLM: vi.fn().mockRejectedValue(new Error("offline fixture")),
}));

import { planContentStrategies } from "./contentStrategy";
import { buildStrategyGenerationContext } from "./postGenerator";

describe("contentStrategy", () => {
  it("produces five scored candidates and selects three distinct contracts", async () => {
    const plan = await planContentStrategies({
      sourceContent:
        "Plataforma de automacao reduz tarefas manuais e melhora indicadores de operacoes B2B.",
    });

    expect(plan.fallbackUsed).toBe(true);
    expect(plan.candidates).toHaveLength(5);
    expect(plan.selected).toHaveLength(3);
    expect(plan.selected.every((item) => item.score.total >= 0)).toBe(true);
    expect(new Set(plan.selected.map((item) => item.angle)).size).toBe(3);
  });

  it("serializes selected strategies as variation-specific prompt contracts", async () => {
    const plan = await planContentStrategies({
      sourceContent:
        "Contabilidade consultiva para pequenas empresas com planejamento tributario.",
    });
    const context = buildStrategyGenerationContext(plan.selected);

    expect(context).toContain("CONTRATOS ESTRATEGICOS");
    expect(context).toContain("A variacao 1 deve executar a estrategia 1");
    expect(context).toContain("Nao misture os tres angulos");
  });
});
