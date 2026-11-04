import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  editorialCatalogProfiles,
  findEditorialCatalogProfile,
  type EditorialCatalogProfile,
} from "./catalogProfiles";

const identity = (profile: EditorialCatalogProfile) => ({
  family: profile.familyId,
  sourceId: profile.evidence.sourceId,
  sourceHash: profile.evidence.sourceHash,
  components: profile.evidence.components,
});

describe("editorial catalogue identity", () => {
  it("keeps the 29 source repertoires distinct even when family names repeat", () => {
    expect(editorialCatalogProfiles).toHaveLength(29);
    expect(new Set(editorialCatalogProfiles.map(p => p.id)).size).toBe(29);
    expect(new Set(editorialCatalogProfiles.map(p => p.familyId)).size).toBe(
      25
    );
    const daily = editorialCatalogProfiles.filter(
      p => p.familyId === "daily-paper"
    );
    expect(daily).toHaveLength(2);
    expect(findEditorialCatalogProfile(identity(daily[0]))?.id).toBe(
      daily[0].id
    );
    expect(findEditorialCatalogProfile(identity(daily[1]))?.id).toBe(
      daily[1].id
    );
    expect(
      findEditorialCatalogProfile({
        ...identity(daily[0]),
        sourceHash: daily[1].evidence.sourceHash,
      })
    ).toBeUndefined();
  });

  it("does not transfer old annotations to a new source or changed offered variant", () => {
    const profile = editorialCatalogProfiles[0];
    expect(
      findEditorialCatalogProfile({ ...identity(profile), family: "unknown" })
    ).toBeUndefined();
    expect(
      findEditorialCatalogProfile({ ...identity(profile), sourceId: "unknown" })
    ).toBeUndefined();
    expect(
      findEditorialCatalogProfile({
        ...identity(profile),
        sourceHash: "changed",
      })
    ).toBeUndefined();
    expect(
      findEditorialCatalogProfile({
        ...identity(profile),
        components: profile.evidence.components.map((c, i) =>
          i === 1 ? { ...c, hash: "changed" } : c
        ),
      })
    ).toBeUndefined();
    expect(
      findEditorialCatalogProfile({
        ...identity(profile),
        components: [
          ...profile.evidence.components,
          { id: "new-variant", hash: "new-hash" },
        ],
      })
    ).toBeUndefined();
    expect(
      findEditorialCatalogProfile({ ...identity(profile), components: [] })
    ).toBeUndefined();
    expect(
      findEditorialCatalogProfile({
        ...identity(profile),
        components: profile.evidence.components.slice(1),
      })
    ).toBeUndefined();
  });

  it("does not offer reading annotations when only the headline cover is present", () => {
    const profile = editorialCatalogProfiles.find(
      p => p.familyId === "paper-window-requested"
    )!;
    const { components: _components, ...sourceOnly } = identity(profile);
    expect(findEditorialCatalogProfile(sourceOnly)).toBeUndefined();
    const full = findEditorialCatalogProfile(identity(profile));
    expect(full?.references).toHaveLength(4);
    expect(full?.references.some(r => r.text.includes("leitura"))).toBe(true);
  });

  it("retains only annotations supported by the actual compositions in a subset", () => {
    const profile = editorialCatalogProfiles.find(
      p => p.familyId === "versus"
    )!;
    const sourceOnly = {
      ...identity(profile),
      components: [profile.evidence.components[0]],
    };
    const found = findEditorialCatalogProfile(sourceOnly)!;
    expect(found.references.length).toBeGreaterThan(0);
    expect(
      found.references.every(r => r.evidenceComponentIds.includes(profile.id))
    ).toBe(true);
    expect(profile.references).toHaveLength(4);
  });
});

