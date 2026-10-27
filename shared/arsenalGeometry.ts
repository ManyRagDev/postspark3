import {
  arsenalHash,
  readContentSource,
  contentCoverageIssues,
} from "./arsenalContent";
import {
  orderArsenalRelations,
  fragmentContentText,
  resolveArsenalShapePoints,
  type ArsenalComposition,
  type ArsenalElement,
  type ArsenalGroup,
  type ArsenalTextFragment,
} from "./designArsenal";

export type ArsenalTextMeasureInput = {
  text: string;
  richText?: ArsenalElement["richText"];
  width: number;
  fontSize: number;
  fontFamily: string;
  fontStyle: string;
  fill: string;
  align?: "left" | "center" | "right";
  lineHeight?: number;
  letterSpacing?: number;
  wordBreak?: "word";
};
export type ArsenalTextMeasurement = {
  height: number;
  lines: Array<{ width: number }>;
  runs: Array<{ fill: string; fontSize: number; fontStyle: string }>;
};
export type ArsenalTextMeasurer = (
  input: ArsenalTextMeasureInput
) => ArsenalTextMeasurement;
export type ArsenalGeometryOptions = {
  measureText: ArsenalTextMeasurer;
  allowReduction?: boolean;
  elasticReduction?: boolean;
};
export function measureArsenalElement(
  e: ArsenalElement,
  measureText: ArsenalTextMeasurer
) {
  return measureText({
    text: e.text,
    richText: e.richText,
    width: e.width,
    fontSize: e.fontSize,
    fontFamily: e.fontFamily,
    fontStyle: String(e.fontWeight),
    fill: e.fill,
    align: e.align,
    lineHeight: e.lineHeight,
    letterSpacing: e.letterSpacing,
    wordBreak: "word",
  });
}
function contrastRatio(a: string, b: string): number {
  const luminance = (hex: string) => {
    if (!/^#[a-f\d]{6}$/i.test(hex)) return NaN;
    const rgb = [1, 3, 5]
      .map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map(v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function textFragmentRuns(
  text: string,
  fragments: ArsenalTextFragment[]
): NonNullable<ArsenalElement["richText"]> {
  const result: NonNullable<ArsenalElement["richText"]> = [];
  let cursor = 0;
  for (const fragment of [...fragments].sort((a, b) => a.start - b.start)) {
    const start = Math.min(text.length, Math.max(cursor, fragment.start)),
      end = Math.min(text.length, fragment.end);
    if (start > cursor) result.push({ text: text.slice(cursor, start) });
    if (end > start)
      result.push({ text: text.slice(start, end), ...fragment.style });
    cursor = Math.max(cursor, end);
  }
  if (cursor < text.length) result.push({ text: text.slice(cursor) });
  return result;
}

export function arsenalWorldGeometry(
  e: ArsenalElement | ArsenalGroup,
  groups: ArsenalGroup[]
) {
  let x = e.x,
    y = e.y,
    rotation = e.rotation,
    scale = 1,
    parent = e.parentId;
  while (parent) {
    const g = groups.find(g => g.id === parent);
    if (!g) throw new Error("Grupo ausente");
    const a = (g.rotation * Math.PI) / 180,
      c = Math.cos(a),
      s = Math.sin(a);
    const oldX = x;
    x = g.x + g.scale * (oldX * c - y * s);
    y = g.y + g.scale * (oldX * s + y * c);
    rotation += g.rotation;
    scale *= g.scale;
    parent = g.parentId;
  }
  return { x, y, rotation, scale };
}

export function resolveArsenalGeometry(
  source: ArsenalComposition,
  options: ArsenalGeometryOptions
): ArsenalComposition {
  const { measureText, allowReduction = false, elasticReduction = false } = options;
  const c = structuredClone(source),
    issues: string[] = [];
  const hidden = new Set(c.version === 3 ? (c.hiddenInstanceIds ?? []) : []);
  c.elements = c.base.instances
    .filter(i => !hidden.has(i.id))
    .map(i => {
      const piece = c.pieces[i.pieceHash];
      if (!piece) throw new Error(`Peça ausente: ${i.id}`);
      const { pieceHash, ...instance } = i;
      return {
        ...instance,
        ...piece,
        text: piece.fixedText ?? "",
        bindingId: null,
        itemId: null,
        richText: c.richText[i.id],
        mediaSlot: c.base.mediaSlots?.find(slot => slot.id === i.id)
          ? {
              ...c.base.mediaSlots.find(slot => slot.id === i.id)!,
              prompt:
                c.mediaSlotPrompts?.[i.id] ??
                c.base.mediaSlots.find(slot => slot.id === i.id)!.prompt,
            }
          : undefined,
        ...c.overrides[i.id],
      } as ArsenalElement;
    });
  if (c.version === 3 && c.authorialLayers?.length) {
    for (const layer of c.authorialLayers) {
      if (layer.kind === "image" && layer.url) {
        c.media[layer.id] = {
          kind: "user",
          url: layer.url,
          focalX: layer.focalX ?? 0.5,
          focalY: layer.focalY ?? 0.5,
        };
      }
      const el: ArsenalElement = {
        id: layer.id,
        parentId: layer.parentId ?? null,
        zIndex: layer.zIndex,
        x: layer.x,
        y: layer.y,
        width: layer.width,
        height: layer.height,
        rotation: layer.rotation ?? 0,
        opacity: layer.opacity ?? 1,
        kind: layer.kind === "image" ? "media" : layer.kind,
        fill: layer.fill ?? "#111111",
        stroke: layer.stroke ?? null,
        strokeWidth: layer.strokeWidth ?? 0,
        cornerRadius: layer.cornerRadius ?? 0,
        points: layer.points ?? [],
        fontFamily: layer.fontFamily ?? "Inter",
        fontAssetId: null,
        fontSize: layer.fontSize ?? 24,
        fontWeight: layer.fontWeight ?? 400,
        align: layer.align ?? "left",
        lineHeight: layer.lineHeight ?? 1.3,
        letterSpacing: layer.letterSpacing ?? 0,
        fixedText: null,
        text: layer.kind === "text" ? (layer.text ?? "") : "",
        bindingId: null,
        itemId: null,
        richText: layer.richText ?? c.richText[layer.id],
        ...c.overrides[layer.id],
      };
      c.elements.push(el);
    }
  }
  if (c.version === 3 && c.customBackground?.fill) {
    c.artboard.background = c.customBackground.fill;
  }
  c.groups = c.base.groups.map(
    g => ({ ...g, ...c.overrides[g.id] }) as ArsenalGroup
  );
  const repeats = new Map<string, string[]>();
  for (const b of c.base.bindings) {
    if (b.kind === "media") continue;
    if (b.targetIds.every(t => hidden.has(t))) continue;
    const value = readContentSource(
      c.content,
      b.source as Parameters<typeof readContentSource>[1]
    );
    if (b.kind === "list" && Array.isArray(value)) {
      if (b.listMode === "native-slots") {
        if (!b.cardinality || (value.length < b.cardinality.min && (b.required || value.length > 0)) ||
          value.length > b.cardinality.max || value.length > b.targetIds.length)
          issues.push(`cardinality:${b.id}`);
        if (b.required && value.some(item => !item.text.trim()))
          issues.push(`content_coverage:${b.id}`);
        for (let index = 0; index < b.targetIds.length; index++) {
          const target = b.targetIds[index];
          const element = c.elements.find(e => e.id === target);
          if (!element) continue;
          const item = value[index];
          element.bindingId = b.id;
          element.itemId = item?.id ?? null;
          const overrideText = c.overrides[element.id]?.text;
          element.text = typeof overrideText === "string" ? overrideText : (item ? `${b.prefix}${item.text}` : "");
          if ((!item || hidden.has(target)) && !c.overrides[element.id]) element.opacity = 0;
          element.richText = c.richText[element.id];
        }
        continue;
      }
      const original = c.elements.find(e => e.id === b.targetIds[0]);
      if (!original) continue;
      if (
        b.cardinality &&
        ((value.length < b.cardinality.min && (b.required || value.length > 0)) || value.length > b.cardinality.max)
      )
        issues.push(`cardinality:${b.id}`);
      c.elements = c.elements.filter(e => e !== original);
      const elements = value.map((item, index) => {
        const id = `${original.id}~${arsenalHash(item.id).slice(0, 16)}`;
        return {
          ...original,
          id,
          text: item.text,
          bindingId: b.id,
          itemId: item.id,
          y: original.y + index * (original.height + b.gap),
          richText: c.richText[id],
          ...c.overrides[id],
        } as ArsenalElement;
      });
      c.elements.push(...elements);
      repeats.set(
        original.id,
        elements.map(e => e.id)
      );
    } else if (b.kind === "text")
      for (const target of b.targetIds) {
        if (hidden.has(target)) continue;
        const e = c.elements.find(e => e.id === target);
        if (!e) continue;
        const overrideText = c.overrides[e.id]?.text;
        e.text = typeof overrideText === "string"
          ? overrideText
          : fragmentContentText(
              typeof value === "string" ? value : "",
              e.contentFragment
            );
        if (!c.richText[e.id] && e.textFragments)
          e.richText = textFragmentRuns(e.text, e.textFragments);
        e.bindingId = b.id;
        if (!e.text && !c.overrides[e.id]) e.opacity = 0;
        // A short canonical title can leave one authored fragment empty. Its
        // siblings still display the complete title; require the source, not each slice.
        if (b.required && (typeof value !== "string" || !value.trim()))
          issues.push(`content_coverage:${b.id}`);
      }
  }
  issues.push(...contentCoverageIssues(c.content, c.base.bindings));
  const expand = (id: string) => repeats.get(id) ?? [id];
  const find = (id: string): ArsenalElement | ArsenalGroup | undefined =>
    c.elements.find(e => e.id === id) ?? c.groups.find(g => g.id === id);
  const write = (
    id: string,
    properties: string[],
    values: Record<string, number>
  ) => {
    const e = find(id);
    if (!e) return;
    for (const p of properties)
      if (p in values && !(p in (c.overrides[id] ?? {})))
        Object.assign(e, { [p]: values[p] });
  };
  let reduced = false;
  for (const r of orderArsenalRelations(c.relations)) {
    const inputs = r.inputs
      .flatMap(expand)
      .map(find)
      .filter((e): e is ArsenalElement | ArsenalGroup => Boolean(e));
    for (const o of r.outputs)
      for (const id of expand(o.targetId)) {
        const e = find(id);
        if (!e) continue;
        if (r.kind === "textFit" && "text" in e) {
          const p = r.parameters,
            base = c.base.instances.find(i => i.id === o.targetId) ?? e;
          const natural = measureText({
            text: e.text,
            richText: e.richText,
            width: 1000000,
            fontSize: e.fontSize,
            fontFamily: e.fontFamily,
            fontStyle: String(e.fontWeight),
            fill: e.fill,
            lineHeight: e.lineHeight,
            letterSpacing: e.letterSpacing,
          });
          const requestedWidth = Math.min(
            p.maxWidth,
            Math.max(base.width, ...natural.lines.map(l => l.width))
          );
          write(id, o.properties, { width: requestedWidth });
          let layout = measureArsenalElement(e, measureText);
          // An indivisible token may overflow horizontally while its one-line
          // height still fits. The authored font-size interval covers both axes.
          const overflowsTokenWidth = () => e.text.split(/\s+/).some(token => {
            const measured = measureText({
              text: token, width: 1000000, fontSize: e.fontSize,
              fontFamily: e.fontFamily, fontStyle: String(e.fontWeight),
              fill: e.fill, letterSpacing: e.letterSpacing,
            });
            return measured.lines.some(line => line.width > e.width + 0.01);
          });
          if (
            allowReduction &&
            o.properties.includes("fontSize") &&
            !("fontSize" in (c.overrides[id] ?? {}))
          ) {
            for (
              let attempt = 0;
              attempt < 64 &&
              (layout.height > p.maxHeight || layout.lines.some(line => line.width > e.width + 0.01) || overflowsTokenWidth()) &&
              e.fontSize > p.minFontSize;
              attempt++
            ) {
              const next = Math.max(
                p.minFontSize,
                e.fontSize -
                  Math.max(1, (e.fontSize - p.minFontSize) / (64 - attempt))
              );
              if (next >= e.fontSize) break;
              e.fontSize = next;
              layout = measureArsenalElement(e, measureText);
              reduced = true;
            }
            // Camada 1: tolerância elástica segura (até 20% abaixo do minFontSize, piso de 12px)
            // para salvar o layout quando um token indivisível estiver apenas ligeiramente além da largura.
            const elasticFloor = Math.max(12, Math.floor(p.minFontSize * 0.8));
            if (elasticReduction && overflowsTokenWidth() && e.fontSize > elasticFloor) {
              for (
                let attempt = 0;
                attempt < 32 &&
                overflowsTokenWidth() &&
                layout.height <= p.maxHeight &&
                e.fontSize > elasticFloor;
                attempt++
              ) {
                const next = Math.max(
                  elasticFloor,
                  e.fontSize -
                    Math.max(0.5, (e.fontSize - elasticFloor) / (32 - attempt))
                );
                if (next >= e.fontSize) break;
                e.fontSize = next;
                layout = measureArsenalElement(e, measureText);
                reduced = true;
              }
            }
          }
          if (layout.height > p.maxHeight) issues.push(`overflow:${id}`);
          // The layout engine can wrap graphemes; a wide indivisible token is still an explicit warning.
          const wide = overflowsTokenWidth();
          if (wide) issues.push(`overflow:token:${id}`);
          const x =
            p.anchor === "center"
              ? base.x + (base.width - e.width) / 2
              : p.anchor === "right"
                ? base.x + base.width - e.width
                : base.x;
          write(id, o.properties, { x, height: Math.max(1, layout.height) });
        } else if (r.kind === "surfaceFit" && inputs.length) {
          const p = r.parameters;
          const left = Math.min(...inputs.map(e => e.x)),
            top = Math.min(...inputs.map(e => e.y));
          const right = Math.max(...inputs.map(e => e.x + e.width)),
            bottom = Math.max(...inputs.map(e => e.y + e.height));
          write(id, o.properties, {
            x: left - p.padding.left,
            y: top - p.padding.top,
            width: Math.max(
              p.minWidth,
              right - left + p.padding.left + p.padding.right
            ),
            height: Math.max(
              p.minHeight,
              bottom - top + p.padding.top + p.padding.bottom
            ),
          });
        } else if (r.kind === "anchor") {
          const p = r.parameters,
            reference = inputs[0] ?? {
              x: 0,
              y: 0,
              width: c.base.artboard.width,
              height: c.base.artboard.height,
            };
          const size = p.axis === "x" ? "width" : "height";
          const edge = (v: string) =>
            v === "center" ? 0.5 : v === "end" ? 1 : 0;
          write(id, o.properties, {
            [p.axis]:
              reference[p.axis] +
              reference[size] * edge(p.referenceEdge) -
              e[size] * edge(p.targetEdge) +
              p.offset,
          });
        } else if (r.kind === "verticalFlow") {
          const previous = inputs
            .filter(
              input =>
                !r.outputs.some(o => expand(o.targetId).includes(input.id))
            )
            .at(-1);
          const start = previous
            ? previous.y + previous.height + r.parameters.gap
            : r.parameters.startY;
          let y = start;
          for (const target of r.outputs.flatMap(o => expand(o.targetId))) {
            const node = find(target);
            if (!node) continue;
            const output = r.outputs.find(o =>
              expand(o.targetId).includes(target)
            )!;
            write(target, output.properties, { y });
            y = node.y + node.height + r.parameters.gap;
          }
        } else if (r.kind === "groupTransform")
          write(id, o.properties, r.parameters);
      }
  }
  resolveArsenalShapePoints(c);
  for (const e of c.elements) {
    if (e.kind === "text") {
      const layout = measureArsenalElement(e, measureText);
      if (layout.height > e.height + 0.01) issues.push(`overflow:${e.id}`);
    }
    if (e.kind === "media" && !c.media[e.id] && !e.imageAssetId && !e.mediaSlot?.deferred)
      issues.push(`missing_media:${e.id}`);
    if (e.opacity === 0) continue;
    const w = arsenalWorldGeometry(e, c.groups),
      angle = (w.rotation * Math.PI) / 180;
    const corners = [
      [0, 0],
      [e.width, 0],
      [0, e.height],
      [e.width, e.height],
    ].map(([x, y]) => ({
      x: w.x + w.scale * (x * Math.cos(angle) - y * Math.sin(angle)),
      y: w.y + w.scale * (x * Math.sin(angle) + y * Math.cos(angle)),
    }));
    if (
      corners.some(
        p =>
          p.x < -0.1 ||
          p.y < -0.1 ||
          p.x > c.base.artboard.width + 0.1 ||
          p.y > c.base.artboard.height + 0.1
      )
    ) {
      // Background decorations intentionally extend beyond the clipped artboard.
      if (e.kind === "text" || e.kind === "media")
        issues.push(`overflow:bounds:${e.id}`);
    }
  }
  issues.push(...auditArsenalGeometry(c, measureText));
  c.issues = Array.from(new Set(issues));
  c.state = c.issues.length
    ? "needs_adjustment"
    : reduced
      ? "adapted"
      : "applied";
  c.userContentHash = arsenalHash(c.content);
  if (c.userContentHash !== arsenalHash(source.content))
    throw new Error("Conteúdo alterado pela composição");
  return c;
}

export function auditArsenalGeometry(
  c: ArsenalComposition,
  measureText: ArsenalTextMeasurer
): string[] {
  const issues: string[] = [];
  const ancestors = (e: ArsenalElement) => {
    const ids = [e.id];
    let p = e.parentId;
    while (p) {
      ids.push(p);
      p = c.groups.find(g => g.id === p)?.parentId ?? null;
    }
    return ids;
  };
  const polygon = (e: ArsenalElement) => {
    const w = arsenalWorldGeometry(e, c.groups),
      r = (w.rotation * Math.PI) / 180;
    return [
      [0, 0],
      [e.width, 0],
      [e.width, e.height],
      [0, e.height],
    ].map(([x, y]) => ({
      x: w.x + w.scale * (x * Math.cos(r) - y * Math.sin(r)),
      y: w.y + w.scale * (x * Math.sin(r) + y * Math.cos(r)),
    }));
  };
  const intersects = (
    a: ReturnType<typeof polygon>,
    b: ReturnType<typeof polygon>
  ) =>
    [a, b].every(poly =>
      poly.every((p, i) => {
        const q = poly[(i + 1) % 4],
          ax = -(q.y - p.y),
          ay = q.x - p.x;
        const x = a.map(v => v.x * ax + v.y * ay),
          y = b.map(v => v.x * ax + v.y * ay);
        return (
          Math.min(...x) < Math.max(...y) - 0.01 &&
          Math.min(...y) < Math.max(...x) - 0.01
        );
      })
    );
  const texts = c.elements.filter(
    e => e.kind === "text" && e.text && e.opacity > 0
  );
  // Match the renderer's recursive paint order before checking photo protection.
  const paintOrder = new Map<string, number>();
  const visit = (parentId: string | null) => {
    for (const node of [...c.elements, ...c.groups]
      .filter(n => n.parentId === parentId)
      .sort((a, b) => a.zIndex - b.zIndex || a.id.localeCompare(b.id))) {
      paintOrder.set(node.id, paintOrder.size);
      if (!("kind" in node)) visit(node.id);
    }
  };
  visit(null);
  const opaquePhotoProtection = (text: ArsenalElement, image: ArsenalElement) =>
    c.elements.some(surface => {
      if (
        surface.kind !== "rect" ||
        surface.opacity !== 1 ||
        !/^#[a-f\d]{6}$/i.test(surface.fill) ||
        ancestors(surface).some(
          id => (c.groups.find(g => g.id === id)?.opacity ?? 1) !== 1
        ) ||
        (paintOrder.get(surface.id) ?? -1) <=
          (paintOrder.get(image.id) ?? -1) ||
        (paintOrder.get(surface.id) ?? -1) >= (paintOrder.get(text.id) ?? -1)
      )
        return false;
      const world = arsenalWorldGeometry(surface, c.groups),
        angle = (-world.rotation * Math.PI) / 180,
        inset = Math.min(
          surface.cornerRadius,
          surface.width / 2,
          surface.height / 2
        );
      return polygon(text).every(point => {
        const dx = (point.x - world.x) / world.scale,
          dy = (point.y - world.y) / world.scale,
          x = dx * Math.cos(angle) - dy * Math.sin(angle),
          y = dx * Math.sin(angle) + dy * Math.cos(angle);
        return (
          x >= inset &&
          y >= inset &&
          x <= surface.width - inset &&
          y <= surface.height - inset
        );
      });
    });
  const lineBoxAllows = (a: ArsenalElement, b: ArsenalElement) => {
    const pair = c.base.lineBoxOverlaps?.find(
      p => (p.a === a.id && p.b === b.id) || (p.b === a.id && p.a === b.id)
    );
    if (!pair) return false;
    const aw = arsenalWorldGeometry(a, c.groups),
      bw = arsenalWorldGeometry(b, c.groups);
    const as = c.base.bindings.find(
        binding => binding.id === a.bindingId
      )?.source,
      bs = c.base.bindings.find(binding => binding.id === b.bindingId)?.source;
    if (
      !as ||
      as !== bs ||
      Math.abs(aw.rotation) > 0.001 ||
      Math.abs(bw.rotation) > 0.001 ||
      measureArsenalElement(a, measureText).lines.length !== 1 ||
      measureArsenalElement(b, measureText).lines.length !== 1
    )
      return false;
    const overlap =
      Math.min(aw.y + a.height * aw.scale, bw.y + b.height * bw.scale) -
      Math.max(aw.y, bw.y);
    return (
      overlap > 0 &&
      overlap <=
        pair.maxOverlapFraction *
          Math.min(a.fontSize * aw.scale, b.fontSize * bw.scale)
    );
  };
  if (c.origin.componentAssembly) {
    const media = c.elements.filter(e => e.kind === "media" && e.opacity > 0);
    for (const text of texts) {
      const tid = ancestors(text),
        root = tid[tid.length - 1],
        world = arsenalWorldGeometry(text, c.groups);
      if (world.scale < 1 && (text.fontSize * world.scale) / 3 < 12)
        issues.push(`scaled_font_below_minimum:${text.id}`);
      for (const image of media) {
        const mid = ancestors(image),
          pending = !c.media[image.id] && image.mediaSlot?.deferred;
        if (!pending && mid[mid.length - 1] === root) continue;
        const intentional = c.base.intentionalOverlaps.some(
          ([a, b]) =>
            (tid.includes(a) && mid.includes(b)) ||
            (tid.includes(b) && mid.includes(a))
        );
        if (intentional && (!pending || opaquePhotoProtection(text, image)))
          continue;
        if (intersects(polygon(text), polygon(image)))
          issues.push(`collision:text_media:${text.id}/${image.id}`);
      }
    }
  }
  for (let i = 0; i < texts.length; i++)
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i],
        b = texts[j],
        aid = ancestors(a),
        bid = ancestors(b);
      if (
        c.base.intentionalOverlaps.some(
          ([x, y]) =>
            (aid.includes(x) && bid.includes(y)) ||
            (aid.includes(y) && bid.includes(x))
        )
      )
        continue;
      if (intersects(polygon(a), polygon(b)) && !lineBoxAllows(a, b))
        issues.push(`collision:${a.id}/${b.id}`);
    }
  // Audit opaque surfaces behind each text. Media/partially covered surfaces require human inspection.
  for (const e of texts) {
    const center = polygon(e).reduce(
      (p, v) => ({ x: p.x + v.x / 4, y: p.y + v.y / 4 }),
      { x: 0, y: 0 }
    );
    const contains = (surface: ArsenalElement) => {
      const w = arsenalWorldGeometry(surface, c.groups),
        r = (-w.rotation * Math.PI) / 180,
        dx = (center.x - w.x) / w.scale,
        dy = (center.y - w.y) / w.scale;
      const x = dx * Math.cos(r) - dy * Math.sin(r),
        y = dx * Math.sin(r) + dy * Math.cos(r);
      if (surface.kind === "polygon") {
        let inside = false;
        const points = surface.points;
        for (
          let i = 0, j = points.length - 2;
          i < points.length;
          j = i, i += 2
        ) {
          const xi = points[i],
            yi = points[i + 1],
            xj = points[j],
            yj = points[j + 1];
          if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
            inside = !inside;
        }
        return inside;
      }
      return x >= 0 && y >= 0 && x <= surface.width && y <= surface.height;
    };
    const behind = c.elements
      .filter(
        s =>
          s.opacity === 1 &&
          (s.kind === "rect" || s.kind === "media" || s.kind === "polygon") &&
          ancestors(s).every(
            id =>
              c.groups.find(g => g.id === id)?.opacity !== 0 &&
              (c.groups.find(g => g.id === id)?.opacity ?? 1) === 1
          ) &&
          (paintOrder.get(s.id) ?? -1) < (paintOrder.get(e.id) ?? -1) &&
          contains(s)
      )
      .sort(
        (a, b) => (paintOrder.get(b.id) ?? -1) - (paintOrder.get(a.id) ?? -1)
      )[0];
    if (behind?.kind === "media" && (c.media[behind.id] || behind.imageAssetId)) {
      issues.push(`contrast:unknown:${e.id}`);
      continue;
    }
    const background = behind?.fill ?? c.artboard.background;
    const ratio = contrastRatio(background, e.fill);
    // Logical artboard pixels are 3× the official 360px stage.
    const effectiveScale = arsenalWorldGeometry(e, c.groups).scale;
    const threshold =
      (e.fontSize * effectiveScale) / 3 >= 24 ||
      (e.fontWeight >= 700 && (e.fontSize * effectiveScale) / 3 >= 18.66)
        ? 3
        : 4.5;
    const outlined =
      !!e.stroke &&
      (e.strokeWidth * effectiveScale) / 3 >= 1 &&
      contrastRatio(background, e.stroke) >= threshold;
    if (!Number.isFinite(ratio)) issues.push(`contrast:unknown:${e.id}`);
    else if (
      !outlined &&
      (ratio < threshold ||
        measureArsenalElement(e, measureText).runs.some(
          run =>
            contrastRatio(background, run.fill) <
            ((run.fontSize * effectiveScale) / 3 >= 24 ||
            (run.fontStyle.includes("700") &&
              (run.fontSize * effectiveScale) / 3 >= 18.66)
              ? 3
              : 4.5)
        ))
    )
      issues.push(`contrast:low:${e.id}`);
  }
  return issues;
}
