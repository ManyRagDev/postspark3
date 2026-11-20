import { describe, expect, it, vi } from "vitest";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { compactComponentCard } from "@shared/componentAssembly";
import { resolveCompleteDesignOffers } from "@shared/completeDesignOffers";
import { describeCompactOffer } from "@shared/compactDesignProfile";
import { resolveDesignFamilyRepertoires } from "@shared/designRepertoire";
import { buildFamilySelectionCandidates, familyAssessmentProfile, type FamilySelectionProfile } from "@shared/designFamilySelection";
import * as designSelection from "@shared/designSelection";
import { ENV } from "../_core/env";
import {
  shortlistCompleteDesigns,
  evaluateDesignBatch,
  batches,
  criteriaV2,
  assessmentTaskV2,
  type JevRequest,
  type JevResponse,
} from "./designShortlist";

function mockCardCatalog(count: number) {
  const base = compactComponentCard(completeDesignTestDefinitions()[0]);
  return Array.from({ length: count }, (_, i) => ({
    ...base,
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    completeDesign: { ...base.completeDesign!, family: `family-${i}` },
    roles: ["static", "cover", "development", "closing"] as any,
  }));
}

describe("Fase 4: JEV Improvements", () => {
  describe("4a. Ordenação rankingV2", () => {
    it("com Δscore=0.01 e Δsimilaridade=0.7, a ordem inverte sob rankingV2", async () => {
      const cards = mockCardCatalog(14);
      // Cada card em uma família diferente para podermos isolar a similaridade visual
      const offers = resolveCompleteDesignOffers(cards, { slideCount: 1, contentMode: "compose" });
      const projections = offers.map(o => ({ ...o.slides[0].card, id: o.offerId, hash: o.signature }));
      const profiles = Object.fromEntries(offers.map(o => [o.offerId, describeCompactOffer(o)]));

      const firstChoice = offers[0]; // Score 4.0 (primeiro selecionado)
      const optA = offers[1]; // Score 3.51, similaridade 0.70 com firstChoice
      const optB = offers[2]; // Score 3.50 (Δscore = 0.01), similaridade 0.0 com firstChoice

      const similaritySpy = vi.spyOn(designSelection, "designVisualSimilarity").mockImplementation((cardA, cardB) => {
        const ids = [cardA.id, cardB.id];
        if (
          (ids.includes(firstChoice.offerId) || ids.includes(firstChoice.slides[0].card.id)) &&
          (ids.includes(optA.offerId) || ids.includes(optA.slides[0].card.id))
        ) {
          return 0.7; // Δsimilaridade = 0.7
        }
        return 0;
      });

      const prev = (ENV as any).rankingV2;

      try {
        // 1. Sem rankingV2 (comportamento legado com suitability_first):
        // optA tem score 3.51 vs optB com 3.50.
        // Como 3.51 - 3.50 = 0.01 > 0, o primeiro termo decide e a similaridade é ignorada!
        (ENV as any).rankingV2 = false;
        const legacyResult = await shortlistCompleteDesigns({
          cards: projections,
          brief: "Brief de teste",
          slideCount: 1,
          deadlineMs: null,
          offers,
          profiles,
          rankingPolicy: "suitability_first",
        }, async (req: JevRequest): Promise<JevResponse> => ({
          model: req.model,
          answers: Object.fromEntries(
            Object.keys(req.questions).map(id => [
              id,
              id === firstChoice.offerId
                ? { type: "score" as const, score: 4.0, confidence: 1.0 }
                : id === optA.offerId
                ? { type: "score" as const, score: 3.51, confidence: 1.0 }
                : id === optB.offerId
                ? { type: "score" as const, score: 3.50, confidence: 1.0 }
                : { type: "score" as const, score: 2.0, confidence: 1.0 },
            ])
          ),
          usage: { input_tokens: 100, output_tokens: 10, cost: 0.001 },
        }));

        // No legado, optA vence optB porque o primeiro termo ignora a similaridade
        expect(legacyResult.cards[0].id).toBe(firstChoice.offerId);
        expect(legacyResult.cards[1].id).toBe(optA.offerId);

        // 2. Com rankingV2 ativo:
        // adjustedScore(optA) = 3.51 - (0.25 * 0.7) = 3.51 - 0.175 = 3.335
        // adjustedScore(optB) = 3.50 - 0 = 3.50
        // 3.50 > 3.335 => a ordem DEVE inverter! optB passa à frente de optA!
        (ENV as any).rankingV2 = true;
        const v2Result = await shortlistCompleteDesigns({
          cards: projections,
          brief: "Brief de teste",
          slideCount: 1,
          deadlineMs: null,
          offers,
          profiles,
          rankingPolicy: "suitability_first",
        }, async (req: JevRequest): Promise<JevResponse> => ({
          model: req.model,
          answers: Object.fromEntries(
            Object.keys(req.questions).map(id => [
              id,
              id === firstChoice.offerId
                ? { type: "score" as const, score: 4.0, confidence: 1.0 }
                : id === optA.offerId
                ? { type: "score" as const, score: 3.51, confidence: 1.0 }
                : id === optB.offerId
                ? { type: "score" as const, score: 3.50, confidence: 1.0 }
                : { type: "score" as const, score: 2.0, confidence: 1.0 },
            ])
          ),
          usage: { input_tokens: 100, output_tokens: 10, cost: 0.001 },
        }));

        expect(v2Result.cards[0].id).toBe(firstChoice.offerId);
        expect(v2Result.cards[1].id).toBe(optB.offerId); // ORDEM INVERTIDA COM SUCESSO!
      } finally {
        (ENV as any).rankingV2 = prev;
        similaritySpy.mockRestore();
      }
    });
  });

  describe("4b. Lotes, ordenação por hash e balanceamento", () => {
    it("batches real: ordenação por hash, medição de bytes e balanceamento de lotes", () => {
      const cards = mockCardCatalog(24);
      const repertoires = resolveDesignFamilyRepertoires(cards, { slideCount: 1, contentMode: "compose" });
      const candidates = buildFamilySelectionCandidates(repertoires, null, true, true);
      const profiles = Object.fromEntries(candidates.map(c => [c.id, c.profile]));

      // Executar batches com byteLimit restrito para forçar divisão em lotes
      const byteLimit = 15_000;
      const requests = batches(cards, "Briefing editorial de teste para medição de bytes", profiles, true, undefined, undefined, byteLimit);

      // Reportar métricas
      expect(requests.length).toBeGreaterThanOrEqual(2);
      const batchMetrics = requests.map((req, idx) => {
        const bytes = Buffer.byteLength(JSON.stringify(req));
        const questionsCount = Object.keys(req.questions).length;
        return { batchIndex: idx, questionsCount, bytes };
      });

      console.log("Métricas de lotes (Fase 4b):", batchMetrics);
      // Nenhum lote ultrapassa o byteLimit
      expect(batchMetrics.every(m => m.bytes <= byteLimit)).toBe(true);

      // As perguntas estão balanceadas: a diferença de questions entre o maior e menor lote é no máximo 1
      const counts = batchMetrics.map(m => m.questionsCount);
      const maxCount = Math.max(...counts);
      const minCount = Math.min(...counts);
      expect(maxCount - minCount).toBeLessThanOrEqual(1);
    });

    it("resiliência: retry recupera pergunta faltante antes de falhar o lote", async () => {
      const prevKey = ENV.openRouterApiKey;
      (ENV as any).openRouterApiKey = "test-key";
      const cards = mockCardCatalog(4);
      const repertoires = resolveDesignFamilyRepertoires(cards, { slideCount: 1, contentMode: "compose" });
      const candidates = buildFamilySelectionCandidates(repertoires, null, true, true);
      const profiles = Object.fromEntries(candidates.map(c => [c.id, c.profile]));
      const req = batches(cards.slice(0, 2), "Brief de teste", profiles, true)[0];

      const questionIds = Object.keys(req.questions);
      expect(questionIds).toHaveLength(2);

      let attempts = 0;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn(async (_url: any, options: any) => {
        attempts++;
        const parsedBody = JSON.parse(options.body);
        const askedIds = Object.keys(parsedBody.questions);

        // Na 1ª tentativa, simular que o modelo omitiu a segunda pergunta
        if (attempts === 1) {
          return {
            ok: true,
            json: async () => ({
              model: req.model,
              answers: {
                [askedIds[0]]: { type: "score", score: 3.5, confidence: 0.9 },
              },
              usage: { input_tokens: 50, output_tokens: 5 },
            }),
          } as any;
        }

        // Na 2ª tentativa (retry da pergunta faltante), responder a que faltou
        return {
          ok: true,
          json: async () => ({
            model: req.model,
            answers: {
              [askedIds[0]]: { type: "score", score: 3.2, confidence: 0.85 },
            },
            usage: { input_tokens: 25, output_tokens: 5 },
          }),
        } as any;
      });

      try {
        const result = await evaluateDesignBatch(req, { deadlineMs: Date.now() + 5000 });
        expect(attempts).toBe(2);
        expect(Object.keys(result.answers).sort()).toEqual(questionIds.sort());
        expect(result.answers[questionIds[0]].score).toBe(3.5);
        expect(result.answers[questionIds[1]].score).toBe(3.2);
      } finally {
        globalThis.fetch = originalFetch;
        (ENV as any).openRouterApiKey = prevKey;
      }
    });
  });

  describe("4c & 4d. Versionamento de perfil v6 e rubric", () => {
    it("perfil v5 preserva comportamento histórico sem structure", () => {
      const cards = mockCardCatalog(4);
      const repertoires = resolveDesignFamilyRepertoires(cards, { slideCount: 1, contentMode: "compose" });
      const candidates = buildFamilySelectionCandidates(repertoires, null, true, true);
      const assessed = familyAssessmentProfile(candidates[0].profile) as any;
      expect(assessed.version).toBe(5);
      expect(assessed).not.toHaveProperty("structure");
    });

    it("perfil v6 inclui apenas os 5 campos estruturais com sinal real, sem availability.roles", () => {
      const cards = mockCardCatalog(4);
      const repertoires = resolveDesignFamilyRepertoires(cards, { slideCount: 1, contentMode: "compose" });
      const candidates = buildFamilySelectionCandidates(repertoires, null, true, true);
      
      const v6Profile: FamilySelectionProfile = {
        ...candidates[0].profile,
        version: 6,
      };
      const assessed = familyAssessmentProfile(v6Profile) as any;
      expect(assessed.version).toBe(6);
      expect(assessed).toHaveProperty("structure");
      expect(Object.keys(assessed.structure).sort()).toEqual([
        "listBlocks",
        "listItemsPerBlock",
        "mediaSlots",
        "relationships",
        "textBlocks",
      ]);
      expect(assessed).not.toHaveProperty("availability");
      expect(assessed).not.toHaveProperty("roles");
    });

    it("criteriaV2 remove a cláusula de evidência de composição do anchor 4 mantendo âncoras determinísticas", () => {
      expect(criteriaV2[4]).toBe(
        "A particularly strong fit: native editorial style supports the essential message and informative progression required by the brief."
      );
      expect(criteriaV2[4]).not.toContain("specific composition evidence");
      expect(assessmentTaskV2).toContain("Assess what its structure and visual organization can do for this request");
    });
  });
});
