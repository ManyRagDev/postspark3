import {
  arsenalHash,
  readContentSource,
  contentCoverageIssues,
} from "./arsenalContent";
import { adaptArsenalTextToFreeSpace } from "./arsenalAdaptiveTextFit";
import { textFontFlexibility, largestFittingTextFont } from "./textFieldFlexibility";
import { subpixelTextOverflowLimit } from "./arsenalReadiness";
import { arsenalPaintOrder, isCanvasBackdrop, type PhysicalRect, type PhysicalWorld } from "./arsenalPhysicalContract";
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
  /** Use a conservative bound on glyph advances for text inside a fixed surface. */
  roundGlyphAdvances?: boolean;
};
export type ArsenalTextMeasurement = {
  height: number;
  lines: Array<{ width: number }>;
  runs: Array<{ fill: string; fontSize: number; fontStyle: string }>;
  inkBoxes?: PhysicalRect[];
  lineInk?: Array<{ top: number; bottom: number } | null>;
};
export type ArsenalTextMeasurer = (
  input: ArsenalTextMeasureInput
) => ArsenalTextMeasurement;
export type ArsenalGeometryOptions = {
  measureText: ArsenalTextMeasurer;
  allowReduction?: boolean;
  elasticReduction?: boolean;
  /** Reports small measured text excesses as readiness diagnostics. */
  allowSubpixelTextOverflow?: boolean;
  /** Opt-in local expansion into proven free space; writes durable overrides. */
  adaptiveTextFit?: boolean;
  /** Carries the same authored-box constraint through an adaptive retry. */
  respectAuthoredTextBox?: boolean;
  /** New admissions only: largest real font fit within the declared interval. */
  textFlexibilityVersion?: 1;
  /** Check measured glyph clearance and retain any geometric fit as native overrides. */
  guardTextSpacing?: boolean;
  auditTextSpacingOnly?: boolean;
};
/** A generated adaptive box is a persisted authorial override. Historical
 * scenes retain their original authored-box audit, including font-only overrides. */
