import { describe, expect, it } from "vitest";
import { discardUnattributedEditorialSignals, editorialCatalogDocumentSchema, editorialCatalogHash, frozenEditorialCatalogSchema, validateEditorialIntent, combineEditorialDesignProfile, type FrozenEditorialCatalog, type EditorialIntentReading } from "./editorialIntent";
import { materialGenerationIntent } from "./generationPlan";

const document = {
  version: 1 as const,
  intents: [
    { id: "comparar", label: "Comparar", description: "Confrontar alternativas por critérios." },
    { id: "avaliar_limites", label: "Avaliar limites", description: "Explicar pontos negativos e limitações." },
  ],
  designs: [{ sourceId: "00000000-0000-4000-8000-000000000001", sourceHash: "a".repeat(64), intentIds: ["comparar"], rationale: "Dois lados com rótulos próprios." }],
};
const catalog: FrozenEditorialCatalog = { version: 1, revision: "00000000-0000-4000-8000-000000000002", catalogRevision: "4", hash: editorialCatalogHash(document), document };
const reading = (overrides = {}): EditorialIntentReading => ({ version: 1, signals: [{ intentId: "comparar", state: "requested", origin: "explicit", clarity: "clear", requestQuote: "Compare A e B", rationale: "O pedido nomeia as alternativas.", ...overrides }] });

describe("partial editorial reading", () => {
  it("accepts a short clear request and treats unmentioned intentions as neutral", () => {
    expect(validateEditorialIntent(reading(), catalog, "Compare A e B")).toEqual([]);
    expect(validateEditorialIntent({ version: 1, signals: [] }, catalog, "faça algo interessante")).toEqual([]);
    expect(reading().signals.map(s => s.intentId)).not.toContain("avaliar_limites");
  });
  it("does not turn points negatives into comparison or its prohibition", () => {
    const value = reading({ intentId: "avaliar_limites", requestQuote: "pontos negativos do carro X" });
    expect(validateEditorialIntent(value, catalog, "Quais os pontos negativos do carro X?")).toEqual([]);
    expect(value.signals).toHaveLength(1);
  });
  it("rejects unknown/duplicate IDs, invented quotes and inferred prohibitions", () => {
    expect(validateEditorialIntent(reading({ intentId: "inventado" }), catalog, "Compare A e B")).toContain("unknown_editorial_intent:inventado");
    expect(validateEditorialIntent({ version: 1, signals: [...reading().signals, ...reading().signals] }, catalog, "Compare A e B")).toContain("duplicate_editorial_intent:comparar");
    expect(validateEditorialIntent(reading(), catalog, "Explique A")).toContain("editorial_quote:comparar");
    expect(validateEditorialIntent(reading({ state: "forbidden", requestQuote: " \n\t " }), catalog, "Faça um anúncio")).toContain("editorial_quote:comparar");
    expect(validateEditorialIntent(reading({ state: "forbidden", origin: "inferred", clarity: "indicative", requestQuote: null }), catalog, "Explique A")).toContain("editorial_prohibition:comparar");
    expect(validateEditorialIntent(reading({ state: "suggested", origin: "inferred", clarity: "indicative", requestQuote: null }), catalog, "Explique A")).toEqual([]);
  });
  it("accepts explicit specific prohibitions and empty catalogs without fabricating a classification", () => {
    expect(validateEditorialIntent(reading({ state: "forbidden", requestQuote: "Não compare" }), catalog, "Não compare; explique os limites")).toEqual([]);
    expect(validateEditorialIntent({ version: 1, signals: [] }, null, "Compare A e B")).toEqual([]);
    expect(validateEditorialIntent(reading(), null, "Compare A e B")).toContain("unknown_editorial_intent:comparar");
  });
  it("drops a noncontiguous affinity quote while preserving a verified prohibition", () => {
    const brief = "Compare A. Use uma capa clara. Mostre B. Não discuta os limites.";
    const valid = reading({ intentId: "avaliar_limites", state: "forbidden", requestQuote: "Não discuta os limites." }).signals[0];
    const combined = reading({ requestQuote: "Compare A. Mostre B." });
    const repaired = discardUnattributedEditorialSignals({ ...combined, signals: [...combined.signals, valid] }, catalog, brief);
    expect(repaired.signals).toEqual([valid]);
    expect(validateEditorialIntent(repaired, catalog, brief)).toEqual([]);
    const unsupportedProhibition = reading({ state: "forbidden", requestQuote: "Não compare A." });
    expect(discardUnattributedEditorialSignals(unsupportedProhibition, catalog, brief)).toEqual(unsupportedProhibition);
  });
  it("preserves the reading without creating material obligations", () => {
    const intent = { version: 1 as const, objective: "Explicar", tone: { description: "Claro", origin: "inferred" as const, rationale: "Didático" }, adaptation: "controlled" as const,
      requirements: [{ id: "format", description: "Sem foto", kind: "execution" as const, surface: "art" as const, origin: "explicit" as const, requestQuote: "sem foto", itemCount: null }],
      content: [{ id: "a", meaning: "Ideia", requirementIds: [], sourceIds: [] }], editorial: reading() };
    expect(materialGenerationIntent(intent)).toMatchObject({ requirements: [], editorial: reading() });
  });
});

describe("editorial catalog identity", () => {
  it("hashes canonical order and rejects corrupted snapshots and dangling references", () => {
    expect(editorialCatalogHash({ ...document, intents: [...document.intents].reverse() })).toBe(catalog.hash);
    expect(frozenEditorialCatalogSchema.safeParse(catalog).success).toBe(true);
    expect(frozenEditorialCatalogSchema.safeParse({ ...catalog, hash: "f".repeat(64) }).success).toBe(false);
    expect(editorialCatalogDocumentSchema.safeParse({ ...document, intents: [] }).success).toBe(false);
  });
  it("adds only exact source identity matches, keeping unannotated designs neutral", () => {
    const profile = { family: "Test" };
    expect(combineEditorialDesignProfile(profile, catalog, document.designs[0].sourceId, "a".repeat(64)).editorial?.intents.map(i => i.id)).toEqual(["comparar"]);
    expect(combineEditorialDesignProfile(profile, catalog, document.designs[0].sourceId, "b".repeat(64))).toBe(profile);
    expect(combineEditorialDesignProfile(profile, null, document.designs[0].sourceId, "a".repeat(64))).toBe(profile);
  });
});
