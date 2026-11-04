import { describe, it, expect } from "vitest";
import { conversionFixture } from "./conversion.fixture";
import { extractRecipeComponents } from "./extract";
import { rebuildCatalogRepresentation } from "./catalogRepresentation";
import {
  createComponentDefinition,
  compactComponentCard,
} from "../../shared/componentAssembly";
import { arsenalHash } from "../../shared/arsenalContent";
import { designTextBudgetsV3 } from "../../shared/designSelection";
import {
  completeDesignFields,
  instantiateCompleteDesign,
} from "../../shared/completeDesignGeneration";
import { assemblyIdentity } from "../../shared/componentAssembly";
import { resolveArsenalGeometry } from "../../shared/arsenalGeometry";
import { createComponentTextMeasurer } from "../../server/ai/componentTextMeasurer";

describe("current catalog semantic rebuild", () => {
  it("keeps the frozen title partition instead of replaying stale recipe weights, and binds complete list items", async () => {
    const fixture = conversionFixture(),
      { package: pkg, assetFiles } = await extractRecipeComponents(
        fixture.record,
        fixture.recipe,
        true
      );
    const source = structuredClone(pkg.components[0]);
    const title = source.fragment.bindings.find(b =>
      b.source.startsWith("block:headline:")
    )!;
    for (const id of title.targetIds) {
      const i = source.fragment.instances.find(i => i.id === id)!;
      const piece = {
        ...source.pieces[i.pieceHash],
        contentFragment: {
          ...source.pieces[i.pieceHash].contentFragment!,
          weights: [1, 1, 4],
        },
      };
      const hash = arsenalHash(piece);
      source.pieces[hash] = piece;
      i.pieceHash = hash;
    }
    const frozen = createComponentDefinition({
      ...source,
      completeDesign: { ...source.completeDesign!, baselineVerified: true },
    });
    const before = arsenalHash(frozen),
      rebuilt = rebuildCatalogRepresentation(frozen, pkg).definition;
    expect(rebuilt.id).not.toBe(frozen.id);
    expect(arsenalHash(frozen)).toBe(before);
    for (const id of title.targetIds) {
      const i = rebuilt.fragment.instances.find(i => i.id === id)!;
      expect(rebuilt.pieces[i.pieceHash].contentFragment?.weights).toEqual([
        1, 1, 4,
      ]);
    }
    const items = [
      "Evite perdas de produtos essenciais.",
      "Compre melhor.",
      "Controle o consumo.",
    ];
    const values = completeDesignFields(rebuilt).map(f => ({
      fieldId: f.id,
      value: f.kind === "list" ? items : "Uma ideia clara ajuda a decidir.",
    }));
    const measureText = await createComponentTextMeasurer(
      rebuilt.assets,
      async asset => assetFiles.find(f => f.manifest.id === asset.id)!.bytes
    );
    const composition = resolveArsenalGeometry(
      instantiateCompleteDesign({
        definition: rebuilt,
        values,
        mediaPrompts: [],
        runId: assemblyIdentity("semantic-rebuild"),
        slot: 0,
        slide: 0,
        planHash: arsenalHash(values),
        experimental: true,
      }),
      { measureText, allowReduction: true }
    );
    const list = rebuilt.fragment.bindings.find(b => b.kind === "list")!;
    expect(
      list.targetIds.map(
        id => composition.elements.find(e => e.id === id)?.text
      )
    ).toEqual(items.map(x => `- ${x}`));
    const mechanics = compactComponentCard(rebuilt).mechanics!;
    expect(
      mechanics.fields.find(f => f.source === list.source)?.distribution
    ).toBe("independent_items");
  });
  it("estimates unequal fragments from their bottleneck and leaves item capacity per slot", async () => {
    const fixture = conversionFixture(),
      { package: pkg } = await extractRecipeComponents(
        fixture.record,
        fixture.recipe,
        true
      );
    const card = compactComponentCard(pkg.components[0]);
    const head = card.mechanics!.fields.find(f =>
      f.source.startsWith("block:headline:")
    )!;
    head.targets.forEach((t, i) => {
      t.charsEstimate = i === 2 ? 4 : 30;
      t.fragmentWeight = 1;
    });
    expect(
      designTextBudgetsV3(card).find(b => b.source === head.source)
        ?.estimatedCharacters
    ).toBe(12);
    const list = card.mechanics!.fields.find(
      f => f.distribution === "independent_items"
    )!;
    const budget = designTextBudgetsV3(card).find(
      b => b.source === list.source
    )!;
    expect(budget.distribution).toBe("independent_items");
    expect(
      "perItemCharacters" in budget && budget.perItemCharacters
    ).toHaveLength(3);
  });
});