export function arsenalTextLayoutBox(c: ArsenalComposition, e: ArsenalElement): ArsenalElement {
  const authored = c.base.instances.find(i => i.id === e.id);
  return authored && c.overrides[e.id]?.adaptiveTextFitVersion !== 2
    ? { ...e, width: authored.width, height: authored.height }
    : e;
}
function elementOverrides(patch: ArsenalComposition["overrides"][string] = {}) {
  const { adaptiveTextFitVersion: _metadata, ...values } = patch;
  return values;
}
export function measureArsenalElement(
  e: ArsenalElement,
  measureText: ArsenalTextMeasurer,
  roundGlyphAdvances = false
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
    ...(roundGlyphAdvances ? { roundGlyphAdvances: true } : {}),
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
  const {
    measureText,
    allowReduction = false,
    elasticReduction = false,
    allowSubpixelTextOverflow = false,
  } = options;
  const c = structuredClone(source),
    issues: string[] = [];
  const availableLineWidth = (width: number) => options.guardTextSpacing ? widthWithWrapClearance(width) : width + .01;
  const textOverflowTolerance = (element: ArsenalElement) =>
    allowSubpixelTextOverflow
      ? subpixelTextOverflowLimit(arsenalWorldGeometry(element, c.groups).scale)
      : 0;
  const reportTextOverflow = (target: string, withinTolerance: boolean) => {
    const rule = allowSubpixelTextOverflow && withinTolerance
      ? "overflow:subpixel"
      : "overflow";
    issues.push(`${rule}:${target}`);
  };
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
        ...elementOverrides(c.overrides[i.id]),
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
        ...elementOverrides(c.overrides[layer.id]),
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
              e.contentFragment, c.measuredSplits?.[b.id]
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
  // A blank optional item hides its associated card/marker as one visual unit.
  // Recomputed from canonical bindings (or the editor's explicit text override)
  // on each resolve; no instance is removed from the authoritative document.
  for (const binding of c.base.bindings) {
    if (!binding.hideWhenEmpty) continue;
    const occupied = c.elements.some(e =>
      e.bindingId === binding.id && e.kind === "text" && e.text.trim()
    );
    if (!occupied)
      for (const target of binding.hideWhenEmpty) {
        const element = c.elements.find(e => e.id === target);
        if (element) element.opacity = 0;
      }
  }
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
          const maxHeight = c.overrides[id]?.adaptiveTextFitVersion === 2
            ? e.height
            : options.adaptiveTextFit || options.respectAuthoredTextBox || options.textFlexibilityVersion === 1
              ? Math.min(p.maxHeight, base.height)
              : p.maxHeight;
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
          const requestedWidth = options.textFlexibilityVersion === 1
            ? Math.min(p.maxWidth, base.width)
            : Math.min(p.maxWidth, Math.max(base.width, ...natural.lines.map(l => l.width)));
          write(id, o.properties, { width: requestedWidth });
          let layout = measureArsenalElement(e, measureText);
          // An indivisible token may overflow horizontally while its one-line
          // height still fits. The authored font-size interval covers both axes.
          const overflowsTokenWidth = (tolerance = 0.01) => e.text.split(/\s+/).some(token => {
            const measured = measureText({
              text: token, width: 1000000, fontSize: e.fontSize,
              fontFamily: e.fontFamily, fontStyle: String(e.fontWeight),
              fill: e.fill, letterSpacing: e.letterSpacing,
            });
            return measured.lines.some(line => line.width > e.width + tolerance);
          });
          const manualGeometry = ["x","y","width","height","rotation","scale","fontSize"].some(key => Object.hasOwn(c.overrides[id] ?? {},key));
          if (options.textFlexibilityVersion === 1 && allowReduction && e.text.trim() && o.properties.includes("fontSize") && !manualGeometry) {
            const piece = "pieceHash" in base ? c.pieces[base.pieceHash] : undefined;
            const range = textFontFlexibility({
              preferredFontSize: piece?.fontSize ?? e.fontSize, authoredMinFontSize:p.minFontSize,
              artboardWidth:c.artboard.width, worldScale:arsenalWorldGeometry(e,c.groups).scale,
              authored:p.flexibility,
            });
            const originalFont=e.fontSize;
            const chosen=largestFittingTextFont(range,size=>{
              e.fontSize=size;
              layout=measureArsenalElement(e,measureText);
              return layout.height<=maxHeight && layout.lines.every(line=>line.width<=availableLineWidth(e.width)) && !overflowsTokenWidth();
            }, options.guardTextSpacing && layout.lines.length > 1);
            e.fontSize=chosen.fontSize;
            layout=measureArsenalElement(e,measureText);
            reduced ||= e.fontSize!==originalFont;
            if(chosen.fits) c.overrides[id]={...c.overrides[id],fontSize:e.fontSize};
          } else if (
            options.textFlexibilityVersion !== 1 && allowReduction &&
            o.properties.includes("fontSize") &&
            !("fontSize" in (c.overrides[id] ?? {}))
          ) {
            for (
              let attempt = 0;
              attempt < 64 &&
              (layout.height > maxHeight || layout.lines.some(line => line.width > availableLineWidth(e.width)) || overflowsTokenWidth()) &&
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
                layout.height <= maxHeight &&
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
          if (layout.height > maxHeight)
            reportTextOverflow(
              id,
              layout.height <= maxHeight + textOverflowTolerance(e)
            );
          // The layout engine can wrap graphemes; a wide indivisible token is still an explicit warning.
          const wide = overflowsTokenWidth();
          if (wide)
            reportTextOverflow(
              `token:${id}`,
              allowSubpixelTextOverflow &&
                !overflowsTokenWidth(textOverflowTolerance(e))
            );
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
  if (options.guardTextSpacing) {
    const spacing = inspectArsenalTextSpacing(c, measureText, allowReduction && !options.auditTextSpacingOnly,
      options.textFlexibilityVersion);
    if (spacing.adjusted)
      return resolveArsenalGeometry({ ...source, overrides: { ...source.overrides, ...spacing.overrides } },
        { ...options, auditTextSpacingOnly: true });
    issues.push(...spacing.issues);
  }
  for (const e of c.elements) {
    if (e.kind === "text") {
      const layout = measureArsenalElement(e, measureText);
      if (layout.height > e.height + 0.01)
        reportTextOverflow(e.id, layout.height <= e.height + textOverflowTolerance(e));
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
      const authoredBleed = e.artboardBleed && (e.kind === "media" || (e.kind === "text" && e.fixedTextRole === "ornament" && !e.bindingId));
      if (!authoredBleed && (e.kind === "text" || e.kind === "media"))
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
  return options.adaptiveTextFit
    ? adaptArsenalTextToFreeSpace(c, {
        measureText,
        authoredLimits: options.textFlexibilityVersion === 1,
        ...(options.textFlexibilityVersion === 1 ? { fontMaximum: (element: ArsenalElement) => {
          const base=c.base.instances.find(instance=>instance.id===element.id)!;
          const relation=c.relations.find(relation=>relation.kind==="textFit"&&relation.outputs.some(output=>output.targetId===element.id));
          return relation?.kind==="textFit" ? textFontFlexibility({preferredFontSize:c.pieces[base.pieceHash].fontSize,authoredMinFontSize:relation.parameters.minFontSize,artboardWidth:c.artboard.width,worldScale:arsenalWorldGeometry(element,c.groups).scale,authored:relation.parameters.flexibility}).max : element.fontSize;
        } } : {}),
        world: element => arsenalWorldGeometry(element, c.groups),
        resolve: candidate => resolveArsenalGeometry(candidate, { ...options, adaptiveTextFit: false, respectAuthoredTextBox: true }),
      })
    : c;
}

const lineClearance = 0.75;
const safeLeading = 1.15;
// Chromium rounds per-glyph Canvas advances differently from Fontkit. Keep
// space for that difference before a barely fitting word moves to a new row.
export const widthWithWrapClearance = (width: number) => Math.max(1, width - Math.max(1, width * .02));

function horizontalTextObstacles(c: ArsenalComposition) {
  return c.elements.flatMap(element => {
    if (!element.opacity || (element.kind !== "line" && element.kind !== "rect")) return [];
    const world = arsenalWorldGeometry(element, c.groups);
    if (Math.abs(world.rotation) > .01) return [];
    if (element.kind === "rect") {
      if (element.opacity !== 1 || !/^#[a-f\d]{6}$/i.test(element.fill) ||
        element.height * world.scale > 8 || element.width < element.height * 8) return [];
      return [{ element, top: world.y, bottom: world.y + element.height * world.scale,
        left: world.x, right: world.x + element.width * world.scale }];
    }
    const points = element.points;
    if (!element.strokeWidth || points?.length !== 4 ||
        Math.abs(points[1] - points[3]) > .01) return [];
    const y = world.y + points[1] * world.scale, half = element.strokeWidth * world.scale / 2;
    return [{ element, top: y - half, bottom: y + half,
      left: world.x + Math.min(points[0], points[2]) * world.scale,
      right: world.x + Math.max(points[0], points[2]) * world.scale }];
  });
}

/** Carousel variants may expand the opaque surface while its four authored
 * border strokes still describe the smaller native frame. */
function expandedTextFrame(c: ArsenalComposition, line: ArsenalElement) {
  const same = (a: number, b: number) => Math.abs(a - b) <= .01;
  const border = c.elements.filter(element => element.kind === "line" && element.opacity > 0 &&
    element.parentId === line.parentId && same(element.rotation, line.rotation) &&
    same(element.x, line.x) && same(element.y, line.y) &&
    same(element.width, line.width) && same(element.height, line.height) &&
    same(element.strokeWidth, line.strokeWidth) && element.stroke === line.stroke);
  if (border.length !== 4) return;
  const edges = new Set(border.map(element => {
    const [a, b, x, y] = element.points ?? [];
    if (same(a, x) && same(Math.abs(b - y), line.height)) return same(a, 0) ? "left" : same(a, line.width) ? "right" : null;
    if (same(b, y) && same(Math.abs(a - x), line.width)) return same(b, 0) ? "top" : same(b, line.height) ? "bottom" : null;
    return null;
  }));
  if (edges.size !== 4 || edges.has(null)) return;
  const surfaces = c.elements.filter(element => element.kind === "rect" && element.opacity === 1 &&
    /^#[a-f\d]{6}$/i.test(element.fill) && element.parentId === line.parentId &&
    same(element.rotation, line.rotation) && same(element.x, line.x) && same(element.width, line.width) &&
    element.y <= line.y && element.y + element.height >= line.y + line.height && element.height > line.height + .01);
  if (surfaces.length !== 1) return;
  return { border, surface: surfaces[0] };
}

function positionInSurface(text: PhysicalWorld, surface: PhysicalWorld) {
  const angle = surface.rotation * Math.PI / 180;
  const dx = (text.x - surface.x) / surface.scale;
  const dy = (text.y - surface.y) / surface.scale;
  return {
    x: dx * Math.cos(angle) + dy * Math.sin(angle),
    y: dy * Math.cos(angle) - dx * Math.sin(angle),
    scale: text.scale / surface.scale,
  };
}

function insideSurface(surface: ArsenalElement, x: number, y: number, inset: number) {
  const right = surface.width - inset, bottom = surface.height - inset;
  if (x < inset || x > right || y < inset || y > bottom) return false;
  const radius = Math.max(0, Math.min(surface.cornerRadius, surface.width / 2, surface.height / 2) - inset);
  const dx = x - Math.max(inset + radius, Math.min(right - radius, x));
  const dy = y - Math.max(inset + radius, Math.min(bottom - radius, y));
  return Math.hypot(dx, dy) <= radius + .01;
}

function inspectArsenalTextSpacing(
  c: ArsenalComposition, measureText: ArsenalTextMeasurer, adjust: boolean, textFlexibilityVersion?: 1
) {
  const overrides: ArsenalComposition["overrides"] = {};
  const issues: string[] = [];
  const elements = c.elements.filter(element => element.kind === "text" && element.text.trim() && element.opacity > 0);
  const byId = new Map(elements.map(element => [element.id, element]));
  const authored = new Map(c.base.instances.map(instance => [instance.id, instance]));
  const metrics = new Map(elements.map(element => [element.id, measureArsenalElement(element, measureText)]));
  const needsLeading = new Set<string>();
  const nearWrap = new Set<string>();
  const textObstacles = horizontalTextObstacles(c);
  const paintOrder = arsenalPaintOrder(c);
  const worldOf = (element: ArsenalElement) => arsenalWorldGeometry(element, c.groups);
  const surfaces = c.elements.filter(element => element.kind === "rect" && element.opacity > 0 &&
    /^#[a-f\d]{6}$/i.test(element.fill) && !isCanvasBackdrop(c, element, worldOf, paintOrder))
    .sort((a, b) => a.width * a.height * worldOf(a).scale ** 2 - b.width * b.height * worldOf(b).scale ** 2);
  const textSurfaces = new Map<string, ArsenalElement>();
  const surfaceOverflows = new Set<string>();
  const obstaclesByText = new Map<string, typeof textObstacles>();
  const inkRects = (element: ArsenalElement, layout: ArsenalTextMeasurement): PhysicalRect[] =>
    layout.inkBoxes ?? (layout.lineInk ?? []).flatMap(line => line
      ? [{ x: 0, width: element.width, y: line.top, height: line.bottom - line.top }] : []);
  const overflowsSurface = (element: ArsenalElement, surface: ArsenalElement, offset = 0) => {
    const world = worldOf(surface);
    const origin = positionInSurface(worldOf(element), world);
    const layout = measureArsenalElement(element, measureText, true);
    const ink = inkRects(element, layout);
    const width = Math.max(0, ...layout.lines.map(line => line.width));
    const x = element.align === "right" ? element.width - width : element.align === "center" ? (element.width - width) / 2 : 0;
    const boxes = layout.inkBoxes || layout.lineInk ? ink : [{ x, width, y: 0, height: layout.height }];
    const padding = (element.stroke ? element.strokeWidth / 2 : 0) * origin.scale;
    const inset = surface.strokeWidth / 2 + lineClearance / world.scale;
    return boxes.some(box =>
      [box.x * origin.scale - padding, (box.x + box.width) * origin.scale + padding].some(x =>
        [(box.y + offset) * origin.scale - padding, (box.y + offset + box.height) * origin.scale + padding].some(y =>
          !insideSurface(surface, origin.x + x, origin.y + y, inset))));
  };
  const fontFit = (element: ArsenalElement) => {
    const fit = c.relations.find(relation => relation.enabled && relation.kind === "textFit" &&
      relation.outputs.some(output => output.targetId === element.id && output.properties.includes("fontSize")));
    if (fit?.kind !== "textFit") return;
    if (textFlexibilityVersion !== 1) return { min: fit.parameters.minFontSize, max: Infinity };
    const instance = authored.get(element.id);
    return textFontFlexibility({
      preferredFontSize: instance ? c.pieces[instance.pieceHash].fontSize : element.fontSize,
      authoredMinFontSize: fit.parameters.minFontSize,
      authored: fit.parameters.flexibility,
      artboardWidth: c.artboard.width,
      worldScale: worldOf(element).scale,
    });
  };
  const crosses = (element: ArsenalElement, ink: PhysicalRect, obstacle: typeof textObstacles[number], offset = 0) => {
    const world = arsenalWorldGeometry(element, c.groups);
    return world.x + (ink.x + ink.width) * world.scale > obstacle.left &&
      world.x + ink.x * world.scale < obstacle.right &&
      world.y + (ink.y + offset + ink.height) * world.scale > obstacle.top &&
      world.y + (ink.y + offset) * world.scale < obstacle.bottom;
  };
  const moveFrame = ({ border, surface }: NonNullable<ReturnType<typeof expandedTextFrame>>) => {
    for (const line of border) {
      overrides[line.id] = { ...c.overrides[line.id], y: surface.y, height: surface.height };
    }
  };
  if (adjust) for (const obstacle of textObstacles) {
    if (overrides[obstacle.element.id]) continue;
    const frame = expandedTextFrame(c, obstacle.element);
    if (!frame) continue;
    const surface = arsenalWorldGeometry(frame.surface, c.groups);
    const seen = new Map<string, { above: boolean; below: boolean }>();
    for (const element of elements) {
      if (!element.bindingId || !element.contentFragment) continue;
      const world = arsenalWorldGeometry(element, c.groups);
      if (Math.abs(world.rotation) > .01 || world.x >= obstacle.right || world.x + element.width * world.scale <= obstacle.left) continue;
      for (const ink of inkRects(element, metrics.get(element.id)!)) {
        const top = world.y + ink.y * world.scale;
        const bottom = top + ink.height * world.scale;
        if (top < surface.y || bottom > surface.y + frame.surface.height * surface.scale) continue;
        const previous = seen.get(element.bindingId) ?? { above: false, below: false };
        seen.set(element.bindingId, { above: previous.above || bottom <= obstacle.top, below: previous.below || top >= obstacle.bottom });
      }
    }
    if (Array.from(seen.values()).some(placement => placement.above && placement.below)) moveFrame(frame);
  }
  const stackedPairs = new Map<string, [ArsenalElement, ArsenalElement]>();
  const fragments = new Map<string, ArsenalElement[]>();
  for (const binding of c.base.bindings) {
    if (binding.kind !== "text") continue;
    const targets = binding.targetIds.flatMap(id => {
      const element = byId.get(id);
      return element?.contentFragment ? [element] : [];
    });
    fragments.set(binding.source, [...(fragments.get(binding.source) ?? []), ...targets]);
  }
  for (const targets of Array.from(fragments.values())) {
    targets.sort((a, b) => a.contentFragment!.index - b.contentFragment!.index);
    for (let index = 1; index < targets.length; index++) {
      const a = targets[index - 1], b = targets[index];
      const first = authored.get(a.id), next = authored.get(b.id);
      if (!first || !next || first.parentId !== next.parentId ||
          Math.abs(a.rotation) > .01 || Math.abs(b.rotation) > .01) continue;
      const gap = next.y - (first.y + first.height);
      if (next.y <= first.y ||
          Math.min(first.x + first.width, next.x + next.width) <= Math.max(first.x, next.x)) continue;
      stackedPairs.set(a.id + "/" + b.id, [a, b]);
      const firstSize = c.pieces[first.pieceHash].fontSize, nextSize = c.pieces[next.pieceHash].fontSize;
      if (Math.abs(gap) <= .75 && (first.height <= firstSize * 1.12 || next.height <= nextSize * 1.12)) {
        needsLeading.add(a.id);
        needsLeading.add(b.id);
      }
    }
  }
  const linesTouch = (layout: ArsenalTextMeasurement, scale: number) => {
    const lines = layout.lineInk?.filter(line => line !== null) ?? [];
    return lines.some((line, index) => index > 0 && (line.top - lines[index - 1].bottom) * scale <= lineClearance);
  };
  for (const element of elements) {
    const world = arsenalWorldGeometry(element, c.groups);
    const scale = world.scale;
    const layout = metrics.get(element.id)!;
    if (element.bindingId && layout.lines.some(line => line.width > widthWithWrapClearance(element.width) + .01)) {
      nearWrap.add(element.id);
      issues.push("overflow:wrap_clearance:" + element.id);
    }
    if (layout.lines.length > 1 && element.lineHeight <= 1.12) needsLeading.add(element.id);
    if (linesTouch(layout, scale)) {
      needsLeading.add(element.id);
      issues.push("vertical_collision:" + element.id);
    }
    const instance = authored.get(element.id);
    if (instance) {
      // Containment is inferred from the authored rectangle, before text fit
      // changes its dimensions. This leaves deliberate edge overlaps alone.
      const nominal = arsenalWorldGeometry({ ...element, ...instance }, c.groups);
      const surface = surfaces.find(background => {
        if ((paintOrder.get(background.id) ?? Infinity) >= (paintOrder.get(element.id) ?? -1)) return false;
        const frame = worldOf(background);
        if (Math.abs(frame.rotation - nominal.rotation) > .01 || Math.abs(frame.rotation - world.rotation) > .01) return false;
        const { x, y, scale } = positionInSurface(nominal, frame);
        return x >= -.01 && y >= -.01 && x + instance.width * scale <= background.width + .01 &&
          y + instance.height * scale <= background.height + .01;
      });
      if (surface) {
        textSurfaces.set(element.id, surface);
        if (overflowsSurface(element, surface)) {
          surfaceOverflows.add(element.id);
          issues.push("overflow:surface:" + element.id + "/" + surface.id);
        }
      }
    }
    if (element.bindingId && Math.abs(world.rotation) <= .01) {
      const obstacles = textObstacles.filter(({ element: stroke }) =>
        !overrides[stroke.id] &&
        !c.base.intentionalOverlaps.some(([a, b]) =>
          (a === stroke.id && (b === element.id || b === element.parentId)) ||
          (b === stroke.id && (a === element.id || a === element.parentId))) &&
        ((paintOrder.get(stroke.id) ?? 0) > (paintOrder.get(element.id) ?? 0) ||
          contrastRatio(element.fill, stroke.stroke ?? stroke.fill) < 3));
      const touches = obstacles.filter(obstacle => inkRects(element, layout).some(ink => crosses(element, ink, obstacle)));
      if (touches.length) {
        const fixable = new Set<string>();
        for (const { element: stroke } of touches) {
          const frame = adjust ? expandedTextFrame(c, stroke) : undefined;
          if (!frame) continue;
          moveFrame(frame);
          frame.border.forEach(line => fixable.add(line.id));
        }
        if (touches.some(({ element: stroke }) => !fixable.has(stroke.id)))
          obstaclesByText.set(element.id, obstacles.filter(({ element: stroke }) => !fixable.has(stroke.id)).sort((a, b) => a.top - b.top));
        issues.push(...touches.map(obstacle => "vertical_collision:" + element.id + "/" + obstacle.element.id));
      }
    }
  }
  for (const [pair, [a, b]] of Array.from(stackedPairs)) {
    if (b.y <= a.y) continue;
    const aInk = metrics.get(a.id)?.lineInk?.filter(line => line !== null);
    const bInk = metrics.get(b.id)?.lineInk?.filter(line => line !== null);
    if (!aInk?.length || !bInk?.length) continue;
    const scale = arsenalWorldGeometry(a, c.groups).scale;
    const bottom = a.y + Math.max(...aInk.map(line => line.bottom));
    const top = b.y + Math.min(...bInk.map(line => line.top));
    if (Math.min(b.y - bottom, top - (a.y + a.height), top - bottom) * scale <= lineClearance) {
      needsLeading.add(a.id);
      needsLeading.add(b.id);
      issues.push("vertical_collision:" + pair);
    }
  }
  if (adjust) for (const id of Array.from(new Set([
    ...Array.from(needsLeading), ...Array.from(nearWrap), ...Array.from(obstaclesByText.keys()), ...Array.from(surfaceOverflows),
  ]))) {
    const element = byId.get(id)!;
    const instance = authored.get(id);
    if (!instance) continue;
    const min = fontFit(element)?.min ?? element.fontSize;
    const world = arsenalWorldGeometry(element, c.groups);
    const scale = world.scale;
    const protectLeading = needsLeading.has(id);
    const lineHeight = protectLeading ? Math.max(element.lineHeight, safeLeading) : element.lineHeight;
    const inset = (lineClearance + .25) / scale;
    // Keep glyphs inside the authored row. Retain the layout's real line box
    // height for flow/anchors, and offset only for ink above the first baseline.
    const trial = (fontSize: number) => {
      const layout = measureArsenalElement({ ...element, fontSize, lineHeight }, measureText);
      const ink = layout.lineInk?.filter(line => line !== null) ?? [];
      const top = ink.length ? Math.min(...ink.map(line => line.top)) : inset;
      const bottom = ink.length ? Math.max(...ink.map(line => line.bottom)) : layout.height;
      let offset = protectLeading ? Math.max(0, inset - top) : 0;
      for (const obstacle of obstaclesByText.get(id) ?? []) {
        const affected = inkRects(element, layout).filter(ink => crosses(element, ink, obstacle, offset));
        if (affected.length)
          offset = Math.max(offset, ...affected.map(ink => (obstacle.bottom - world.y) / scale + inset - ink.y));
      }
      const height = Math.max(layout.height, protectLeading ? bottom + inset : 0) + offset;
      const surface = textSurfaces.get(id);
      return { offset, fits: height <= instance.height + .01 && !linesTouch(layout, scale) &&
        layout.lines.every(line => line.width <= widthWithWrapClearance(Math.min(element.width, instance.width))) &&
        (!surface || !overflowsSurface({ ...element, fontSize, lineHeight }, surface, offset)) };
    };
    if (min > element.fontSize) continue;
    const best = largestFittingTextFont({ min, max: element.fontSize, preferred: element.fontSize }, size => trial(size).fits, metrics.get(id)!.lines.length > 1);
    if (!best.fits) continue;
    const { offset } = trial(best.fontSize);
    if (best.fontSize !== element.fontSize || lineHeight !== element.lineHeight || offset > .01) {
      overrides[id] = {
        ...c.overrides[id], fontSize: best.fontSize, lineHeight,
        ...(offset > .01 ? { y: element.y + offset } : {}),
      };
    }
  }
  for (const binding of c.base.bindings) {
    if (binding.kind !== "text") continue;
    const byBaseSize = new Map<number, ArsenalElement[]>();
    for (const id of binding.targetIds) {
      const element = byId.get(id), instance = authored.get(id);
      if (!element?.contentFragment || !instance) continue;
      const fontSize = c.pieces[instance.pieceHash].fontSize;
      const siblings = byBaseSize.get(fontSize) ?? [];
      siblings.push(element);
      byBaseSize.set(fontSize, siblings);
    }
    for (const [baseSize, siblings] of Array.from(byBaseSize)) {
      const sizes = siblings.map(element => {
        const fitted = overrides[element.id]?.fontSize;
        return typeof fitted === "number" ? fitted : element.fontSize;
      });
      const smallest = Math.min(...sizes);
      if (smallest >= baseSize - .01 || Math.max(...sizes) - smallest <= .01) continue;
      const minimum = Math.max(smallest, ...siblings.map(element => fontFit(element)?.min ?? smallest));
      const maximum = Math.min(...siblings.map(element => fontFit(element)?.max ?? baseSize));
      if (!adjust || minimum > maximum) {
        issues.push("font_fragment_mismatch:" + siblings[0].id);
        continue;
      }
      siblings.forEach((element, index) => {
        if (Math.abs(sizes[index] - minimum) > .00001)
          overrides[element.id] = { ...c.overrides[element.id], ...overrides[element.id], fontSize: minimum };
      });
    }
  }
  return { issues, overrides, adjusted: Object.keys(overrides).length > 0 };
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
  const polygon = (e: ArsenalElement, box: PhysicalRect = {x:0,y:0,width:e.width,height:e.height}) => {
    const w = arsenalWorldGeometry(e, c.groups),
      r = (w.rotation * Math.PI) / 180;
    return [
      [box.x, box.y],
      [box.x+box.width, box.y],
      [box.x+box.width, box.y+box.height],
      [box.x, box.y+box.height],
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
  const paintOrder = arsenalPaintOrder(c);
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
  const ink = new Map<string, PhysicalRect[] | undefined>();
  for (const e of texts) {
    // Effects whose ink is not in the font metrics retain the conservative box.
    const effect=c.version===3?c.effects?.[e.id]:undefined;
    const complex=Boolean(e.extrusion||e.strokeWidth||effect||e.richText?.some(run=>run.underline));
    ink.set(e.id,complex?undefined:measureArsenalElement(e,measureText).inkBoxes);
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
      const aInk=ink.get(a.id),bInk=ink.get(b.id);
      const collides=aInk&&bInk
        ? aInk.some(x=>bInk.some(y=>intersects(polygon(a,x),polygon(b,y))))
        : intersects(polygon(a), polygon(b)) && !lineBoxAllows(a,b);
      if (collides)
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
