import { describe, expect, it, vi } from "vitest";
import { arsenalHash } from "@shared/arsenalContent";
import {
  assemblyIdentity,
  compactComponentCard,
  createComponentDefinition,
} from "@shared/componentAssembly";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { resolveDesignFamilyRepertoires } from "@shared/designRepertoire";
import { buildFamilySelectionCandidates } from "@shared/designFamilySelection";
import type { GenerationIntent } from "@shared/generationPlan";
import type { EmbeddingEngine } from "../ai/editorialAffinity/embeddingEngine";
import {
  retrieveFamilyCandidates,
  assertFamilyRetrieval,
  familySearchQuery,
} from "./familyRetrieval";
import {
  buildSearchIndex,
  searchDocuments,
  validateSearchIndex,
} from "./familySearchIndex";
import { boundedFamilyShortlist } from "./boundedFamilyShortlist";
import { shortlistCompleteDesigns, type JevRequest } from "./designShortlist";

export function retrievalFixture(count = 200) {
  const source = completeDesignTestDefinitions()[0];
  const definitions = Array.from({ length: count }, (_, i) =>
    createComponentDefinition({
      ...source,
      id: assemblyIdentity(["retrieval-fixture", i]),
      label: `Composição ${i}`,
      source: { ...source.source, variantKey: `source-${i}` },
      completeDesign: { ...source.completeDesign!, family: `family-${i}` },
    })
  );
  const cards = definitions.map(compactComponentCard);
  const repertoires = resolveDesignFamilyRepertoires(cards, {
    slideCount: 1,
    contentMode: "compose",
  });
  const families = buildFamilySelectionCandidates(repertoires);
  const projections = repertoires.map(r => ({
    ...r.slides[0].variants[0],
    id: r.defaultOffer.offerId,
    hash: r.defaultOffer.signature,
  }));
  const intent: GenerationIntent = {
    version: 1,
    objective: "Explique uma ideia com clareza",
    tone: { description: "Claro", origin: "explicit", rationale: "Pedido" },
    adaptation: "controlled",
    requirements: [],
    content: [
      {
        id: "idea",
        meaning: "Explicar uma ideia",
        requirementIds: [],
        sourceIds: [],
      },
    ],
    editorial: { version: 1, signals: [] },
  };
  // Unit boundary only: this vector is not evidence of semantic model quality.
  const engine = {
    metadata: { fingerprint: "a".repeat(64), dimensions: 384 },
    embed: vi.fn(async (chunks: string[]) => ({
      vectors: chunks.map(() =>
        Float32Array.from({ length: 384 }, (_, i) => (i === 0 ? 1 : 0))
      ),
      inputs: chunks.map(() => ({
        tokenCount: 1,
        usedTokens: 1,
        truncated: false,
      })),
    })),
    dispose: async () => {},
  } as unknown as EmbeddingEngine;
  return {
    cards,
    definitions,
    repertoires,
    families,
    projections,
    intent,
    engine,
  };
}
const answer = (request: JevRequest, score: number) => ({
  model: request.model,
  answers: Object.fromEntries(
    Object.keys(request.questions).map(id => [
      id,
      { type: "score" as const, score, confidence: 0.9 },
    ])
  ),
  usage: { input_tokens: 100, output_tokens: 10, cost: 0 },
});

