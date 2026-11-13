import type {
  ArsenalComposition,
  ArsenalElement,
  ArsenalGroup,
} from "./designArsenal";
import type { ArsenalTextMeasurer } from "./arsenalGeometry";
import { authoredTextFitLimits, isCanvasBackdrop, arsenalPaintOrder } from "./arsenalPhysicalContract";

type Rect = { x: number; y: number; width: number; height: number };
type World = { x: number; y: number; scale: number; rotation: number };
type Services = {
  measureText: ArsenalTextMeasurer;
  fontMaximum?: (element: ArsenalElement) => number;
  authoredLimits?: boolean;
  world: (element: ArsenalElement | ArsenalGroup) => World;
  resolve: (composition: ArsenalComposition) => ArsenalComposition;
};
const epsilon = 0.01;
const geometryKeys = ["x", "y", "width", "height", "fontSize"];
const right = (r: Rect) => r.x + r.width;
const bottom = (r: Rect) => r.y + r.height;
const finiteBox = (r: Rect) =>
  Object.values(r).every(Number.isFinite) && r.width > 0 && r.height > 0;

/** Local conservative fallback. Authorial boxes, column edges, line leading and
 * explicit surfaceFit padding supply the bounds; no text-length/style heuristic.
 * Ambiguous decoration, rotation, manual geometry and dependent flows opt out. */
