/** Frozen structural-v1 descriptor. Keep axes, weights and extraction semantics versioned. */
import type { RecreationRecipe } from './designRecreation';
import type { ReferenceSceneLayer as Layer } from './referenceReconstruction';

export const DESCRIPTOR_VERSION = 'structural-v1';
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const round = (n: number) => Number(n.toFixed(6));
const mean = (xs: number[]) => xs.reduce((s, n) => s + n, 0) / Math.max(1, xs.length);
const rgb = (hex: string) => (hex.match(/[0-9a-f]{2}/gi) ?? []).map(n => parseInt(n, 16) / 255);
const angle = (l: Layer) => l.rotationDeg * Math.PI / 180;
export const STRUCTURE_AXES = [
  'aspect/2', 'title.centerX', 'title.centerY', 'title.width', 'title.height',
  'title.fontSize/width*5', 'title.layerCount/8', 'text.layerCount/20',
  'group.count/10', 'media.slotCount/4', 'text.centerAlignedFraction',
  'text.meanAbsSinRotation', 'decoration.coverage', 'text.smallFraction',
  'line.layerFraction', 'text.outlinedFraction',
  ...Array.from({ length: 16 }, (_, i) => `text.grid4x4.${i}`),
  ...Array.from({ length: 16 }, (_, i) => `media.grid4x4.${i}`),
];
// Grid blocks have a fixed total weight so adding grid cells cannot silently dominate.
export const STRUCTURE_WEIGHTS = [
  1, 3, 3, 3, 3, 2, 1, 1, .5, 2, 2, 1, .5, .5, .5, .5,
  ...Array(16).fill(8 / 16), ...Array(16).fill(10 / 16),
];
export const STYLE_AXES = ['background.r', 'background.g', 'background.b', 'title.r', 'title.g', 'title.b', 'title.weight/1000'];
export const ROW_AXES = [
  'text', 'rect', 'line', 'polygon', 'arcText', 'media',
  'local.x/width', 'local.y/height', 'width/artboardWidth', 'height/artboardHeight',
  'sinRotation', 'cosRotation', 'fontSize/artboardWidth', 'opacity',
];

function bounds(l: Layer) {
  const a = angle(l), c = Math.cos(a), s = Math.sin(a);
  const ps = [[0, 0], [l.width, 0], [0, l.height], [l.width, l.height]]
    .map(([x, y]) => [l.x + x * c - y * s, l.y + x * s + y * c]);
  return { x: Math.min(...ps.map(p => p[0])), y: Math.min(...ps.map(p => p[1])),
    right: Math.max(...ps.map(p => p[0])), bottom: Math.max(...ps.map(p => p[1])) };
}

/** Samples rotated boxes, not actual glyph/polygon pixels or occlusion. */
function coverage(layers: Layer[], width: number, height: number) {
  return Array.from({ length: 16 }, (_, cell) => {
    let hits = 0;
    for (let row = 0; row < 5; row++) for (let col = 0; col < 5; col++) {
      const x = ((cell % 4) + (col + .5) / 5) / 4 * width;
      const y = (Math.floor(cell / 4) + (row + .5) / 5) / 4 * height;
      if (layers.some(l => {
        const a = angle(l), dx = x - l.x, dy = y - l.y;
        const localX = dx * Math.cos(a) + dy * Math.sin(a);
        const localY = -dx * Math.sin(a) + dy * Math.cos(a);
        return localX >= 0 && localY >= 0 && localX <= l.width && localY <= l.height;
      })) hits++;
    }
    return hits / 25;
  });
}

/** Largest type is a documented heuristic, never a semantic role inferred with certainty. */
export function titleLayers(recipe: RecreationRecipe) {
  const texts = recipe.scene.layers.filter(l => (l.kind === 'text' || l.kind === 'arcText') && l.opacity > 0);
  const size = Math.max(0, ...texts.map(l => l.fontSize));
  return texts.filter(l => l.fontSize >= size * .72).sort((a, b) => a.id.localeCompare(b.id));
}