describe("bounded hybrid family retrieval", () => {
  it.each([200, 1000, 2000])(
    "keeps provider work bounded with %i eligible families",
    async count => {
      const f = retrievalFixture(count),
        index = await buildSearchIndex(
          searchDocuments(f.cards, null),
          f.engine
        );
      const retrieval = await retrieveFamilyCandidates({
        ...f,
        catalog: null,
        semantic: { engine: f.engine, index },
      });
      expect(retrieval.initialIds).toHaveLength(24);
      expect(retrieval.additionalIds).toHaveLength(12);
      const requests: JevRequest[] = [];
      const result = await boundedFamilyShortlist({
        families: f.families,
        retrieval,
        input: {
          cards: f.projections,
          brief: "Explique uma ideia.",
          slideCount: 1,
          deadlineMs: null,
          editorialIntentVersion: 1,
        },
        shortlist: p =>
          shortlistCompleteDesigns(p, async request => {
            requests.push(request);
            return answer(request, 3);
          }),
        sufficient: () => false,
      });
      expect(requests.flatMap(r => Object.keys(r.questions))).toHaveLength(36);
      expect(
        new Set(requests.flatMap(r => Object.keys(r.questions))).size
      ).toBe(36);
      expect(requests.length).toBeLessThanOrEqual(4);
      expect(
        requests.every(r => Buffer.byteLength(JSON.stringify(r)) <= 48000)
      ).toBe(true);
      expect(
        requests.reduce((n, r) => n + Buffer.byteLength(JSON.stringify(r)), 0)
      ).toBeLessThanOrEqual(128000);
      expect(result.familyElection.candidates).toHaveLength(count);
      expect(result.familyElection.ranking).toHaveLength(36);
      expect(result.familyElection.retrieval?.expanded).toBe(true);
    },
    30_000
  );
  it("stops after the first sufficient wave and preserves zero/unknown assessments honestly", async () => {
    const f = retrievalFixture(40),
      index = await buildSearchIndex(searchDocuments(f.cards, null), f.engine);
    const retrieval = await retrieveFamilyCandidates({
      ...f,
      catalog: null,
      semantic: { engine: f.engine, index },
    });
    const requests: JevRequest[] = [];
    const result = await boundedFamilyShortlist({
      families: f.families,
      retrieval,
      input: {
        cards: f.projections,
        brief: "Texto",
        slideCount: 1,
        deadlineMs: null,
        editorialIntentVersion: 1,
      },
      shortlist: p =>
        shortlistCompleteDesigns(p, async r => {
          requests.push(r);
          return answer(r, 1);
        }),
      sufficient: () => true,
    });
    expect(requests.flatMap(r => Object.keys(r.questions))).toHaveLength(24);
    expect(result.familyElection.shortlistedIds).toEqual([]);
    expect(result.familyElection.ranking).toHaveLength(24);
    expect(result.familyElection.retrieval?.expanded).toBe(false);
  });
  it("never falls back to sending the whole catalogue if the index is absent, stale or corrupt", async () => {
    const f = retrievalFixture(25);
    await expect(
      retrieveFamilyCandidates({ ...f, catalog: null })
    ).rejects.toThrow("index_required");
    const index = await buildSearchIndex(
      searchDocuments(f.cards, null),
      f.engine
    );
    index.documents[0].sourceHash = "b".repeat(64);
    await expect(
      retrieveFamilyCandidates({
        ...f,
        catalog: null,
        semantic: { engine: f.engine, index },
      })
    ).rejects.toThrow("index_stale");
    expect(() => validateSearchIndex(index)).toThrow("index_invalid");
  });
  it("uses every small-catalogue family without requiring an encoder or editorial tags", async () => {
    const f = retrievalFixture(6);
    const retrieval = await retrieveFamilyCandidates({ ...f, catalog: null });
    expect(new Set(retrieval.initialIds)).toEqual(
      new Set(f.families.map(f => f.id))
    );
    expect(retrieval.indexHash).toBeNull();
    expect(f.engine.embed).not.toHaveBeenCalled();
    assertFamilyRetrieval(
      retrieval,
      f.families,
      familySearchQuery(f.intent, null)
    );
    const reordered = await retrieveFamilyCandidates({
      ...f,
      families: [...f.families].reverse(),
      catalog: null,
    });
    expect(reordered).toEqual(retrieval);
    retrieval.initialIds[0] = "invented";
    expect(() =>
      assertFamilyRetrieval(
        retrieval,
        f.families,
        familySearchQuery(f.intent, null)
      )
    ).toThrow();
  });
  it("reuses precomputed source vectors and invalidates changed descriptions", async () => {
    const f = retrievalFixture(3),
      documents = searchDocuments(f.cards, null);
    const first = await buildSearchIndex(documents, f.engine);
    vi.mocked(f.engine.embed).mockClear();
    expect(await buildSearchIndex(documents, f.engine, first)).toEqual(first);
    expect(f.engine.embed).not.toHaveBeenCalled();
    documents[0].text += " Alteração editorial.";
    documents[0].textHash = arsenalHash(documents[0].text);
    const changed = await buildSearchIndex(documents, f.engine, first);
    expect(changed.hash).not.toBe(first.hash);
    expect(f.engine.embed).toHaveBeenCalledTimes(1);
  });
  it("refuses an oversized provider wave before dispatch, preserving the full brief", async () => {
    const f = retrievalFixture(3),
      retrieval = await retrieveFamilyCandidates({ ...f, catalog: null });
    const evaluate = vi.fn();
    await expect(
      boundedFamilyShortlist({
        families: f.families,
        retrieval,
        input: {
          cards: f.projections,
          brief: "contexto extenso ".repeat(10000),
          slideCount: 1,
          deadlineMs: null,
          editorialIntentVersion: 1,
        },
        shortlist: p => shortlistCompleteDesigns(p, evaluate),
        sufficient: () => false,
      })
    ).rejects.toThrow("context_too_large");
    expect(evaluate).not.toHaveBeenCalled();
  });
});