describe("offline editorial evidence and held-out cases", () => {
  it("gives every source four nonempty, evidence-backed use cases with no shared IDs", () => {
    const referenceIds = new Set<string>();
    for (const profile of editorialCatalogProfiles) {
      expect(profile.references).toHaveLength(4);
      expect(profile.id).toBe(profile.evidence.sourceId);
      const components = new Map(
        profile.evidence.components.map(c => [c.id, c.hash])
      );
      expect(components.get(profile.id)).toBe(profile.evidence.sourceHash);
      for (const reference of profile.references) {
        expect(referenceIds.has(reference.id)).toBe(false);
        referenceIds.add(reference.id);
        expect(reference.text.trim().length).toBeGreaterThan(20);
        expect(reference.evidenceComponentIds.length).toBeGreaterThan(0);
        expect(
          reference.evidenceComponentIds.every(id => components.has(id))
        ).toBe(true);
      }
    }
  });

  it("separates evaluation prompts from references and uses only real family labels", () => {
    const fixture = JSON.parse(
      readFileSync(
        path.resolve(
          "server/ai/editorialAffinity/fixtures/editorial-affinity-cases.json"
        ),
        "utf8"
      )
    );
    expect(fixture.labelStatus).toBe(
      "engineering_hypotheses_pending_editorial_review"
    );
    const families = new Set(editorialCatalogProfiles.map(p => p.familyId));
    const referenceTexts = new Set(
      editorialCatalogProfiles.flatMap(p => p.references.map(r => r.text))
    );
    expect(new Set(fixture.cases.map((c: any) => c.id)).size).toBe(
      fixture.cases.length
    );
    for (const entry of fixture.cases) {
      expect(referenceTexts.has(entry.prompt)).toBe(false);
      const labels = [
        ...entry.expected.preferredFamilyIds,
        ...entry.expected.acceptableFamilyIds,
        ...entry.expected.disfavoredFamilyIds,
      ];
      expect(labels.every((id: string) => families.has(id))).toBe(true);
      expect(
        entry.expected.preferredFamilyIds.some((id: string) =>
          entry.expected.disfavoredFamilyIds.includes(id)
        )
      ).toBe(false);
      if (entry.expected.signal === "rankable")
        expect(entry.expected.preferredFamilyIds.length).toBeGreaterThan(0);
      else expect(labels).toHaveLength(0);
    }
    expect(fixture.cases.some((c: any) => c.tags.includes("negation"))).toBe(
      true
    );
    expect(
      fixture.cases.filter(
        (c: any) => c.contrastGroup === "same-treatment-comparison"
      )
    ).toHaveLength(3);
    expect(
      fixture.cases.filter((c: any) => c.expected.signal === "insufficient")
        .length
    ).toBeGreaterThanOrEqual(5);
  });
});

// The r9 package is a local catalogue artifact, not a CI dependency. This check
// verifies the annotation provenance against its actual immutable definitions
// when that package is available, and never claims remote publication/approval.
const manifestPath = path.resolve(
  "artifacts/complete-designs/catalog-repertoire-2026-11-01-v3-r9/manifest.json"
);
describe.skipIf(!existsSync(manifestPath))("local r9 provenance", () => {
  it("matches every root, variant hash and authored composition in the frozen package", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    expect(manifest.rows).toHaveLength(editorialCatalogProfiles.length);
    for (const profile of editorialCatalogProfiles) {
      const row = manifest.rows.find((r: any) => r.componentId === profile.id);
      expect(row.family).toBe(profile.familyId);
      expect(row.componentHash).toBe(profile.evidence.sourceHash);
      expect([row.componentId, ...row.variantIds].sort()).toEqual(
        profile.evidence.components.map(c => c.id).sort()
      );
      for (const component of profile.evidence.components) {
        const definition = JSON.parse(
          readFileSync(
            path.join(
              path.dirname(profile.evidence.sourcePath),
              `${component.id}.json`
            ),
            "utf8"
          )
        );
        expect(definition.hash).toBe(component.hash);
        expect(definition.completeDesign.family).toBe(profile.familyId);
        if (component.id === profile.id)
          expect(definition.completeDesign.designGuidance.summary).toBe(
            profile.evidence.composition
          );
      }
    }
  });
});
