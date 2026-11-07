import manifest from "./nativeGlyphManifest.json";
import { arsenalHash } from "./arsenalContent";
import type { ComponentDefinitionV1 } from "./componentAssembly";

/** Directional marks alone are ornaments; words, numbers and mixed CTAs remain copy. */
export function isStandaloneDirectionalGlyph(text: string) {
  return Boolean(text.trim()) && /^[←↑→↓↔↕↖↗↘↙↚↛↠↞↟↡↢↣↤↥↦↧↩↪↫↬↭↮↰↱↲↳↴↵↶↷↺↻⇄⇆⇐⇑⇒⇓⇔⇕➔➜➝➞➟➠➡➢➣➤⟵⟶⟷⟸⟹⟺\s\uFE0F]+$/.test(text);
}
export const NATIVE_GLYPH_MANIFEST_HASH = arsenalHash(manifest);

/** Immutable source correction, opt-in for new admissions. Unknown revisions stay untouched. */
export function nativeGlyphProjection(definition: ComponentDefinitionV1, version?: 1) {
  if (version !== 1) return;
  const entry = manifest.entries.find(entry => entry.definitionHash === definition.hash);
  if (!entry) return;
  const { hash, ...body } = definition;
  if (entry.definitionId !== definition.id || definition.source.kind !== "recipe" ||
      definition.source.recipeHash !== entry.recipeHash || arsenalHash(body) !== hash) return;
  const targets = new Set(entry.bindings.flatMap(binding => binding.targets.map(target => target.id)));
  for (const expected of entry.bindings) {
    const binding = definition.fragment.bindings.find(binding => binding.id === expected.id);
    if (!binding || binding.kind !== "text" || binding.required || binding.source !== expected.source ||
        arsenalHash(binding.targetIds) !== arsenalHash(expected.targets.map(target => target.id))) return;
    for (const target of expected.targets) {
      const instance = definition.fragment.instances.find(instance => instance.id === target.id);
      const piece = instance && definition.pieces[instance.pieceHash];
      if (!instance || instance.pieceHash !== target.pieceHash || arsenalHash(instance) !== target.instanceHash ||
          !piece || piece.kind !== "text" || piece.fixedText !== null || arsenalHash(piece) !== target.pieceHash ||
          !isStandaloneDirectionalGlyph(target.text)) return;
    }
  }
  if (definition.fragment.relations.some(relation =>
    relation.inputs.some(id => targets.has(id)) ||
    relation.outputs.some(output => targets.has(output.targetId)) &&
      (relation.kind !== "textFit" || relation.outputs.some(output => !targets.has(output.targetId))))) return;
  return { version: 1 as const, manifestHash: NATIVE_GLYPH_MANIFEST_HASH, bindings: entry.bindings };
}
