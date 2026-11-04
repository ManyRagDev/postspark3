import { describe, expect, it } from "vitest";
import { arsenalHash } from "./arsenalContent";
import { assemblyIdentity, compactComponentCard, createComponentDefinition, type ComponentCardV1 } from "./componentAssembly";
import { completeDesignTestDefinitions } from "./completeDesignGeneration.fixture";
import { resolveDesignFamilyRepertoires } from "./designRepertoire";
import { editorialCatalogHash, type FrozenEditorialCatalog } from "./editorialIntent";
import { authorFamilyCarouselVariant } from "../server/designCatalog/familyCarouselRepertoire";
import { buildFamilySelectionCandidates, familySelectionProfileLegend } from "./designFamilySelection";

function roots() {
  return completeDesignTestDefinitions().map((definition, index) => createComponentDefinition({
    ...definition,
    completeDesign: {
      ...definition.completeDesign!, family: index < 2 ? "paper" : "window",
      designGuidance: {
        version: 1, summary: "Uma composição com título e apoio.",
        motifs: ["layered-paper", `root-motif-${index}`], preserve: [], contentRules: [], mediaRules: [], knownLimitations: [],
        familyIdentity: { essential: ["shared-paper", `root-essential-${index}`], optional: [`optional-${index}`], adaptable: ["texto nos campos nativos"] },
        fieldRelationships: [{ kind: "emphasis", sources: ["block:headline:0:text"], label: "Um título contínuo" }],
      },
    },
  }));
}

function staticRepertoires(cards = roots().map(compactComponentCard)) {
  return resolveDesignFamilyRepertoires(cards, { slideCount: 1, contentMode: "compose" });
}

function carouselFixture() {
  const source = roots()[0];
  const development = authorFamilyCarouselVariant(source, "development", "compose", "reading");
  const closing = authorFamilyCarouselVariant(source, "closing", "compose", "synthesis");
  const cards = [source, development, closing].map(compactComponentCard);
  return { source, development, closing, cards, repertoires: resolveDesignFamilyRepertoires(cards, { slideCount: 5, contentMode: "compose" }) };
}

function catalogFor(cards: ComponentCardV1[]): FrozenEditorialCatalog {
  const document = { version: 1 as const, intents: [
    { id: "explicar", label: "Explicar", description: "Desenvolver uma ideia com razões." },
    { id: "comparar", label: "Comparar", description: "Confrontar alternativas." },
    { id: "unused", label: "Sem vínculo", description: "Não atribuída aos designs ofertados." },
  ], designs: cards.slice(0, 2).map((card, index) => ({
    sourceId: card.id, sourceHash: card.hash, intentIds: [index ? "comparar" : "explicar"], rationale: `Justificativa editorial ${index}.`,
  })) };
  return { version: 1, catalogRevision: "4", revision: "10000000-0000-4000-8000-000000000001", document, hash: editorialCatalogHash(document) };
}