export function describe(recipe: RecreationRecipe) {
  const { widthPx: width, heightPx: height } = recipe.scene.source;
  const layers = recipe.scene.layers.filter(l => l.opacity > 0).sort((a, b) => a.id.localeCompare(b.id));
  const texts = layers.filter(l => l.kind === 'text' || l.kind === 'arcText');
  const titles = titleLayers(recipe), title = [...titles].sort((a, b) => b.fontSize - a.fontSize || a.id.localeCompare(b.id))[0];
  const boxes = titles.map(bounds);
  const x = boxes.length ? Math.min(...boxes.map(b => b.x)) : 0;
  const y = boxes.length ? Math.min(...boxes.map(b => b.y)) : 0;
  const right = boxes.length ? Math.max(...boxes.map(b => b.right)) : 0;
  const bottom = boxes.length ? Math.max(...boxes.map(b => b.bottom)) : 0;
  const mediaIds = new Set(recipe.matrix?.media.map(m => m.layerId));
  const media = layers.filter(l => mediaIds.has(l.id));
  const shapeLayers = layers.filter(l => !mediaIds.has(l.id) && ['rect', 'polygon'].includes(l.kind) && l.width * l.height < width * height * .8);
  const small = texts.filter(l => l.fontSize < (title?.fontSize ?? 0) * .35);
  const structure = [
    width / height / 2, (x + right) / 2 / width, (y + bottom) / 2 / height,
    (right - x) / width, (bottom - y) / height, (title?.fontSize ?? 0) / width * 5,
    titles.length / 8, texts.length / 20, (recipe.matrix?.groups.length ?? 0) / 10,
    media.length / 4, mean(texts.map(l => Number(l.align === 'center'))),
    mean(texts.map(l => Math.abs(Math.sin(angle(l))))), mean(coverage(shapeLayers, width, height)),
    small.length / Math.max(1, texts.length), layers.filter(l => l.kind === 'line').length / Math.max(1, layers.length),
    mean(texts.map(l => Number(l.strokeWidth > 0))),
    ...coverage(texts.filter(l => !small.includes(l)), width, height), ...coverage(media, width, height),
  ].map(n => round(clamp(n)));
  const style = [...rgb(recipe.scene.artboard.background), ...rgb(title?.fill ?? '#000000'), (title?.fontWeight ?? 0) / 1000].map(round);
  const fonts = Array.from(new Set(titles.map(l => l.fontFamily).filter((f): f is string => Boolean(f)))).sort();
  // Ragged rank-2 matrices: row IDs, axes and edges stay explicit. No learned latent space.
  const components = (recipe.matrix?.groups ?? []).map(group => ({
    id: group.id, label: group.label, transform: group.transform,
    rowIds: group.members.map(m => m.layerId),
    rows: group.members.map(member => {
      const l = recipe.scene.layers.find(l => l.id === member.layerId);
      if (!l) throw new Error(`Unknown member ${group.id}/${member.layerId}`);
      const a = member.rotationDeg * Math.PI / 180;
      return [...['text', 'rect', 'line', 'polygon', 'arcText'].map(k => Number(l.kind === k)),
        Number(mediaIds.has(l.id)), member.x / width, member.y / height, l.width / width,
        l.height / height, Math.sin(a), Math.cos(a), (l.kind === 'text' || l.kind === 'arcText') ? l.fontSize / width : 0, l.opacity].map(round);
    }),
    edges: [
      ...group.members.map(m => ({ from: group.id, to: m.layerId, relation: 'contains' })),
      ...(recipe.matrix?.fields.filter(f => f.groupId === group.id) ?? []).flatMap(f => f.layerIds.map(id => ({ from: `field:${f.id}`, to: id, relation: 'binds-text' }))),
      ...(recipe.matrix?.media.filter(m => m.groupId === group.id) ?? []).map(m => ({ from: `media:${m.id}`, to: m.layerId, relation: 'binds-media' })),
    ],
  }));
  return { version: DESCRIPTOR_VERSION, structure, style, fonts, components,
    summary: { aspect: round(width / height), titlePosition: round((y + bottom) / 2 / height),
      titleWidth: round((right - x) / width), titleLines: titles.length,
      centered: structure[10] >= .5, rotatedText: structure[11] > .01,
      mediaSlots: media.length, textFields: recipe.matrix?.fields.length ?? 0,
      groups: components.length, colors: [recipe.scene.artboard.background, title?.fill ?? '#000000'] } };
}
export type Descriptor = ReturnType<typeof describe>;

