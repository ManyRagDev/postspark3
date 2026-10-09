import type { RecreationRecipe } from '../../shared/designRecreation';
import type { ReferenceSceneLayer as Layer } from '../../shared/referenceReconstruction';
import { layerMeasurements } from '../designBatch/native';
import { lineBreakWarnings } from '../designCombinations/textFlow';

export const QUALITY_VERSION = 'context-quality-v1';
export type SubjectRegion = { assetSha256: string; x: number; y: number; width: number; height: number; provenance: 'manual-image-review'; label: string };
export type QualityBrief = { id: string; title: string; support: string; cta: string; intent: 'ideas' | 'product' | 'action'; subject?: SubjectRegion };
type Point = { x: number; y: number };
const round = (n: number) => Number(n.toFixed(4));

export function layerCorners(l: Layer): Point[] {
  const a = l.rotationDeg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return [[0, 0], [l.width, 0], [l.width, l.height], [0, l.height]].map(([x, y]) => ({ x: l.x + x * c - y * s, y: l.y + x * s + y * c }));
}
export function layerBounds(layers: Layer[]) {
  const points = layers.flatMap(layerCorners);
  const x = Math.min(...points.map(p => p.x)), y = Math.min(...points.map(p => p.y));
  return { x, y, width: Math.max(...points.map(p => p.x)) - x, height: Math.max(...points.map(p => p.y)) - y };
}
function intersects(a: Layer, b: Layer) {
  const pa = layerCorners(a), pb = layerCorners(b);
  for (const points of [pa, pb]) for (let i = 0; i < points.length; i++) {
    const next = points[(i + 1) % points.length], p = points[i], nx = -(next.y - p.y), ny = next.x - p.x;
    const project = (ps: Point[]) => ps.map(p => p.x * nx + p.y * ny);
    const xa = project(pa), xb = project(pb);
    if (Math.max(...xa) <= Math.min(...xb) + .01 || Math.max(...xb) <= Math.min(...xa) + .01) return false;
  }
  return true;
}
function contains(l: Layer, p: Point) {
  const a = l.rotationDeg * Math.PI / 180, dx = p.x - l.x, dy = p.y - l.y;
  const x = dx * Math.cos(a) + dy * Math.sin(a), y = -dx * Math.sin(a) + dy * Math.cos(a);
  if (l.kind === 'polygon' && l.points.length >= 6) {
    let inside = false;
    for (let i = 0, j = l.points.length - 2; i < l.points.length; j = i, i += 2) {
      const xi = l.points[i], yi = l.points[i + 1], xj = l.points[j], yj = l.points[j + 1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  return x >= 0 && y >= 0 && x <= l.width && y <= l.height;
}

/** Sample a curator-marked source region through the renderer's cover crop.
 * Text uses box occupancy; opacity is accumulated. This is visibility, not salience recognition.
 */
export function subjectVisibility(recipe: RecreationRecipe, subject: SubjectRegion) {
  const slot = recipe.matrix?.media.find(m => m.asset?.sha256 === subject.assetSha256);
  const media = recipe.scene.layers.find(l => l.id === slot?.layerId);
  if (!slot?.asset || !media) return { status: 'unknown' as const, reason: 'No matching media asset' };
  const s = subject;
  if (![s.x, s.y, s.width, s.height].every(Number.isFinite) || s.x < 0 || s.y < 0 || s.width <= 0 || s.height <= 0 || s.x + s.width > 1.000001 || s.y + s.height > 1.000001) throw new Error('Invalid subject region');
  const scale = Math.max(media.width / slot.asset.width, media.height / slot.asset.height);
  const cropX = (slot.asset.width - media.width / scale) * slot.positionX, cropY = (slot.asset.height - media.height / scale) * slot.positionY;
  const later = [...recipe.scene.layers].sort((a, b) => a.zIndex - b.zIndex || a.id.localeCompare(b.id));
  const occluders = later.slice(later.findIndex(l => l.id === media.id) + 1).filter(l => l.opacity > 0 && l.kind !== 'line');
  let inside = 0, visible = 0;
  const a = media.rotationDeg * Math.PI / 180;
  for (let row = 0; row < 40; row++) for (let col = 0; col < 40; col++) {
    const localX = ((s.x + s.width * (col + .5) / 40) * slot.asset.width - cropX) * scale;
    const localY = ((s.y + s.height * (row + .5) / 40) * slot.asset.height - cropY) * scale;
    if (localX < 0 || localY < 0 || localX > media.width || localY > media.height) continue;
    const point = { x: media.x + localX * Math.cos(a) - localY * Math.sin(a), y: media.y + localX * Math.sin(a) + localY * Math.cos(a) };
    if (point.x < 0 || point.y < 0 || point.x > recipe.scene.source.widthPx || point.y > recipe.scene.source.heightPx) continue;
    inside++;
    let transmittance = media.opacity;
    for (const l of occluders) if (contains(l, point)) transmittance *= 1 - l.opacity;
    visible += transmittance;
  }
  return { status: 'measured' as const, method: '40x40 sampled source region; cover crop; conservative text boxes; alpha transmittance',
    source: subject.provenance, subject: subject.label, retainedAfterCrop: round(inside / 1600), exposure: round(visible / 1600),
    mediaAreaFraction: round(media.width * media.height / (recipe.scene.source.widthPx * recipe.scene.source.heightPx)) };
}

function contrast(a: string, b: string) {
  const luminance = (hex: string) => hex.match(/[a-f0-9]{2}/gi)!.map(v => parseInt(v, 16) / 255)
    .map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4).reduce((v, n, i) => v + n * [.2126, .7152, .0722][i], 0);
  const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}

export function assess(recipe: RecreationRecipe, brief: QualityBrief) {
  const texts = recipe.scene.layers.filter(l => l.kind === 'text' && l.opacity > 0);
  const title = texts.filter(l => /^title-\d+$/.test(l.id)).sort((a, b) => Number(a.id.slice(6)) - Number(b.id.slice(6)));
  const lines = title.map(l => l.text ?? '');
  const metrics = layerMeasurements(recipe);
  const outside = texts.filter(l => layerCorners(l).some(p => p.x < -.1 || p.y < -.1 || p.x > recipe.scene.source.widthPx + .1 || p.y > recipe.scene.source.heightPx + .1)).map(l => l.id);
  const collisions = texts.flatMap((a, i) => texts.slice(i + 1).filter(b => intersects(a, b)).map(b => [a.id, b.id]));
  const text = (id: string) => texts.find(l => l.id === id)?.text;
  const normalize = (s: string) => s.trim().replace(/\s+/g, ' ');
  const preserved = normalize(lines.join(' ')) === normalize(brief.title) && text('support') === brief.support && text('cta-copy') === brief.cta;
  const titleContrasts = title.map(l => {
    const ground = recipe.scene.layers.find(s => s.id === l.id.replace('title-', 'highlight-')) ?? recipe.scene.layers.find(s => s.id === 'surface');
    return ground && ground.opacity === 1 ? contrast(l.fill, ground.fill) : null;
  });
  const minTitleContrast = titleContrasts.length && titleContrasts.every(n => n !== null) ? Math.min(...titleContrasts as number[]) : null;
  const failures = [
    ...(!preserved ? ['copy-changed'] : []), ...(metrics.some(m => !m.fits) ? ['text-overflow'] : []),
    ...(outside.length ? ['text-outside-artboard'] : []), ...(collisions.length ? ['text-collision'] : []),
    ...(minTitleContrast === null ? ['title-contrast-unknown'] : minTitleContrast < 4.5 ? ['title-contrast-below-policy'] : []),
  ];
  const breaks = lineBreakWarnings(lines);
  const subject = brief.subject ? subjectVisibility(recipe, brief.subject) : null;
  const coreText = texts.filter(l => /^title-\d+$/.test(l.id) || ['support', 'cta-copy'].includes(l.id));
  // 16 px refers to this 736×920 native artifact, not a universal readability threshold.
  const tinyCoreText = coreText.filter(l => l.fontSize < 16).map(l => l.id);
  const cautions = [
    ...breaks.map(b => b.code), ...(tinyCoreText.length ? ['small-core-text'] : []),
    ...(brief.intent === 'product' && !subject ? ['subject-not-marked'] : []),
    ...(subject?.status === 'unknown' ? ['subject-visibility-unknown'] : []),
    ...(subject?.status === 'measured' && subject.exposure < .8 ? ['subject-obscured-or-cropped'] : []),
    ...(subject?.status === 'measured' && subject.mediaAreaFraction < .2 ? ['media-too-small-for-policy'] : []),
  ];
  return { version: QUALITY_VERSION, technical: { status: failures.length ? 'failed' : 'passed', failures,
      preserved, outside, collisions, minTitleContrast: minTitleContrast === null ? null : round(minTitleContrast), measurements: metrics },
    composition: { status: cautions.length ? 'needs-review' : 'passes-measured-policy', cautions, lines, breaks, tinyCoreText, subject },
    communication: { status: 'human-review-required', question: 'A mensagem e o foco principal ficam claros para este briefing?' },
    visual: { status: 'human-review-required', question: 'Qual variante tem a melhor hierarquia, ritmo e impacto para este caso?' },
    realWorld: { status: 'not-measured', note: 'Publicação, edição e desempenho com o público não foram medidos.' } };
}
