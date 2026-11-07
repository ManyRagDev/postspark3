import { arsenalWorldGeometry } from "./arsenalGeometry";
import type { ArsenalComposition, ArsenalElement } from "./designArsenal";

type RGB = [number, number, number];
type Bounds = { low: RGB; high: RGB };
const unknown = (): Bounds => ({ low: [0, 0, 0], high: [255, 255, 255] });
const rgb = (color: string): RGB | undefined => /^#[a-f\d]{6}$/i.test(color)
  ? [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16)) as RGB : undefined;
const luminance = (color: RGB) => color.map(c => c / 255)
  .map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4)
  .reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
const ratio = (a: number, b: number) => (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
function contrastRange(color: RGB, background: Bounds) {
  const fg = luminance(color), lo = luminance(background.low), hi = luminance(background.high);
  return { min: fg >= lo && fg <= hi ? 1 : Math.min(ratio(fg, lo), ratio(fg, hi)), max: Math.max(ratio(fg, lo), ratio(fg, hi)) };
}
function composite(background: Bounds, foreground: RGB, alpha: number): Bounds {
  return { low: foreground.map((c, i) => Math.floor(c * alpha + background.low[i] * (1 - alpha))) as RGB,
    high: foreground.map((c, i) => Math.ceil(c * alpha + background.high[i] * (1 - alpha))) as RGB };
}
const union = (a: Bounds, b: Bounds): Bounds => ({ low: a.low.map((v, i) => Math.min(v, b.low[i])) as RGB, high: a.high.map((v, i) => Math.max(v, b.high[i])) as RGB });
export type ArsenalContrastCorrection = {
  elementId: string; before: string; after: string; threshold: number;
  beforeMaximum: number; afterMinimum: number;
  backgroundBounds: Bounds; surfaceIds: string[];
};
/** No raster sampling or semantic judgment. Bounds cover every possible pixel
 * behind known flat surfaces. Only a proven failure with a proven replacement
 * changes the text fill; ambiguous surfaces and authored rich text stay intact. */
export function correctArsenalSurfaceContrast(source: ArsenalComposition): {
  composition: ArsenalComposition; corrections: ArsenalContrastCorrection[];
} {
  if (source.version === 3 && (source.customBackground || source.authorialLayers.length)) return { composition: source, corrections: [] };
  const c = source, order: ArsenalElement[] = [];
  const visible = (e: ArsenalElement) => {
    let parent = e.parentId;
    while (parent) { const g = c.groups.find(g => g.id === parent); if (!g || g.opacity !== 1) return false; parent = g.parentId; }
    return e.opacity > 0;
  };
  const visit = (parentId: string | null) => {
    for (const n of [...c.groups, ...c.elements].filter(n => n.parentId === parentId).sort((a, b) => a.zIndex - b.zIndex || a.id.localeCompare(b.id))) {
      if ("kind" in n) order.push(n); else visit(n.id);
    }
  };
  visit(null);
  const box = (e: ArsenalElement) => { const w = arsenalWorldGeometry(e, c.groups); return { x: w.x, y: w.y, width: e.width * w.scale, height: e.height * w.scale, rotation: w.rotation, scale: w.scale }; };
  const overlaps = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  const corrections: ArsenalContrastCorrection[] = [];
  for (const [index, text] of Array.from(order.entries())) {
    if (text.kind !== "text" || !text.text || !visible(text) || text.opacity !== 1 || text.richText?.length || text.strokeWidth || !rgb(text.fill)) continue;
    const target = box(text);
    if (target.rotation % 360 !== 0) continue;
    let background = rgb(c.artboard.background) ? { low: rgb(c.artboard.background)!, high: rgb(c.artboard.background)! } : unknown();
    let unsupported = false;
    const surfaceIds: string[] = [];
    for (const [otherIndex, surface] of Array.from(order.entries())) {
      if (otherIndex === index || !surface.opacity) continue;
      // A translucent group or rotated surface can extend outside its axis box.
      // Refuse proof rather than assume the renderer's compositing details.
      if (!visible(surface) || box(surface).rotation % 360 !== 0) { unsupported = true; break; }
      const bounds = box(surface);
      if (!overlaps(target, bounds)) continue;
      if (otherIndex > index) { unsupported = true; break; }
      const color = rgb(surface.fill);
      const full = target.x >= bounds.x && target.y >= bounds.y && target.x + target.width <= bounds.x + bounds.width && target.y + target.height <= bounds.y + bounds.height;
      // All four text-box corners must lie inside a rounded rectangle.
      const radius = Math.min(surface.cornerRadius * bounds.scale, bounds.width / 2, bounds.height / 2);
      const insideRounded = [[target.x, target.y], [target.x + target.width, target.y], [target.x, target.y + target.height], [target.x + target.width, target.y + target.height]].every(([x, y]) => {
        const dx = x - Math.max(bounds.x + radius, Math.min(x, bounds.x + bounds.width - radius));
        const dy = y - Math.max(bounds.y + radius, Math.min(y, bounds.y + bounds.height - radius));
        return dx * dx + dy * dy <= Math.max(0, radius - surface.strokeWidth * bounds.scale) ** 2;
      });
      if (surface.kind === "rect" && color) {
        if (surface.strokeWidth && (!full || target.x < bounds.x + surface.strokeWidth * bounds.scale || target.y < bounds.y + surface.strokeWidth * bounds.scale || target.x + target.width > bounds.x + bounds.width - surface.strokeWidth * bounds.scale || target.y + target.height > bounds.y + bounds.height - surface.strokeWidth * bounds.scale)) { background = unknown(); continue; }
        const painted = composite(background, color, surface.opacity);
        background = full && insideRounded ? painted : union(background, painted);
        surfaceIds.push(surface.id);
      } else {
        // Raster, polygon and glyph coverage can contain any color. A later
        // enclosing panel may still establish a strong enough bound.
        background = unknown();
      }
    }
    if (unsupported) continue;
    const threshold = text.fontSize * target.scale / 3 >= 24 || (text.fontWeight >= 700 && text.fontSize * target.scale / 3 >= 18.66) ? 3 : 4.5;
    const before = contrastRange(rgb(text.fill)!, background);
    if (before.max >= threshold) continue; // cannot prove universal insufficiency
    const instance = c.base.instances.find(i => i.id === text.id);
    const authored = instance && c.pieces[instance.pieceHash]?.fill;
    const after = [authored, "#FFFFFF", "#000000"].find(fill => fill && rgb(fill) && contrastRange(rgb(fill)!, background).min >= threshold);
    if (!after) continue;
    corrections.push({ elementId: text.id, before: text.fill, after, threshold, beforeMaximum: before.max,
      afterMinimum: contrastRange(rgb(after)!, background).min, backgroundBounds: background, surfaceIds });
  }
  if (!corrections.length) return { composition: source, corrections };
  const composition = structuredClone(source);
  for (const change of corrections) {
    composition.overrides[change.elementId] = { ...composition.overrides[change.elementId], fill: change.after };
    composition.elements.find(e => e.id === change.elementId)!.fill = change.after;
  }
  return { composition, corrections };
}