describe("family-first selection candidates", () => {
  it("elects one candidate per family while retaining each distinct root repertoire", () => {
    const repertoires = staticRepertoires();
    const before = arsenalHash(repertoires);
    const candidates = buildFamilySelectionCandidates(repertoires);
    expect(candidates.map(candidate => candidate.family)).toEqual(["paper", "window"]);
    expect(candidates[0].repertoires).toHaveLength(2);
    expect(candidates[1].repertoires).toHaveLength(1);
    expect(new Set(candidates[0].repertoires.map(repertoire => repertoire.sourceId)).size).toBe(2);
    expect(candidates[0].id).toMatch(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
    expect(candidates[0].profile).toMatchObject({ version: 4, kind: "editorial_family", family: "paper" });
    expect(arsenalHash(repertoires)).toBe(before);
    expect(candidates[0].repertoires.every(repertoire => repertoires.includes(repertoire))).toBe(true);
  });

  it("keeps identities stable under input/catalog ordering and repeated membership", () => {
    const cards = roots().map(compactComponentCard);
    const repertoires = staticRepertoires(cards);
    const catalog = catalogFor(cards);
    const reordered = structuredClone(catalog);
    reordered.document.intents.reverse();
    reordered.document.designs.reverse();
    const first = buildFamilySelectionCandidates(repertoires, catalog);
    const second = buildFamilySelectionCandidates([...repertoires].reverse().concat(repertoires[0]), reordered);
    expect(second).toEqual(first);
    expect(buildFamilySelectionCandidates([])).toEqual([]);
  });

  it("binds candidate identity to every member signature even if its semantic profile is unchanged", () => {
    const fixture = carouselFixture();
    const original = buildFamilySelectionCandidates(fixture.repertoires)[0];
    const extraChild = createComponentDefinition({ ...fixture.development, id: assemblyIdentity(["additional-reading-composition"]) });
    const expanded = resolveDesignFamilyRepertoires([...fixture.cards, compactComponentCard(extraChild)], { slideCount: 5, contentMode: "compose" });
    const updated = buildFamilySelectionCandidates(expanded)[0];
    expect(updated.profile).toEqual(original.profile);
    expect(updated.signature).not.toBe(original.signature);
    expect(updated.id).not.toBe(original.id);
    expect(updated.repertoires).toHaveLength(1);
  });

  it("does not send child identities, native fields, geometry or sequence in the family profile", () => {
    const fixture = carouselFixture();
    const candidate = buildFamilySelectionCandidates(fixture.repertoires)[0];
    const profileText = JSON.stringify(candidate.profile);
    for (const card of fixture.cards) {
      expect(profileText).not.toContain(card.id);
      expect(profileText).not.toContain(card.hash);
      for (const field of card.fields) expect(profileText).not.toContain(field.source);
    }
    const keys = (value: unknown): string[] => Array.isArray(value) ? value.flatMap(keys) : value && typeof value === "object"
      ? Object.entries(value).flatMap(([key, item]) => [key, ...keys(item)]) : [];
    for (const key of ["componentId", "sourceId", "offerId", "variants", "sequence", "slides", "fields", "regions", "x", "y", "width", "height", "fontSize"])
      expect(keys(candidate.profile)).not.toContain(key);
    expect(candidate.profile.availability).toEqual({ roles: ["closing", "cover", "development"], functions: ["reading", "synthesis"] });
    expect(candidate.profile.aesthetic.motifs).not.toContain("reading");
  });

  it("aggregates canonical root capacities as ranges, never by adding alternatives or pages", () => {
    const cards = roots().slice(0, 2).map(compactComponentCard);
    cards[0].fields.push({ ...cards[0].fields[0] }); // Multiple render targets still share one canonical value.
    cards[0].fields.push(
      { source: "block:list:0:items", kind: "list", required: false, cardinality: { min: 1, max: 3 } },
      { source: "block:list:1:items", kind: "list", required: false, cardinality: { min: 1, max: 2 } },
    );
    cards[1].fields.push(
      { source: "block:body:1:text", kind: "text", required: false, cardinality: null },
      { source: "block:list:0:items", kind: "list", required: false, cardinality: { min: 2, max: 5 } },
    );
    cards[1].mediaSlots.push({ id: "photo", label: "Photo", function: "Fotografia", prompt: "", deferred: true, policy: "cover" });
    const candidate = buildFamilySelectionCandidates(staticRepertoires(cards))[0];
    expect(candidate.profile.structure).toEqual({ capacityRule: "ranges_across_root_designs_not_additive",
      textBlocks: { min: 2, max: 3 }, listBlocks: { min: 1, max: 2 }, listItemsPerBlock: { min: 1, max: 5 },
      mediaSlots: { min: 0, max: 1 }, relationships: ["emphasis"] });
    const carousel = buildFamilySelectionCandidates(carouselFixture().repertoires)[0];
    expect(carousel.profile.structure.textBlocks).toEqual({ min: 2, max: 2 });
    expect(familySelectionProfileLegend).toContain("Different range maxima may belong to different roots");
  });

  it("treats unknown list cardinality as unknown instead of inventing a limit", () => {
    const cards = roots().slice(0, 1).map(compactComponentCard);
    cards[0].fields.push({ source: "block:list:0:items", kind: "list", required: false, cardinality: null });
    const profile = buildFamilySelectionCandidates(staticRepertoires(cards))[0].profile;
    expect(profile.structure.listBlocks).toEqual({ min: 1, max: 1 });
    expect(profile.structure.listItemsPerBlock).toBeNull();
  });

  it("uses root-hash-verified editorial intentions and no unrelated or stale annotations", () => {
    const cards = roots().map(compactComponentCard);
    const catalog = catalogFor(cards);
    catalog.document.designs[0].sourceHash = "f".repeat(64);
    catalog.hash = editorialCatalogHash(catalog.document);
    const candidates = buildFamilySelectionCandidates(staticRepertoires(cards), catalog);
    expect(candidates[0].profile.editorial).toEqual({ catalogHash: catalog.hash,
      intents: [catalog.document.intents[1]], rationales: ["Justificativa editorial 1."] });
    expect(candidates[1].profile.editorial).toEqual({ catalogHash: catalog.hash, intents: [], rationales: [] });
    expect(buildFamilySelectionCandidates(staticRepertoires(cards))[0].profile.editorial)
      .toEqual({ catalogHash: null, intents: [], rationales: [] });
  });

  it("combines family aptitudes without duplicating shared definitions or confusing them with universal obligations", () => {
    const cards = roots().map(compactComponentCard);
    const catalog = catalogFor(cards);
    catalog.document.designs[1].intentIds.push("explicar");
    catalog.hash = editorialCatalogHash(catalog.document);
    const profile = buildFamilySelectionCandidates(staticRepertoires(cards), catalog)[0].profile;
    expect(profile.editorial.intents.map(intent => intent.id)).toEqual(["comparar", "explicar"]);
    expect(profile.aesthetic.identity.essential).toEqual(["shared-paper"]);
    expect(profile.aesthetic.motifs).toEqual(["layered-paper", "root-motif-0", "root-motif-1"]);
    const changed = structuredClone(catalog);
    changed.document.intents[0].description = "Nova descrição editorial revisada.";
    changed.hash = editorialCatalogHash(changed.document);
    expect(buildFamilySelectionCandidates(staticRepertoires(cards), changed)[0].signature)
      .not.toBe(buildFamilySelectionCandidates(staticRepertoires(cards), catalog)[0].signature);
  });

  it("does not mistake a source name or child provenance for a verified root", () => {
    const fixture = carouselFixture();
    const wrongHash = structuredClone(fixture.repertoires);
    wrongHash[0].sourceHash = "a".repeat(64);
    expect(() => buildFamilySelectionCandidates(wrongHash)).toThrow("family_selection_source_identity_mismatch");
    const conflict = structuredClone(fixture.repertoires[0]);
    conflict.signature = "b".repeat(64);
    expect(() => buildFamilySelectionCandidates([...fixture.repertoires, conflict])).toThrow("family_selection_member_identity_conflict");
    const forged = structuredClone(fixture.repertoires[0]);
    forged.slides[0].variants[0].fields.pop();
    for (const members of [[...fixture.repertoires, forged], [forged, ...fixture.repertoires]])
      expect(() => buildFamilySelectionCandidates(members)).toThrow("family_selection_member_identity_conflict");
  });
});
