/** Offline source proof. Never publishes or mutates existing catalogue artifacts. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { arsenalHash } from "../../../shared/arsenalContent";
import { componentDefinitionV1Schema } from "../../../shared/componentAssembly";
import { isStandaloneDirectionalGlyph } from "../../../shared/nativeGlyphProjection";
const args = process.argv.slice(2), build = args[args.indexOf("--build") + 1], output = args[args.indexOf("--output") + 1];
assert(args.includes("--build") && args.includes("--output"), "explicit --build and --output required");
const entries = [];
for (const file of (await fs.readdir(path.join(build, "packages"))).filter(file => file.endsWith(".json")).sort()) {
  const pkg = JSON.parse(await fs.readFile(path.join(build, "packages", file), "utf8"));
  const recipe = JSON.parse(await fs.readFile(path.join(build, "recipes", file), "utf8"));
  const recipeHash = arsenalHash(recipe);
  for (const input of pkg.components) {
    const definition = componentDefinitionV1Schema.parse(input);
    if (definition.completeDesign?.designGuidance?.carouselVariant) continue;
    assert.equal(definition.source.kind, "recipe");
    assert.equal((definition.source as { recipeHash: string }).recipeHash, recipeHash);
    const bindings = definition.fragment.bindings.flatMap(binding => {
      if (binding.kind !== "text" || binding.required) return [];
      const targets = binding.targetIds.map(id => {
        const instance = definition.fragment.instances.find(instance => instance.id === id);
        const original = recipe.scene.layers.find((layer: { id: string }) => layer.id === id);
        return instance && original?.kind === "text" && isStandaloneDirectionalGlyph(original.text)
          ? { id, pieceHash: instance.pieceHash, instanceHash: arsenalHash(instance), text: original.text } : undefined;
      });
      return targets.length && targets.every(target => target) ? [{ id: binding.id, source: binding.source, targets }] : [];
    });
    if (bindings.length) entries.push({ definitionId: definition.id, definitionHash: definition.hash, recipeHash, bindings });
  }
}
const document = { version: 1, entries: entries.sort((a,b) => a.definitionHash.localeCompare(b.definitionHash)) };
await fs.writeFile(output, JSON.stringify(document, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ entries: entries.length, manifestHash: arsenalHash(document), output }));
