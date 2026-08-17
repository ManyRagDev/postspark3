import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PostEvaluation, PostVariation } from "@shared/postspark";

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [
      {
        message: {
          content: JSON.stringify({
            evaluations: [
              {
                overallScore: 82,
                dimensions: {
                  brandAlignment: 80,
                  aestheticQuality: 84,
                  readability: 82,
                  messageClarity: 85,
                  engagement: 79,
                },
                suggestions: [],
                verdict: "good",
              },
            ],
          }),
        },
      },
    ],
  }),
}));

import { evaluatePostQuality } from "./postJudge";

const VALID_LLM_SHAPE: { evaluations: PostEvaluation[] } = {
  evaluations: [
    {
      overallScore: 82,
      dimensions: {
        brandAlignment: 80,
        aestheticQuality: 84,
        readability: 82,
        messageClarity: 85,
        engagement: 79,
      },
      suggestions: ["Aumentar contraste do título"],
      verdict: "good",
    },
  ],
};

const variation: PostVariation = {
  id: "v1",
  headline: "Cafe artesanal",
  body: "Torra media.",
  callToAction: "Saiba mais",
  backgroundColor: "#1a1a2e",
  textColor: "#ffffff",
  accentColor: "#FF5F1F",
  layout: "centered",
  platform: "instagram",
  caption: "Legenda",
  hashtags: ["#cafe"],
  imagePrompt: "coffee",
  tone: "direto",
  postMode: "static",
} as PostVariation;

// SPEC-005: postJudge é COMPATIBILIDADE (endpoint público sem chamador
// interno). O teste valida o CONTRATO REAL de PostEvaluation — nunca um
// subconjunto inventado. CR-007: o mock anterior devolvia `overall/score/
// feedback` e o teste assertava `overall` — nada disso existe no contrato;
// o merge gerava NaN e o teste passava por assertar uma propriedade ausente.
describe("postJudge — compatibilidade nomeada (SPEC-005, CR-007)", () => {
  beforeEach(async () => {
    vi.mocked((await import("./_core/llm")).invokeLLM).mockClear();
  });

  it("avalia variações e retorna o contrato REAL de PostEvaluation", async () => {
    vi.mocked((await import("./_core/llm")).invokeLLM).mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify(VALID_LLM_SHAPE) } }],
    });

    const [result] = await evaluatePostQuality([variation]);

    expect(result).toBeDefined();
    // overallScore (não `overall`) — nunca NaN mesmo após o blend de contraste.
    expect(typeof result.overallScore).toBe("number");
    expect(Number.isNaN(result.overallScore)).toBe(false);
    // dimensions com as CINCO chaves do contrato.
    expect(result.dimensions).toEqual(
      expect.objectContaining({
        brandAlignment: expect.any(Number),
        aestheticQuality: expect.any(Number),
        readability: expect.any(Number),
        messageClarity: expect.any(Number),
        engagement: expect.any(Number),
      }),
    );
    for (const value of Object.values(result.dimensions)) {
      expect(Number.isNaN(value)).toBe(false);
    }
    // verdict dentro do enum; suggestions é array.
    expect(["excellent", "good", "needs-improvement"]).toContain(result.verdict);
    expect(Array.isArray(result.suggestions)).toBe(true);
  });

  it("fallback: falha do LLM → nota neutra finita (70) e verdict válido", async () => {
    vi.mocked((await import("./_core/llm")).invokeLLM).mockRejectedValueOnce(new Error("judge offline"));

    const [result] = await evaluatePostQuality([variation]);

    expect(result.overallScore).toBe(70);
    expect(Number.isNaN(result.overallScore)).toBe(false);
    expect(result.verdict).toBe("good");
    expect(Array.isArray(result.suggestions)).toBe(true);
  });

  it("retorna array vazio sem variações", async () => {
    expect(await evaluatePostQuality([])).toEqual([]);
  });
});