export type Component = Descriptor['components'][number];
/** Local row comparison, independent of the component's placement and size on the page.
 * Symmetric nearest-row distance (Chamfer), not an optimal one-to-one assignment.
 * Counts penalize repetition, but matching rows alone does not prove composability.
 */
export function componentDistance(a: Component, b: Component) {
  const normalize = (component: Component) => {
    const xs = component.rows.map(r => r[6]), ys = component.rows.map(r => r[7]);
    const left = Math.min(...xs), top = Math.min(...ys);
    const width = Math.max(1e-8, ...component.rows.map(r => r[6] + r[8] - left));
    const height = Math.max(1e-8, ...component.rows.map(r => r[7] + r[9] - top));
    return component.rows.map(r => [...r.slice(0, 6), (r[6] - left) / width, (r[7] - top) / height,
      r[8] / width, r[9] / height, r[10], r[11], r[12] / width, r[13]]);
  };
  const x = normalize(a), y = normalize(b);
  if (!x.length || !y.length) throw new Error('Empty component');
  const rowDistance = (x: number[], y: number[]) =>
    .45 * Math.min(1, x.slice(0, 6).reduce((s, n, i) => s + Math.abs(n - y[i]), 0) / 2)
    + .4 * mean(x.slice(6, 10).map((n, i) => clamp(Math.abs(n - y[i + 6]))))
    + .05 * mean(x.slice(10, 12).map((n, i) => Math.abs(n - y[i + 10]) / 2))
    + .05 * clamp(Math.abs(x[12] - y[12])) + .05 * Math.abs(x[13] - y[13]);
  const forward = mean(x.map(row => Math.min(...y.map(other => rowDistance(row, other)))));
  const backward = mean(y.map(row => Math.min(...x.map(other => rowDistance(row, other)))));
  const countPenalty = Math.abs(x.length - y.length) / Math.max(x.length, y.length);
  return round(.9 * (forward + backward) / 2 + .1 * countPenalty);
}

export function distance(a: Descriptor, b: Descriptor, styleShare = 0) {
  if (a.version !== b.version || a.structure.length !== STRUCTURE_AXES.length || b.structure.length !== STRUCTURE_AXES.length) throw new Error('Incompatible descriptor versions/dimensions');
  if (!Number.isFinite(styleShare) || styleShare < 0 || styleShare > 1) throw new Error('Invalid style share');
  const totalWeight = STRUCTURE_WEIGHTS.reduce((n, w) => n + w, 0);
  const differences = a.structure.map((n, i) => ({ axis: STRUCTURE_AXES[i], contribution: Math.abs(n - b.structure[i]) * STRUCTURE_WEIGHTS[i] / totalWeight }));
  const structural = differences.reduce((n, d) => n + d.contribution, 0);
  const union = new Set([...a.fonts, ...b.fonts]);
  const fontDistance = union.size ? 1 - a.fonts.filter(f => b.fonts.includes(f)).length / union.size : 0;
  const style = .75 * mean(a.style.map((v, i) => Math.abs(v - b.style[i]))) + .25 * fontDistance;
  return { value: round(structural * (1 - styleShare) + style * styleShare), structural: round(structural), style: round(style),
    differences: differences.sort((a, b) => b.contribution - a.contribution).slice(0, 5) };
}

export function compactCard(id: string, title: string, status: string, descriptor: Descriptor, requirements: string[]) {
  const s = descriptor.summary;
  return { id, name: title, status, requirements, aspect: s.aspect,
    title: { widthFraction: Number(s.titleWidth.toFixed(2)), positionY: Number(s.titlePosition.toFixed(2)), lines: s.titleLines,
      alignment: s.centered ? 'predominantly-centered' : 'mixed-or-left-right', rotated: s.rotatedText },
    fonts: descriptor.fonts, colors: s.colors, mediaSlots: s.mediaSlots, textFields: s.textFields };
}
