import { arsenalHash, readContentSource } from "@shared/arsenalContent";
import type { ComponentDefinitionV1 } from "@shared/componentAssembly";
import type { ArsenalComposition } from "@shared/designArsenal";
import {
  widthWithWrapClearance,
  type ArsenalTextMeasurer,
} from "@shared/arsenalGeometry";
import { authoredTextBoxes } from "@shared/textFieldFlexibility";

// Minimize the fullest row. Imported templates often have a short final box
// that belonged to a single word in the sample copy.
function partitionRows(words: string[], advances: number[], widths: number[]) {
  const ends = [0];
  for (const width of advances) ends.push(ends[ends.length - 1] + width);
  let previous = new Map([[0, { cost: 0, cuts: [] as number[] }]]);
  for (let row = 0; row < widths.length; row++) {
    const width = widths[row];
    const next = new Map<number, { cost: number; cuts: number[] }>();
    for (const [start, prior] of Array.from(previous)) {
      const last = words.length - (widths.length - row - 1);
      for (
        let end = row === widths.length - 1 ? words.length : start + 1;
        end <= last;
        end++
      ) {
        if (
          end < words.length &&
          /^(?:R\$|US\$|€|\$)$/.test(words[end - 1].trim()) &&
          /^\d/.test(words[end].trim())
        )
          continue;
        const cost = Math.max(prior.cost, (ends[end] - ends[start]) / width);
        if (cost < (next.get(end)?.cost ?? Infinity))
          next.set(end, { cost, cuts: [...prior.cuts, end] });
      }
    }
    previous = next;
  }
  return previous.get(words.length)?.cuts;
}

/** Fit the lines of one authored paragraph together, before the normal geometry
 * audit. Persist only splits and editor overrides so Canvas can replay the fit. */