export function adaptArsenalTextToFreeSpace(
  initial: ArsenalComposition,
  services: Services
): ArsenalComposition {
  let current = initial;
  const worldBox = (e: ArsenalElement, box: Rect = e): Rect => {
    const w = services.world(e),
      a = (w.rotation * Math.PI) / 180;
    const corners = [
      [0, 0],
      [box.width, 0],
      [0, box.height],
      [box.width, box.height],
    ].map(([x, y]) => ({
      x: w.x + w.scale * (x * Math.cos(a) - y * Math.sin(a)),
      y: w.y + w.scale * (x * Math.sin(a) + y * Math.cos(a)),
    }));
    const x = Math.min(...corners.map(p => p.x)),
      y = Math.min(...corners.map(p => p.y));
    return {
      x,
      y,
      width: Math.max(...corners.map(p => p.x)) - x,
      height: Math.max(...corners.map(p => p.y)) - y,
    };
  };
  const measure = (e: ArsenalElement, width: number, fontSize: number) =>
    services.measureText({
      text: e.text,
      richText: e.richText,
      width,
      fontSize,
      fontFamily: e.fontFamily,
      fontStyle: String(e.fontWeight),
      fill: e.fill,
      align: e.align,
      lineHeight: e.lineHeight,
      letterSpacing: e.letterSpacing,
      wordBreak: "word",
    });
  const fits = (
    e: ArsenalElement,
    width: number,
    height: number,
    fontSize: number
  ) => {
    const m = measure(e, width, fontSize);
    return (
      m.height <= height &&
      m.lines.every(line => line.width <= width + epsilon) &&
      e.text
        .split(/\s+/)
        .every(token =>
          measure(
            { ...e, text: token, richText: undefined },
            1e6,
            fontSize
          ).lines.every(line => line.width <= width + epsilon)
        )
    );
  };
  const originalBox = (
    c: ArsenalComposition,
    e: ArsenalElement
  ): ArsenalElement => {
    if (c.overrides[e.id]?.adaptiveTextFitVersion === 2) return e;
    const b = c.base.instances.find(i => i.id === e.id);
    return b ? { ...e, x: b.x, y: b.y, width: b.width, height: b.height } : e;
  };
  for (const targetId of initial.elements
    .filter(e => e.kind === "text" && e.text.trim())
    .map(e => e.id)) {
    const e = current.elements.find(e => e.id === targetId)!;
    if (
      !e ||
      e.opacity === 0 ||
      geometryKeys.some(key =>
        Object.hasOwn(current.overrides[e.id] ?? {}, key)
      )
    )
      continue;
    const base = current.base.instances.find(i => i.id === e.id),
      piece = base && current.pieces[base.pieceHash];
    const fit = current.relations.find(
      r =>
        r.enabled &&
        r.kind === "textFit" &&
        r.outputs.some(o => o.targetId === e.id)
    );
    if (
      !base ||
      !piece ||
      fit?.kind !== "textFit" ||
      fits(e, base.width, base.height, e.fontSize)
    )
      continue;
    const output = fit.outputs.find(o => o.targetId === e.id)!;
    if (
      !(["x", "width", "height", "fontSize"] as const).every(property =>
        output.properties.includes(property)
      )
    )
      continue;
    const w = services.world(e);
    if (Math.abs(w.rotation) > epsilon || w.scale <= 0 || e.rotation !== 0)
      continue;
    const linked = current.relations.filter(
      r => r.enabled && r.inputs.includes(e.id)
    );
    if (
      linked.some(
        r =>
          r.kind !== "surfaceFit" ||
          r.inputs.length !== 1 ||
          r.outputs.some(
            o =>
              !(["x", "y", "width", "height"] as const).every(property =>
                o.properties.includes(property)
              )
          )
      )
    )
      continue;
    const surfaceIds = linked.flatMap(r => r.outputs.map(o => o.targetId));
    const surfaces = surfaceIds.map(id =>
      current.elements.find(item => item.id === id)
    );
    if (
      surfaces.some(
        s =>
          !s ||
          s.kind !== "rect" ||
          s.parentId !== e.parentId ||
          s.rotation !== 0 ||
          geometryKeys.some(key =>
            Object.hasOwn(current.overrides[s.id] ?? {}, key)
          )
      )
    )
      continue;
    const members = [e, ...(surfaces as ArsenalElement[])],
      memberIds = new Set(members.map(m => m.id));
    // Never silently detach an anchor/flow or a second decorator from a fitted set.
    if (
      current.relations.some(
        r =>
          r.enabled &&
          r.id !== fit.id &&
          !linked.some(link => link.id === r.id) &&
          (r.inputs.some(id => memberIds.has(id)) ||
            r.outputs.some(o => memberIds.has(o.targetId)))
      )
    )
      continue;
    const authored = current.elements.map(item => originalBox(current, item));
    const paintOrder=arsenalPaintOrder(current);
    const fullBackdrop = (item: ArsenalElement) => isCanvasBackdrop(current,item,services.world,paintOrder);
    const foreground = authored.filter(item => !fullBackdrop(item));
    const boxes = foreground.map(item => worldBox(item));
    if (!boxes.length) continue;
    const envelope = {
      x: Math.max(0, Math.min(...boxes.map(b => b.x))),
      y: Math.max(0, Math.min(...boxes.map(b => b.y))),
      width: 0,
      height: 0,
    };
    envelope.width =
      Math.min(current.artboard.width, Math.max(...boxes.map(right))) -
      envelope.x;
    envelope.height =
      Math.min(current.artboard.height, Math.max(...boxes.map(bottom))) -
      envelope.y;
    const obstacles = foreground
      .filter(item => !memberIds.has(item.id))
      .map(item => {
        const authored = worldBox(item),
          resolved = worldBox(current.elements.find(e => e.id === item.id)!);
        const x = Math.min(authored.x, resolved.x),
          y = Math.min(authored.y, resolved.y);
        // A moved/manual/flowed neighbor reserves both its authorial slot and its
        // current footprint. Free space must be free in the actual composition.
        return {
          x,
          y,
          width: Math.max(right(authored), right(resolved)) - x,
          height: Math.max(bottom(authored), bottom(resolved)) - y,
        };
      });
    // Preserve at least one authored line-leading gap, or the entire existing gap
    // when smaller. These are font/spacing units already present in the document.
    const authoredLeading = Math.max(
      0,
      piece.fontSize * ((piece.lineHeight ?? 1) - 1)
    );
    const advance = (text: string) =>
      Math.max(
        0,
        ...measure(
          { ...e, text, richText: undefined },
          1e6,
          piece.fontSize
        ).lines.map(line => line.width)
      );
    // Measure an internal space: Fontkit intentionally trims trailing separators.
    const spaceAdvance = Math.max(0, advance("M M") - 2 * advance("M"));
    const leading =
      (authoredLeading > epsilon ? authoredLeading : spaceAdvance) * w.scale;
    if (leading <= epsilon) continue;
    const separate = (before: Rect, after: Rect, obstacle: Rect) => {
      const gaps = [
        { gap: obstacle.x - right(before), next: obstacle.x - right(after) },
        { gap: before.x - right(obstacle), next: after.x - right(obstacle) },
        { gap: obstacle.y - bottom(before), next: obstacle.y - bottom(after) },
        { gap: before.y - bottom(obstacle), next: after.y - bottom(obstacle) },
      ];
      return gaps.some(
        ({ gap, next }) =>
          gap >= -epsilon &&
          next >= Math.min(Math.max(0, gap), leading) - epsilon
      );
    };
    const memberBoxes = (width: number, height: number) => {
      const x =
        fit.parameters.anchor === "center"
          ? base.x + (base.width - width) / 2
          : fit.parameters.anchor === "right"
            ? base.x + base.width - width
            : base.x;
      const text = { ...e, x, y: base.y, width, height };
      const result = [text];
      for (const relation of linked)
        if (relation.kind === "surfaceFit")
          for (const output of relation.outputs) {
            const surface = current.elements.find(
              item => item.id === output.targetId
            )!;
            const p = relation.parameters;
            result.push({
              ...surface,
              x: x - p.padding.left,
              y: base.y - p.padding.top,
              width: Math.max(
                p.minWidth,
                width + p.padding.left + p.padding.right
              ),
              height: Math.max(
                p.minHeight,
                height + p.padding.top + p.padding.bottom
              ),
            });
          }
      return result;
    };
    const limits=authoredTextFitLimits(base,fit);
    const safe = (width: number, height: number) =>
      (!services.authoredLimits || width<=limits.width+epsilon && height<=limits.height+epsilon) &&
      memberBoxes(width, height).every(member => {
        const after = worldBox(member),
          before = worldBox(
            originalBox(current, members.find(m => m.id === member.id)!)
          );
        if (
          !finiteBox(after) ||
          after.x < envelope.x - epsilon ||
          after.y < envelope.y - epsilon ||
          right(after) > right(envelope) + epsilon ||
          bottom(after) > bottom(envelope) + epsilon
        )
          return false;
        for (let parent = member.parentId; parent; ) {
          const group = current.groups.find(g => g.id === parent);
          if (!group) return false;
          // Every ancestor constrains the set, including nested translated/scaled groups.
          const gw = services.world(group);
          if (Math.abs(gw.rotation) > epsilon || group.scale <= 0) return false;
          const bounds = {
            x: gw.x,
            y: gw.y,
            width: group.width * gw.scale * group.scale,
            height: group.height * gw.scale * group.scale,
          };
          if (
            after.x < bounds.x - epsilon ||
            after.y < bounds.y - epsilon ||
            right(after) > right(bounds) + epsilon ||
            bottom(after) > bottom(bounds) + epsilon
          )
            return false;
          parent = group.parentId;
        }
        return obstacles.every(obstacle => separate(before, after, obstacle));
      });
    if (!safe(base.width, base.height)) continue;
    const maxSafe = (
      low: number,
      high: number,
      predicate: (n: number) => boolean
    ) => {
      if (predicate(high)) return high;
      for (let i = 0; i < 40; i++) {
        const mid = (low + high) / 2;
        if (predicate(mid)) low = mid;
        else high = mid;
      }
      return low;
    };
    const widthLimit = maxSafe(base.width, Math.min(envelope.width / w.scale,services.authoredLimits?limits.width:Infinity), width =>
      safe(width, base.height)
    );
    // A nearby authored column edge is a meaningful expansion boundary. Without
    // one, use only the minimum width that makes the current bounded font fit.
    const worldBase = worldBox(originalBox(current, e));
    const guides = boxes
      .filter(box =>
        fit.parameters.anchor === "left"
          ? Math.abs(box.x - worldBase.x) < epsilon
          : fit.parameters.anchor === "right"
            ? Math.abs(right(box) - right(worldBase)) < epsilon
            : Math.abs(
                box.x + box.width / 2 - worldBase.x - worldBase.width / 2
              ) < epsilon
      )
      .map(box => box.width / w.scale)
      .filter(
        width => width > base.width + epsilon && width <= widthLimit + epsilon
      )
      .sort((a, b) => a - b);
    let width = base.width,
      height = base.height;
    if (fits(e, widthLimit, height, e.fontSize)) {
      let low = base.width,
        high = widthLimit;
      for (let i = 0; i < 40; i++) {
        const mid = (low + high) / 2;
        if (fits(e, mid, height, e.fontSize)) high = mid;
        else low = mid;
      }
      width = guides.find(guide => guide >= high) ?? high;
    } else {
      // Height may grow only after width is exhausted, with the same spacing guard.
      width = guides.at(-1) ?? base.width;
      height = Math.max(base.height, measure(e, width, e.fontSize).height);
      if (!safe(width, height) || !fits(e, width, height, e.fontSize)) continue;
    }
    const heightLimit=services.authoredLimits?maxSafe(height,limits.height,value=>safe(width,value)):height;
    const fontSize = maxSafe(e.fontSize, services.fontMaximum?.(e) ?? piece.fontSize, size => {
      const needed=services.authoredLimits?Math.max(base.height,measure(e,width,size).height):height;
      return needed<=heightLimit+epsilon && fits(e,width,needed,size) && safe(width,needed);
    });
    if(services.authoredLimits)height=Math.max(base.height,measure(e,width,fontSize).height);
    const patches = memberBoxes(width, height);
    const candidate = structuredClone(current);
    for (const member of patches)
      candidate.overrides[member.id] = {
        ...candidate.overrides[member.id],
        adaptiveTextFitVersion: 2,
        x: member.x,
        y: member.y,
        width: member.width,
        height: member.height,
        ...(member.id === e.id ? { fontSize } : {}),
      };
    const resolved = services.resolve(candidate);
    // Refuse any newly introduced geometry/contrast issue, even when it belongs
    // to a different field. Existing unrelated findings remain for normal repair.
    const oldIssues = new Set(current.issues);
    if (resolved.issues.some(issue => !oldIssues.has(issue))) continue;
    const fitted = resolved.elements.find(item => item.id === e.id)!;
    if (!fitted || !fits(fitted, width, height, fontSize)) continue;
    current = resolved;
  }
  return current;
}
