import { describe, expect, it } from "vitest";

import { planContentStrategiesDeterministic } from "./contentStrategy";
import { buildStrategyGenerationContext } from "./postGenerator";

describe("contentStrategy — planejamento determinístico (SPEC-003/005)", () => {
  it("produces five scored candidates and selects three distinct contracts", () => {
    const plan = planContentStrategiesDeterministic({
      sourceContent:
        "Plataforma de automacao reduz tarefas manuais e melhora indicadores de operacoes B2B.",
    });

    expect(plan.fallbackUsed).toBe(true);
    expect(plan.candidates).toHaveLength(5);
    expect(plan.selected).toHaveLength(3);
    expect(plan.selected.every((item) => item.score.total >= 0)).toBe(true);
    expect(new Set(plan.selected.map((item) => item.angle)).size).toBe(3);
  });

  it("serializes selected strategies as variation-specific prompt contracts", () => {
    const plan = planContentStrategiesDeterministic({
      sourceContent:
        "Contabilidade consultiva para pequenas empresas com planejamento tributario.",
    });
    const context = buildStrategyGenerationContext(plan.selected);

    expect(context).toContain("CONTRATOS ESTRATEGICOS");
    expect(context).toContain("A variacao 1 deve executar a estrategia 1");
    expect(context).toContain("Nao misture os tres angulos");
  });

  it("é determinístico: mesmo input produz o mesmo plano", () => {
    const input = { sourceContent: "Cafe artesanal com torra media e envio rapido." };
    const first = planContentStrategiesDeterministic(input);
    const second = planContentStrategiesDeterministic(input);
    expect(first).toEqual(second);
  });

  it("usa tópicos e evidências reais do site quando disponíveis", () => {
    const plan = planContentStrategiesDeterministic({
      sourceContent: "cafe",
      siteIntelligence: {
        id: "si-1",
        userUuid: "u-1",
        sourceUrl: "https://exemplo.com",
        normalizedUrl: "https://exemplo.com",
        fingerprint: "abc",
        snapshotVersion: 1,
        collectedAt: new Date().toISOString(),
        business: {
          summary: "Cafeteria artesanal de bairro",
          valueProposition: "Cafe de origem com torra propria",
          audiences: ["jovens urbanos"],
          audienceProblems: ["cafe ruim"],
          goals: ["educate"],
        },
        editorial: {
          pillars: ["torra", "origem"],
          priorityTopics: ["metodos de preparo"],
          toneGuidelines: ["leve"],
        },
        evidence: [
          { id: "e1", kind: "text", text: "Torramos semanalmente graos de origem." },
        ],
        quality: { overall: 1, notes: [] },
      } as never,
    });

    expect(plan.candidates.some((item) => item.topic.includes("torra"))).toBe(true);
    expect(plan.candidates[0].evidenceIds).toContain("e1");
  });
});