export function fitEditorialParagraphs(
  source: ArsenalComposition,
  definition: ComponentDefinitionV1,
  measure: ArsenalTextMeasurer
) {
  let result = source;
  const centeredAxes: number[] = [];
  const flat = source.base.groups.every(
    group =>
      !group.x &&
      !group.y &&
      !group.rotation &&
      group.scale === 1 &&
      !source.overrides[group.id]
  );
  for (const binding of source.base.bindings) {
    const count = binding.targetIds.length;
    if (
      binding.kind !== "text" ||
      count < 2 ||
      count > 8 ||
      source.measuredSplits?.[binding.id]
    )
      continue;
    if (
      source.relations.some(
        r =>
          r.enabled &&
          r.kind !== "textFit" &&
          (r.inputs.some(id => binding.targetIds.includes(id)) ||
            r.outputs.some(o => binding.targetIds.includes(o.targetId)))
      )
    )
      continue;
    const text = readContentSource(source.content, binding.source);
    if (typeof text !== "string" || /[\r\n]/.test(text)) continue;
    const words = text.match(/\s*\S+\s*/g) ?? [];
    if (words.length < count || words.length > 80) continue;
    const boxes = authoredTextBoxes(definition, binding.source);
    const rows = binding.targetIds
      .flatMap(id => {
        const instance = source.base.instances.find(row => row.id === id);
        const piece = instance && source.pieces[instance.pieceHash];
        const box = boxes.find(box => box.id === id);
        if (
          !instance ||
          !piece ||
          !box ||
          piece.kind !== "text" ||
          piece.contentFragment?.count !== count ||
          piece.textFragments?.length ||
          source.richText[id]?.length ||
          Object.keys(source.overrides[id] ?? {}).length
        )
          return [];
        return [{ instance, piece, box, index: piece.contentFragment.index }];
      })
      .sort((a, b) => a.index - b.index);
    if (rows.length !== count) continue;
    const first = rows[0];
    const continuous = rows.every(({ instance, piece, index }, i) => {
      const prev = rows[Math.max(0, i - 1)].instance;
      return (
        index === i &&
        instance.parentId === first.instance.parentId &&
        !instance.rotation &&
        piece.fontFamily === first.piece.fontFamily &&
        piece.fontWeight === first.piece.fontWeight &&
        Math.abs(piece.fontSize - first.piece.fontSize) <=
          first.piece.fontSize * 0.02 &&
        piece.fill === first.piece.fill &&
        piece.align === first.piece.align &&
        piece.lineHeight === first.piece.lineHeight &&
        piece.letterSpacing === first.piece.letterSpacing &&
        (!i ||
          Math.abs(instance.y - (prev.y + prev.height)) <=
            Math.max(2, prev.height * 0.04))
      );
    });
    if (!continuous) continue;
    const axis = (fraction: number) =>
      rows.every(
        ({ instance }) =>
          Math.abs(
            instance.x +
              fraction * instance.width -
              (first.instance.x + fraction * first.instance.width)
          ) <= 2
      );
    const align = axis(0)
      ? first.piece.align
      : axis(0.5)
        ? "center"
        : axis(1)
          ? "right"
          : undefined;
    if (!align) continue;
    const metrics = (value: string, fontSize: number) =>
      measure({
        text: value,
        width: 1e6,
        fontSize,
        fontFamily: first.piece.fontFamily,
        fontStyle: String(first.piece.fontWeight),
        fill: first.piece.fill,
        lineHeight: first.piece.lineHeight,
        letterSpacing: first.piece.letterSpacing,
      });
    const preferred = Math.min(...rows.map(row => row.box.sizes.preferred));
    const floor = Math.max(...rows.map(row => row.box.sizes.min));
    const left = Math.min(...rows.map(row => row.instance.x));
    const right = Math.max(
      ...rows.map(row => row.instance.x + row.instance.width)
    );
    const top = first.instance.y;
    const last = rows[count - 1].instance;
    const bottom = last.y + last.height;
    // Imported text rows are cropped to the original words. Use the whole
    // column only when its envelope is clear of other foreground content.
    const clearColumn =
      flat &&
      !source.base.instances.some(item => {
        if (binding.targetIds.includes(item.id)) return false;
        const radians = (item.rotation * Math.PI) / 180;
        const dx = item.width * Math.cos(radians),
          dy = item.width * Math.sin(radians);
        const hx = -item.height * Math.sin(radians),
          hy = item.height * Math.cos(radians);
        const x0 = item.x + Math.min(0, dx) + Math.min(0, hx);
        const x1 = item.x + Math.max(0, dx) + Math.max(0, hx);
        const y0 = item.y + Math.min(0, dy) + Math.min(0, hy);
        const y1 = item.y + Math.max(0, dy) + Math.max(0, hy);
        if (x1 <= left || x0 >= right || y1 <= top || y0 >= bottom)
          return false;
        const background =
          !item.rotation &&
          source.pieces[item.pieceHash]?.kind !== "text" &&
          x0 <= left &&
          x1 >= right &&
          y0 <= top &&
          y1 >= bottom;
        return !background;
      });
    const widths = rows.map(row =>
      widthWithWrapClearance(clearColumn ? right - left : row.box.width)
    );
    const cuts = partitionRows(
      words,
      words.map(word => metrics(word, preferred).lines[0].width),
      widths
    );
    if (!cuts) continue;
    const lines = cuts.map((end, i) =>
      words.slice(cuts[i - 1] ?? 0, end).join("")
    );
    // Integer steps avoid persisting subpixel wrap thresholds across renderers.
    let fontSize = preferred;
    const fits = (size: number) =>
      lines.every((line, i) => {
        const layout = metrics(line, size);
        return (
          layout.height <= rows[i].box.height + 0.01 &&
          layout.lines[0].width <= widths[i]
        );
      });
    if (!fits(fontSize)) {
      let low = Math.ceil(floor),
        high = Math.floor(preferred);
      if (low > high || !fits(low)) continue;
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (fits(mid)) low = mid;
        else high = mid - 1;
      }
      fontSize = low;
    }
    if (result === source)
      result = {
        ...source,
        overrides: { ...source.overrides },
        measuredSplits: { ...source.measuredSplits },
      };
    const breaks = cuts.slice(0, -1);
    result.measuredSplits![binding.id] = {
      textHash: arsenalHash(text),
      ...(count === 2 ? { afterWord: breaks[0] } : { afterWords: breaks }),
    };
    let y = first.instance.y;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      result.overrides[row.instance.id] = {
        fontSize,
        y,
        align,
        ...(clearColumn
          ? { x: left, width: right - left, adaptiveTextFitVersion: 2 }
          : {}),
      };
      y += metrics(lines[i], fontSize).height;
    }
    if (flat && !axis(0) && align === "center")
      centeredAxes.push((left + right) / 2);
  }
  // A centered paragraph establishes the axis for a centered single box such
  // as a title. A wrap inside that box must share the same axis on every row.
  if (centeredAxes.length) {
    for (const binding of source.base.bindings) {
      if (binding.kind !== "text" || binding.targetIds.length !== 1) continue;
      const instance = source.base.instances.find(
        row => row.id === binding.targetIds[0]
      );
      if (
        !instance ||
        instance.rotation ||
        source.overrides[instance.id] ||
        source.pieces[instance.pieceHash]?.align !== "left"
      )
        continue;
      if (
        centeredAxes.some(
          axis => Math.abs(instance.x + instance.width / 2 - axis) <= 2
        )
      )
        result.overrides[instance.id] = { align: "center" };
    }
  }
  return result;
}
