import { afterEach, describe, expect, it } from "vitest";
import { createPostVariation } from "../../tests/fixtures/postspark";
import { ENV } from "../_core/env";
import {
  assessSemanticOriginality,
  cosineSimilarity,
} from "./semanticOriginality";

const originalGeminiKey = ENV.geminiApiKey;

afterEach(() => {
  ENV.geminiApiKey = originalGeminiKey;
});

describe("semanticOriginality", () => {
  it("calculates cosine similarity for normalized embeddings", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });

  it("penalizes duplicate candidates using deterministic fallback embeddings", async () => {
    ENV.geminiApiKey = "";
    const duplicate = createPostVariation({
      headline: "Automatize tarefas repetitivas",
      body: "Ganhe tempo na operacao",
      caption: "Mais foco para sua equipe",
    });
    const result = await assessSemanticOriginality({
      candidates: [
        duplicate,
        { ...duplicate, id: "duplicate-2" },
        createPostVariation({
          id: "distinct",
          headline: "Indicadores revelam gargalos",
          body: "Decisoes melhores com visibilidade operacional",
          caption: "Transforme dados em prioridade",
        }),
      ],
    });

    expect(result.fallbackUsed).toBe(true);
    expect(result.assessments[0].score).toBe(0);
    expect(result.assessments[2].score).toBeGreaterThan(
      result.assessments[0].score,
    );
  });
});
