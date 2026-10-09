import { describe, expect, it } from "vitest";
import fixture from "../client/src/pages/CanvasLab/arsenal/windowFixture.json";
import {
  arsenalImportSchema,
  compactArsenalCard,
  describeArsenalVariant,
  arsenalCardCompatible,
  arsenalSearchHitSchema,
} from "./arsenalCatalog";
import { arsenalHash } from "./arsenalContent";
import { projectStructuralL1 } from "./designDescriptorMetric";
import { mergeArsenalNeighbors } from "../server/designCatalog/arsenalQueryProfiles";
const pkg = () => {
  const pieces = Object.fromEntries(
    Object.values(fixture.pieces).map(p => {
      const piece = p.fixedText ? { ...p, fixedTextRole: "ornament" } : p;
      return [arsenalHash(piece), piece];
    })
  );
  const remap = Object.fromEntries(
    Object.entries(fixture.pieces).map(([hash, p]) => [
      hash,
      arsenalHash(p.fixedText ? { ...p, fixedTextRole: "ornament" } : p),
    ])
  );
  const variant = {
    ...fixture.variant,
    instances: fixture.variant.instances.map(i => ({
      ...i,
      pieceHash: remap[i.pieceHash],
    })),
  };
  return arsenalImportSchema.parse({
    format: "postspark.arsenal.import",
    version: 1,
    blueprintId: fixture.origin.blueprintId,
    pieces,
    definition: {
      schemaVersion: 2,
      compilerVersion: fixture.variant.compilerVersion,
      name: "Fixture isolada",
      description: "Teste de contrato, sem publicação",
      tags: [],
      intentions: ["list"],
      variants: [variant],
      assets: fixture.assets,
      provenance: {
        sourceFileHash: "a".repeat(64),
        sourceRecipeHash: "b".repeat(64),
        converterVersion: "test-only",
        notes: [],
      },
    },
  });
};
describe("Arsenal V2 import and compact retrieval contracts", () => {
  it("indexes 48 finite axes from geometry with pinned variant identity", () => {
    const p = pkg(),
      v = p.definition.variants[0],
      d = describeArsenalVariant(v, p.pieces);
    expect(projectStructuralL1(d.structure)).toHaveLength(48);
    const card = compactArsenalCard(p.definition, v);
    expect(card.fields.map(f => f.source)).toContain("headline");
    expect(JSON.stringify(card)).not.toMatch(/pieceHash|projected|instances/);
  });
  it("rejects tampered pieces, missing fonts, incomplete bindings and undeclared capabilities", () => {
    const p = pkg(),
      hash = Object.keys(p.pieces)[0];
    const tampered = structuredClone(p);
    tampered.pieces[hash].fill = "#FF0000";
    expect(() => arsenalImportSchema.parse(tampered)).toThrow("Hash");
    const missing = structuredClone(p);
    missing.definition.assets = [];
    expect(() => arsenalImportSchema.parse(missing)).toThrow("Manifesto");
    const binding = structuredClone(p);
    binding.definition.variants[0].bindings =
      binding.definition.variants[0].bindings.filter(
        b => b.source !== "headline"
      );
    expect(() => arsenalImportSchema.parse(binding)).toThrow("headline");
    const cap = structuredClone(p);
    cap.definition.variants[0].capabilities = [];
    expect(() => arsenalImportSchema.parse(cap)).toThrow("Capacidade");
  });
  it("excludes required media before hydration and produces a stable diverse shortlist", () => {
    const p = pkg(),
      v = p.definition.variants[0];
    const hit = arsenalSearchHitSchema.parse({
      candidateId: fixture.origin.candidateId,
      versionId: fixture.origin.versionId,
      blueprintId: fixture.origin.blueprintId,
      version: 1,
      definitionHash: arsenalHash(p.definition),
      variantKey: v.variantKey,
      variantHash: arsenalHash(v),
      distance: 0,
      card: compactArsenalCard(p.definition, v),
    });
    expect(arsenalCardCompatible(hit, fixture.content as any, "5:6")).toBe(
      false
    );
    const duplicate = { ...hit, candidateId: "same-blueprint-other-variant" };
    const other = {
      ...hit,
      candidateId: "other",
      blueprintId: "00000000-0000-4000-8000-000000000099",
    };
    expect(
      mergeArsenalNeighbors([
        [hit, duplicate, other],
        [other, hit],
      ]).map(h => h.candidateId)
    ).toEqual([hit.candidateId, "other"]);
  });
});
