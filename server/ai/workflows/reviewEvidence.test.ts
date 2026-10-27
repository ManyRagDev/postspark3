import { describe, it, expect } from "vitest";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { createComponentDefinition } from "@shared/componentAssembly";
import { instantiateCompleteDesign } from "@shared/completeDesignGeneration";
import { resolveArsenalGeometry } from "@shared/arsenalGeometry";
import {
  reviewEvidenceAnchors,
  buildReviewEvidenceAliases,
  resolveReviewEvidenceV6,
} from "./reviewEvidence";

describe("visible list evidence identities", () => {
  it.each(["native-slots", "repeat"])(
    "anchors each %s item by its compiled identity and excludes hidden items and divergent bindings",
    (mode) => {
      const base = structuredClone(completeDesignTestDefinitions()[0]),
        binding = base.fragment.bindings.find((b) => b.id === "support")!;
      Object.assign(binding, {
        source: "block:list:0:items",
        kind: "list",
        listMode: mode === "native-slots" ? "native-slots" : undefined,
        cardinality: { min: 1, max: 2 },
      });
      if (mode === "native-slots") {
        base.fragment.instances.push({
          ...base.fragment.instances.find((i) => i.id === "support")!,
          id: "support-2",
          y: 700,
        });
        binding.targetIds.push("support-2");
      }
      const definition = createComponentDefinition(base),
        copy = {
          caption: "",
          hashtags: [],
          slides: [
            {
              values: [
                { fieldId: "field-0", value: "Título" },
                {
                  fieldId: "field-1",
                  value: ["Mesmo texto", "Mesmo texto"],
                },
              ],
              mediaPrompts: [],
            },
          ],
        };
      const scene = resolveArsenalGeometry(
        instantiateCompleteDesign({
          definition,
          values: copy.slides[0].values,
          mediaPrompts: [],
          runId: "11111111-1111-4111-8111-111111111111",
          slot: 0,
          slide: 0,
          planHash: "a".repeat(64),
          experimental: true,
        }),
        { measureText: () => ({ height: 20, lines: [{ width: 100 }], runs: [] }) }
      );
      const list = scene.elements.filter((e) => e.itemId);
      expect(list).toHaveLength(2);
      list[1].opacity = 0;
      const anchors = reviewEvidenceAnchors(copy, [scene]);
      expect(anchors.filter((a) => a.fieldId === "field-1").map((a) => a.itemIndex)).toEqual([0]);
      list[0].bindingId = scene.base.bindings.find((b) => b.source === "content:field-0:text")!.id;
      expect(reviewEvidenceAnchors(copy, [scene]).some((a) => a.fieldId === "field-1")).toBe(false);
    }
  );

  it("assigns deterministic aliases e1, e2, ... and resolves them to literal evidence", () => {
    const dummyAnchors = [
      { anchorId: "anchor-b", slideIndex: 1, fieldId: "field-b", itemIndex: null, start: 0, end: 10, quote: "Quote B", textHash: "hash-b" },
      { anchorId: "anchor-a", slideIndex: 0, fieldId: "field-a", itemIndex: null, start: 0, end: 10, quote: "Quote A", textHash: "hash-a" },
      { anchorId: "anchor-c", slideIndex: 0, fieldId: "field-a", itemIndex: null, start: 10, end: 20, quote: "Quote C", textHash: "hash-c" },
    ];
    const { inventory, aliasMap, promptInventory } = buildReviewEvidenceAliases(dummyAnchors);
    expect(inventory.map((i) => i.alias)).toEqual(["e1", "e2", "e3"]);
    expect(inventory[0].anchorId).toBe("anchor-a");
    expect(inventory[1].anchorId).toBe("anchor-c");
    expect(inventory[2].anchorId).toBe("anchor-b");
    expect(promptInventory[0]).not.toHaveProperty("anchorId");
    expect(promptInventory[0]).not.toHaveProperty("textHash");

    const resolved = resolveReviewEvidenceV6(["e1", "e3"], aliasMap, dummyAnchors);
    expect(resolved).toEqual([
      { slideIndex: 0, fieldId: "field-a", quote: "Quote A" },
      { slideIndex: 1, fieldId: "field-b", quote: "Quote B" },
    ]);

    expect(() => resolveReviewEvidenceV6(["e1", "e1"], aliasMap, dummyAnchors)).toThrow(
      "proposal_review_duplicate_evidence_reference"
    );
    expect(() => resolveReviewEvidenceV6(["e99"], aliasMap, dummyAnchors)).toThrow(
      "proposal_review_unknown_evidence_reference"
    );
  });

  it("proves > 40% character reduction in prompt inventory by omitting 64-char anchorId and textHash", () => {
    const realisticAnchors = Array.from({ length: 15 }, (_, i) => ({
      anchorId: "a".repeat(64),
      slideIndex: Math.floor(i / 3),
      fieldId: `field-${i % 3}`,
      itemIndex: null,
      start: 0,
      end: 25,
      quote: `Exemplo de texto literal para âncora de evidência ${i}`,
      textHash: "b".repeat(64),
    }));

    const v5Serialized = JSON.stringify(realisticAnchors);
    const { promptInventory } = buildReviewEvidenceAliases(realisticAnchors);
    const v6Serialized = JSON.stringify(promptInventory);

    const reduction = 1 - v6Serialized.length / v5Serialized.length;
    expect(reduction).toBeGreaterThan(0.4);
  });
});
