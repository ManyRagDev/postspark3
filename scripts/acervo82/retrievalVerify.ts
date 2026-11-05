import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { arsenalHash } from "../../shared/arsenalContent";
import {
  componentCardV1Schema,
  compactComponentCard,
  createComponentDefinition,
  assemblyIdentity,
} from "../../shared/componentAssembly";
import { resolveDesignFamilyRepertoires } from "../../shared/designRepertoire";
import { buildFamilySelectionCandidates } from "../../shared/designFamilySelection";
import { editorialCatalogHash } from "../../shared/editorialIntent";
import type { GenerationIntent } from "../../shared/generationPlan";
import { readCatalogSnapshot } from "../../server/designCatalog/versionedCatalog";
import { readEditorialCatalog } from "../../server/designCatalog/editorialCatalog";
import {
  readSearchIndex,
  closeSearchEngines,
  sourceSearchDocument,
  validateSearchIndex,
  embedSearchText,
  buildSearchIndex,
  searchDocuments,
} from "../../server/designCatalog/familySearchIndex";
import { retrieveFamilyCandidates } from "../../server/designCatalog/familyRetrieval";
import { boundedFamilyShortlist } from "../../server/designCatalog/boundedFamilyShortlist";
import { shortlistCompleteDesigns } from "../../server/designCatalog/designShortlist";
const directory = "artifacts/acervo82/scalability";
await fs.mkdir(directory, { recursive: true });
const stage = JSON.parse(
  await fs.readFile("artifacts/acervo82/pilot/staged.json", "utf8")
);
const snapshot = await readCatalogSnapshot(stage.revision),
  catalog = (await readEditorialCatalog(stage.revision))!;
const roots = snapshot.rows
  .filter(r => r.design_components.status !== "archived")
  .map(r => componentCardV1Schema.parse(r.card))
  .filter(c => !c.completeDesign?.designGuidance?.carouselVariant);
