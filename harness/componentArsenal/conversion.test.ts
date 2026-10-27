import { describe, expect, it } from "vitest";
import { conversionFixture } from "./conversion.fixture";
import { authorRecipe } from "./authoring";
import { extractRecipeComponents, nativeAspectRatio } from "./extract";
import { buildDraftPreview } from "./preview";
import { authoredCapabilities, deriveDesignGuidance } from "./designGuidance";
import { createComponentTextMeasurer } from "../../server/ai/componentTextMeasurer";
import { arsenalBindingSchema, readArsenalComposition } from "../../shared/designArsenal";
import { resolveArsenalGeometry } from "../../shared/arsenalGeometry";
import { arsenalHash } from "../../shared/arsenalContent";

async function prepared() {
  const { recipe, record } = conversionFixture();
  const result = await extractRecipeComponents(record, recipe, true);
  const measure = await createComponentTextMeasurer(result.package.components[0].assets, async asset => result.assetFiles.find(f => f.manifest.id === asset.id)!.bytes);
  return { ...result, recipe, record, measure };
}
describe("authored whole-design conversion", () => {
  it("preserves Why's semantic benefits and native geometry while keeping multiline bodies textual", async () => {
    const { package: pkg, recipe, measure } = await prepared();
    const unit = pkg.authorship.units.find(u => u.fields.includes("beneficios"))!;
    expect(unit).toMatchObject({ kind: "list", source: "block:list:0:items", cardinality: { min: 1, max: 3 }, prefix: "- ", sampleItems: ["Primeiro benefício", "Segundo benefício", "Terceiro benefício"] });
    expect(pkg.authorship.units.find(u => u.fields.includes("corpo-1"))?.kind).toBe("text");
    const definition = pkg.components[0], binding = definition.fragment.bindings.find(b => b.kind === "list")!;
    expect(pkg.components.every(c => c.completeDesign?.authorshipRevision === 1)).toBe(true);
    expect(binding).toMatchObject({ listMode: "native-slots", targetIds: ["lista-1", "lista-2", "lista-3"], prefix: "- " });
    expect(definition.fragment.instances.map(i => i.id)).toEqual(recipe.scene.layers.map(l => l.id));
    for (const id of binding.targetIds) {
      const instance = definition.fragment.instances.find(i => i.id === id)!;
      expect(definition.pieces[instance.pieceHash].contentFragment).toBeUndefined();
      const source = recipe.scene.layers.find(l => l.id === id)!;
      expect(instance).toMatchObject({ x: source.x, y: source.y, width: source.width, height: source.height, rotation: source.rotationDeg });
    }
    const { composition } = buildDraftPreview(pkg, "original", measure);
    const native = composition.base.bindings.find(b => b.listMode === "native-slots")!;
    expect(native.targetIds.map(id => composition.elements.find(e => e.id === id)?.text)).toEqual(["- Primeiro benefício", "- Segundo benefício", "- Terceiro benefício"]);
    expect(composition.issues).toEqual([]);
    expect(readArsenalComposition(JSON.parse(JSON.stringify(composition)))).toEqual(composition);
    const tampered = structuredClone(composition);
    tampered.elements.find(e => e.id === native.targetIds[0])!.text = "Texto adulterado";
    expect(() => readArsenalComposition(tampered)).toThrow("Snapshot resolvido diverge");
  });
  it("hides unused native list slots without moving remaining items, and blocks excess items without changing canonical content", async () => {
    const { package: pkg, measure } = await prepared(), source = "block:list:0:items";
    const one = buildDraftPreview(pkg, "original", measure, { [source]: ["Um item completo"] }).composition;
    const binding = one.base.bindings.find(b => b.listMode === "native-slots")!;
    const elements = binding.targetIds.map(id => one.elements.find(e => e.id === id)!);
    expect(elements.map(e => [e.text, e.opacity])).toEqual([["- Um item completo", 1], ["", 0], ["", 0]]);
    const contentHash = arsenalHash(one.content), baseHash = arsenalHash(one.base);
    const replay = resolveArsenalGeometry(one, { measureText: measure, allowReduction: false });
    expect(replay.elements.filter(e => e.bindingId === binding.id).map(e => [e.id, e.x, e.y, e.width, e.height])).toEqual(elements.map(e => [e.id, e.x, e.y, e.width, e.height]));
    expect(arsenalHash(replay.content)).toBe(contentHash);
    expect(arsenalHash(replay.base)).toBe(baseHash);
    const four = buildDraftPreview(pkg, "original", measure, { [source]: ["Um", "Dois", "Três", "Quatro"] }).composition;
    expect(four.issues.some(issue => issue.startsWith("cardinality:"))).toBe(true);
    expect(four.content.schemaVersion === 3 && four.content.blocks.find(b => b.type === "list")).toMatchObject({ items: [{ text: "Um" }, { text: "Dois" }, { text: "Três" }, { text: "Quatro" }] });
    expect(() => buildDraftPreview(pkg, "original", measure, { [source]: [""] })).toThrow();
  });
  it("keeps old repeating lists as the default and rejects malformed native slot declarations", async () => {
    const { package: pkg, measure } = await prepared();
    const c = buildDraftPreview(pkg, "original", measure).composition;
    const binding = c.base.bindings.find(b => b.listMode === "native-slots")!;
    expect(arsenalBindingSchema.safeParse({ ...binding, cardinality: { min: 1, max: 4 } }).success).toBe(false);
    expect(arsenalBindingSchema.safeParse({ ...binding, targetIds: [binding.targetIds[0], binding.targetIds[0], binding.targetIds[0]] }).success).toBe(false);
    expect(arsenalBindingSchema.safeParse({ ...binding, kind: "text", source: "headline", cardinality: null }).success).toBe(false);
    delete binding.listMode;
    binding.targetIds = binding.targetIds.slice(0, 1);
    const originalId = binding.targetIds[0];
    const repeat = resolveArsenalGeometry(c, { measureText: measure });
    expect(repeat.elements.filter(e => e.bindingId === binding.id).map(e => e.id)).toEqual(expect.arrayContaining([expect.stringMatching(new RegExp(`^${originalId}~`))]));
    expect(repeat.elements.find(e => e.id === originalId)).toBeUndefined();
  });
  it("uses authored capabilities rather than the subject or length of demo prose", () => {
    const { recipe, record } = conversionFixture(), units = authorRecipe(record, recipe);
    const profile = authoredCapabilities(recipe, units);
    expect(profile.roles).toEqual(expect.arrayContaining(["static", "cover", "development", "list", "closing", "example"]));
    const changed = units.map(u => ({ ...u, sampleText: "X" }));
    expect(authoredCapabilities(recipe, changed)).toEqual(profile);
    const headline = units.filter(u => u.role === "headline");
    expect(authoredCapabilities(recipe, headline).roles).toEqual(["static", "cover", "closing"]);
    const guidance = deriveDesignGuidance(recipe, units, { sha256: "a".repeat(64), width: 736, height: 920, fileName: "original.jpg", mimeType: "image/jpeg" });
    expect(guidance.knownLimitations).toEqual(expect.arrayContaining(recipe.notes));
    expect(guidance.knownLimitations.some(note => note.includes("Grade pontilhada") && note.includes("Textura não reconstruída"))).toBe(true);
    expect(guidance.contentRules.some(rule => rule.includes("1–3 itens independentes"))).toBe(true);
    expect(guidance.original).toEqual({ sha256: "a".repeat(64), width: 736, height: 920, fileName: "original.jpg" });
    expect(JSON.stringify(guidance)).not.toContain("data:");
  });
  it("rejects unsupported native proportions instead of assigning 5:6 or silently adapting", async () => {
    for (const [width, height] of [[640, 853], [736, 1104], [736, 970], [1200, 1600]])
      expect(() => nativeAspectRatio(width, height)).toThrow("Proporção nativa não suportada");
    expect(nativeAspectRatio(736, 920)).toBe("4:5");
    expect(nativeAspectRatio(736, 883)).toBe("5:6");
    expect(nativeAspectRatio(1080, 1920)).toBe("9:16");
    const { recipe, record } = conversionFixture();
    recipe.scene.source.heightPx = 1104;
    await expect(extractRecipeComponents(record, recipe, true)).rejects.toThrow("adaptação autorada explícita");
  });
});
