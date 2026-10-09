import type { RecreationRecipe } from '../../shared/designRecreation';
import { sha256 } from '../designBatch/builder';
import { layerBounds } from './quality';

/** Optional two-zone composition. Preserves source aspect, avoiding cutout/inpainting. */
export function featureMedia(source: RecreationRecipe, mediaHeightFraction = .48) {
  if (mediaHeightFraction < .4 || mediaHeightFraction > .5) throw new Error('Featured media fraction outside this pilot range');
  const recipe = structuredClone(source), W = recipe.scene.source.widthPx, H = recipe.scene.source.heightPx;
  const slot = recipe.matrix?.media.find(m => m.asset), media = recipe.scene.layers.find(l => l.id === slot?.layerId);
  if (!slot?.asset || !media) throw new Error('Featured media needs an embedded asset');
  const group = recipe.matrix!.groups.find(g => g.id === 'composition');
  if (!group) throw new Error('Featured media requires the declared content component');
  const members = new Set(group.members.map(m => m.layerId));
  const content = recipe.scene.layers.filter(l => members.has(l.id));
  const contentStart = mediaHeightFraction + .04;
  const original = layerBounds(content), lower = { x: 24, y: H * contentStart, width: W - 48, height: H * (1 - contentStart) - 24 };
  const scale = Math.min(1, lower.width / original.width, lower.height / original.height);
  const x = lower.x + (lower.width - original.width * scale) / 2, y = lower.y;
  for (const l of content) {
    l.x = x + (l.x - original.x) * scale; l.y = y + (l.y - original.y) * scale;
    for (const key of ['width', 'height', 'fontSize', 'strokeWidth', 'letterSpacing'] as const) l[key] *= scale;
    l.points = l.points.map(p => p * scale);
    if (l.extrusion) { l.extrusion.offsetX *= scale; l.extrusion.offsetY *= scale; }
    const style = recipe.adaptation?.layerStyles.find(s => s.layerId === l.id);
    if (style) style.cornerRadiusPx *= scale;
  }
  const mediaScale = Math.min((W - 48) / slot.asset.width, (H * mediaHeightFraction - 24) / slot.asset.height);
  media.width = slot.asset.width * mediaScale; media.height = slot.asset.height * mediaScale;
  media.x = (W - media.width) / 2; media.y = 16; media.rotationDeg = 0;
  // The previous scrim was only needed for text over photography.
  recipe.scene.layers = recipe.scene.layers.filter(l => l.id !== 'scrim');
  recipe.adaptation!.layerStyles = recipe.adaptation!.layerStyles.filter(l => l.layerId !== 'scrim');
  for (const g of recipe.matrix!.groups) {
    g.transform = { x: 0, y: 0, rotationDeg: 0 };
    for (const m of g.members) {
      const layer = recipe.scene.layers.find(l => l.id === m.layerId)!;
      m.x = layer.x; m.y = layer.y; m.rotationDeg = layer.rotationDeg;
    }
  }
  for (const field of recipe.matrix!.fields) field.baseFontSizes = field.layerIds.map(id => recipe.scene.layers.find(l => l.id === id)!.fontSize);
  recipe.id = sha256(`${source.id}:featured-media-v1:${mediaHeightFraction}`).slice(0, 32);
  recipe.adaptation!.parentRecipeId = source.id;
  recipe.title += ' · mídia em destaque';
  recipe.notes.push('Adaptação de duas áreas: mídia preserva proporção; componente de conteúdo é escalado uniformemente na área inferior. Snapshot V3, sem edição flexível no Admin2.');
  return { recipe, relation: { type: 'separate-media-and-content', mediaHeightFraction, sourceAspectPreserved: true, contentScale: scale, mediaBox: { x: media.x, y: media.y, width: media.width, height: media.height }, contentBox: lower } };
}