const families = buildFamilySelectionCandidates(
  resolveDesignFamilyRepertoires(roots, {
    slideCount: 1,
    contentMode: "compose",
  }),
  catalog
);
const semantic = await readSearchIndex(stage.revision, catalog);
const makeIntent = (text: string, ids: string[] = []): GenerationIntent => ({
  version: 1,
  objective: text,
  tone: {
    description: "Claro",
    origin: "inferred",
    rationale: "Teste controlado.",
  },
  adaptation: "controlled",
  requirements: [],
  content: [{ id: "idea", meaning: text, requirementIds: [], sourceIds: [] }],
  editorial: {
    version: 1,
    signals: ids.map(intentId => ({
      intentId,
      state: "suggested",
      origin: "inferred",
      clarity: "indicative",
      requestQuote: null,
      rationale: "Intenção esperada neste teste de busca.",
    })),
  },
});
try {
  const cases = JSON.parse(
    await fs.readFile("designs/acervo82/retrieval-cases.json", "utf8")
  );
  const quality = [];
  const bareIndex = await buildSearchIndex(
    searchDocuments(roots, null),
    semantic.engine
  );
  for (const annotated of [true, false]) {
    const currentCatalog = annotated ? catalog : null;
    const currentFamilies = annotated
      ? families
      : buildFamilySelectionCandidates(
          resolveDesignFamilyRepertoires(roots, {
            slideCount: 1,
            contentMode: "compose",
          })
        );
    const currentSemantic = annotated
      ? semantic
      : { engine: semantic.engine, index: bareIndex };
    for (const test of cases) {
      const started = performance.now();
      const r = await retrieveFamilyCandidates({
        families: currentFamilies,
        intent: makeIntent(test.text, annotated ? test.intents : []),
        catalog: currentCatalog,
        semantic: currentSemantic,
      });
      const ranked = r.initialIds.map(
        id => currentFamilies.find(f => f.id === id)!.family
      );
      const hit = test.expected.some((f: string) =>
        ranked.slice(0, 3).includes(f)
      );
      quality.push({
        id: test.id,
        annotated,
        expected: test.expected,
        top3: ranked.slice(0, 3),
        hitAt3: hit,
        latencyMs: Math.round(performance.now() - started),
      });
    }
  }
  await fs.writeFile(
    `${directory}/retrieval-quality.json`,
    JSON.stringify(quality, null, 2)
  );
  console.log(
    JSON.stringify({
      qualityCases: quality.length,
      hits: quality.filter(c => c.hitAt3).length,
      misses: quality.filter(c => !c.hitAt3),
    })
  );
  const vectorCache = new Map(
    semantic.index.documents.map(d => [d.textHash, d.vector])
  );
  const capacity = [];
  for (const count of [200, 1000, 2000]) {
    const started = performance.now(),
      defs = [],
      annotations = [];
    for (let i = 0; i < count; i++) {
      const row = snapshot.rows.find(
        r => r.component_id === roots[i % roots.length].id
      )!;
      const original = (
        await import("../../server/designCatalog/versionedCatalog")
      ).readCatalogDefinition;
      // Definitions are loaded once per immutable source by the existing cache.
      const base = await original(
        stage.revision,
        row.component_id,
        row.definition_hash
      );
      const d = createComponentDefinition({
        ...base,
        id: assemblyIdentity(["capacity-native", i]),
        source: { ...base.source, variantKey: `capacity-${i}` },
        completeDesign: { ...base.completeDesign!, family: `capacity-${i}` },
      });
      defs.push(d);
      const annotation = catalog.document.designs.find(
        a => a.sourceId === base.id
      )!;
      annotations.push({ ...annotation, sourceId: d.id, sourceHash: d.hash });
    }
    const document = { ...catalog.document, designs: annotations },
      frozen = { ...catalog, document, hash: editorialCatalogHash(document) };
    const cards = defs.map(compactComponentCard),
      reps = resolveDesignFamilyRepertoires(cards, {
        slideCount: 1,
        contentMode: "compose",
      }),
      candidates = buildFamilySelectionCandidates(reps, frozen);
    const documents = [];
    for (const c of cards) {
      const d = sourceSearchDocument(c, frozen);
      const vector =
        vectorCache.get(d.textHash) ??
        (await embedSearchText(semantic.engine, d.text, "reference"));
      vectorCache.set(d.textHash, vector);
      documents.push({ ...d, vector });
    }
    const basis = {
      version: 1 as const,
      modelFingerprint: semantic.index.modelFingerprint,
      documents,
    };
    const index = validateSearchIndex({ ...basis, hash: arsenalHash(basis) });
    const retrieval = await retrieveFamilyCandidates({
      families: candidates,
      intent: makeIntent("Explique uma ideia com clareza."),
      catalog: frozen,
      semantic: { engine: semantic.engine, index },
    });
    const requests: Array<{ bytes: number; ids: string[] }> = [];
    const result = await boundedFamilyShortlist({
      families: candidates,
      retrieval,
      input: {
        cards: reps.map(r => ({
          ...r.slides[0].variants[0],
          id: r.defaultOffer.offerId,
          hash: r.defaultOffer.signature,
        })),
        brief: "Teste sintético de capacidade de transporte.",
        slideCount: 1,
        deadlineMs: null,
        editorialIntentVersion: 1,
      },
      sufficient: () => false,
      shortlist: p =>
        shortlistCompleteDesigns(p, async r => {
          requests.push({
            bytes: Buffer.byteLength(JSON.stringify(r)),
            ids: Object.keys(r.questions),
          });
          return {
            model: r.model,
            answers: Object.fromEntries(
              Object.keys(r.questions).map(id => [
                id,
                { type: "score" as const, score: 3, confidence: 0.9 },
              ])
            ),
            usage: { input_tokens: 0, output_tokens: 0, cost: 0 },
          };
        }),
    });
    assert.equal(result.familyElection.ranking.length, 36);
    assert(requests.length <= 4);
    assert(requests.every(r => r.bytes <= 48000));
    assert(requests.reduce((s, r) => s + r.bytes, 0) <= 128000);
    capacity.push({
      families: count,
      providerQuestions: requests.flatMap(r => r.ids).length,
      batches: requests.length,
      totalRequestBytes: requests.reduce((s, r) => s + r.bytes, 0),
      largestRequestBytes: Math.max(...requests.map(r => r.bytes)),
      executionMs: Math.round(performance.now() - started),
      transportJudgments:
        "stubbed; six native sources replicated, not a semantic quality test of 2000 designs",
    });
  }
  const report = {
    version: 1,
    indexHash: semantic.index.hash,
    modelFingerprint: semantic.index.modelFingerprint,
    realLocalEmbedding: true,
    paidCalls: 0,
    generationRemainsPaused: true,
    quality: {
      cases: quality,
      hitRateAt3: quality.filter(c => c.hitAt3).length / quality.length,
      expectedLabels:
        "provisional implementation fixtures, not human visual approval",
    },
    capacity,
  };
  await fs.writeFile(
    `${directory}/retrieval-report.json`,
    JSON.stringify(report, null, 2)
  );
  console.log(JSON.stringify(report, null, 2));
  assert(
    report.quality.hitRateAt3 >= 0.95,
    "Review semantic retrieval misses before enabling this pipeline."
  );
} finally {
  await closeSearchEngines();
}
