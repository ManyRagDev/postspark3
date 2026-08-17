import { describe, expect, it } from "vitest";
import { angleToStrategy } from "./intentRouter";
import type { AngleAssignment } from "@shared/contextBriefing";

// angleToStrategy é determinístico e não chama LLM — pode ser testado diretamente.
// routeHighTicketIntent depende de invokeLLM (mockado em outros testes do server).

function makeAngle(overrides: Partial<AngleAssignment> = {}): AngleAssignment {
  return {
    angleId: "angle-test",
    title: "Titulo de teste",
    thesis: "Tese central do angulo",
    mechanism: "story",
    audience: "publico principal",
    hook: "Gancho de impacto",
    promise: "Promessa clara",
    visualDirection: "Visual editorial",
    risks: ["Risco 1"],
    ...overrides,
  };
}

describe("angleToStrategy", () => {
  it("maps all 7 mechanisms to the correct ContentStrategy angle", () => {
    const mechanisms: Array<AngleAssignment["mechanism"]> = [
      "pain", "benefit", "objection", "authority", "story", "myth", "how-to",
    ];
    const expected = [
      "pain", "benefit", "objection", "authority", "story", "myth", "how-to",
    ];
    mechanisms.forEach((mechanism, i) => {
      const strategy = angleToStrategy(makeAngle({ mechanism }), 0);
      expect(strategy.angle).toBe(expected[i]);
    });
  });

  it("preserves id, title, topic, audience, hook, promise from the angle", () => {
    const angle = makeAngle({
      angleId: "angle-authority",
      title: "Autoridade objetiva",
      thesis: "Posicionar com criterio",
      audience: "decisores",
      hook: "O que profissionais observam",
      promise: "Clareza para decidir",
    });
    const strategy = angleToStrategy(angle, 0);
    expect(strategy.id).toBe("angle-authority");
    expect(strategy.title).toBe("Autoridade objetiva");
    expect(strategy.topic).toBe("Posicionar com criterio");
    expect(strategy.audience).toBe("decisores");
    expect(strategy.hook).toBe("O que profissionais observam");
    expect(strategy.promise).toBe("Clareza para decidir");
  });

  it("hardcodes objective to 'engage' and evidenceIds to empty", () => {
    const strategy = angleToStrategy(makeAngle(), 0);
    expect(strategy.objective).toBe("engage");
    expect(strategy.evidenceIds).toEqual([]);
  });

  it("assigns decreasing total scores by index for deterministic ordering", () => {
    const angle = makeAngle();
    const s0 = angleToStrategy(angle, 0);
    const s1 = angleToStrategy(angle, 1);
    const s2 = angleToStrategy(angle, 2);
    expect(s0.score.total).toBeGreaterThan(s1.score.total);
    expect(s1.score.total).toBeGreaterThan(s2.score.total);
  });

  it("produces 3 distinct strategies from 3 orthogonal angles", () => {
    const angles: AngleAssignment[] = [
      makeAngle({ angleId: "a1", mechanism: "story", title: "Narrativa" }),
      makeAngle({ angleId: "a2", mechanism: "authority", title: "Autoridade" }),
      makeAngle({ angleId: "a3", mechanism: "objection", title: "Quebra de objecao" }),
    ];
    const strategies = angles.map((a, i) => angleToStrategy(a, i));
    expect(strategies).toHaveLength(3);
    const angleSet = new Set(strategies.map(s => s.angle));
    expect(angleSet.size).toBe(3);
    const idSet = new Set(strategies.map(s => s.id));
    expect(idSet.size).toBe(3);
  });
});
