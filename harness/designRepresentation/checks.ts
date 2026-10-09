import assert from 'node:assert/strict';
import type { RecreationRecipe } from '../../shared/designRecreation';
import { describe, distance, componentDistance, STRUCTURE_AXES, ROW_AXES } from './descriptors';

/** Independent of the renderer: checks the declared semantics of the index. */
export function checkDescriptors(recipes: RecreationRecipe[]) {
  const results: { check: string; cases: number; status: 'passed' }[] = [];
  for (const recipe of recipes) {
    const original = describe(recipe);
    assert.equal(original.structure.length, STRUCTURE_AXES.length);
    assert.ok(original.structure.every(n => Number.isFinite(n) && n >= 0 && n <= 1));
    assert.equal(distance(original, original).value, 0);
    for (const group of original.components) {
      assert.equal(group.rows.length, group.rowIds.length);
      assert.ok(group.rows.every(row => row.length === ROW_AXES.length && row.every(Number.isFinite)));
      assert.equal(group.edges.filter(e => e.relation === 'contains').length, group.rowIds.length);
      assert.equal(componentDistance(group, group), 0);
      const transformed = structuredClone(group);
      for (const row of transformed.rows) {
        row[6] = row[6] * 2 + .3; row[7] = row[7] * 2 - .2;
        row[8] *= 2; row[9] *= 2; row[12] *= 2;
      }
      assert.equal(componentDistance(group, transformed), 0);
    }
    const changedCopy = structuredClone(recipe);
    for (const l of changedCopy.scene.layers) if (l.text !== null) l.text = 'Conteúdo completamente diferente';
    assert.deepEqual(describe(changedCopy), original);
    const changedAssets = structuredClone(recipe);
    // Descriptor extraction must not inspect photograph pixels, font payloads or hashes.
    for (const f of changedAssets.scene.fonts) f.dataUrl = null;
    for (const m of changedAssets.matrix?.media ?? []) m.asset = null;
    assert.deepEqual(describe(changedAssets), original);
    const reordered = structuredClone(recipe);
    reordered.scene.layers.reverse();
    assert.deepEqual(describe(reordered), original);
    const scaled = structuredClone(recipe);
    scaled.scene.source.widthPx *= 2; scaled.scene.source.heightPx *= 2;
    for (const l of scaled.scene.layers) for (const key of ['x', 'y', 'width', 'height', 'fontSize', 'strokeWidth', 'letterSpacing'] as const) l[key] *= 2;
    for (const g of scaled.matrix?.groups ?? []) {
      g.transform.x *= 2; g.transform.y *= 2;
      for (const m of g.members) { m.x *= 2; m.y *= 2; }
    }
    const larger = describe(scaled);
    assert.deepEqual(larger.structure, original.structure);
    assert.deepEqual(larger.style, original.style);
    for (let i = 0; i < original.components.length; i++) assert.deepEqual(larger.components[i].rows, original.components[i].rows);
  }
  for (const check of ['finite dimensions and ranges', 'identity distance', 'declared membership edges', 'literal copy independence', 'embedded asset independence', 'layer array order independence', 'uniform scale invariance', 'component matrices: identity, translation and local scale invariance']) results.push({ check, cases: recipes.length, status: 'passed' });
  const sample = recipes.find(r => r.scene.layers.some(l => l.kind === 'text'))!;
  const moved = structuredClone(sample);
  for (const l of moved.scene.layers) if (l.kind === 'text') l.y += sample.scene.source.heightPx * .1;
  assert.ok(distance(describe(sample), describe(moved)).value > .001);
  const rotated = structuredClone(sample);
  for (const l of rotated.scene.layers) if (l.kind === 'text') l.rotationDeg += 12;
  assert.ok(distance(describe(sample), describe(rotated)).value > .001);
  const recolored = structuredClone(sample); recolored.scene.artboard.background = '#00FF00';
  assert.equal(distance(describe(sample), describe(recolored)).value, 0);
  assert.ok(distance(describe(sample), describe(recolored), .2).value > 0);
  assert.throws(() => distance(describe(sample), describe(sample), 2));
  results.push({ check: 'position/rotation sensitivity, color separation, invalid weight rejection', cases: 5, status: 'passed' });
  return results;
}
