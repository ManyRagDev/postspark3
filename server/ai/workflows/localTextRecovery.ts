import { arsenalHash, readContentSource } from "@shared/arsenalContent";
import { completeDesignFields } from "@shared/completeDesignGeneration";
import type { ComponentDefinitionV1 } from "@shared/componentAssembly";
import type { ArsenalComposition, ArsenalElement } from "@shared/designArsenal";
import { arsenalWorldGeometry, measureArsenalElement, widthWithWrapClearance, type ArsenalTextMeasurer } from "@shared/arsenalGeometry";
import type { TechnicalFinding } from "@shared/generationContracts";
import type { CopyResponse } from "./proposalGraph";

const affectedIds = (findings: TechnicalFinding[]) =>
  new Set(
    findings
      .filter(f => f.rule === "overflow" || f.rule === "collision" || f.rule === "vertical_collision")
      .flatMap(f => f.target.slice(f.target.indexOf(":") + 1).split("/"))
  );

/** Retain canonical content. A split only applies to the exact text measured. */
export function measuredWordSplits(
  scene: ArsenalComposition,
  findings: TechnicalFinding[],
  measure: ArsenalTextMeasurer,
  protectSpacing = false,
  hardBreakBindings?: ReadonlySet<string>,
) {
  const affected = affectedIds(findings);
  const splits = { ...scene.measuredSplits };
  let changed = false;
  for (const binding of scene.base.bindings) {
    const count = binding.targetIds.length;
    if (
      binding.kind !== "text" ||
      (protectSpacing ? count < 2 || count > 8 : count !== 2) ||
      !binding.targetIds.some(id => affected.has(id))
    )
      continue;
    const text = readContentSource(scene.content, binding.source);
    if (typeof text !== "string" || (/[\r\n]/.test(text) && !(protectSpacing && hardBreakBindings?.has(binding.id)))) continue;
    const words = text.match(/\s*\S+\s*/g) ?? [];
    if (words.length < count) continue;
    const boxes = binding.targetIds
      .map(id => scene.elements.find(e => e.id === id))
      .sort(
        (a, b) =>
          (a?.contentFragment?.index ?? 0) - (b?.contentFragment?.index ?? 0)
      );
    if (
      !boxes.every(
        e =>
          e?.contentFragment?.count === count &&
          !e.richText?.length &&
          !e.textFragments?.length
      )
    )
      continue;
    if (protectSpacing) {
      const cuts = findFittingWordPartition(scene, boxes as ArsenalElement[], words, measure);
      if (!cuts) continue;
      const parts = [0, ...cuts, words.length];
      if (boxes.every((box, index) => box!.text === words.slice(parts[index], parts[index + 1]).join(""))) continue;
      splits[binding.id] = { textHash: arsenalHash(text), ...(cuts.length === 1 ? { afterWord: cuts[0] } : { afterWords: cuts }) };
      changed = true;
      continue;
    }
    const ratio = (part: string, index: number) => {
      const e = boxes[index]!;
      const line = measure({
        text: part.trim(),
        width: 1e6,
        fontSize: e.fontSize,
        fontFamily: e.fontFamily,
        fontStyle: String(e.fontWeight),
        fill: e.fill,
        letterSpacing: e.letterSpacing,
      });
      return Math.max(...line.lines.map(l => l.width), 0) / e.width;
    };
    // Left occupancy increases, right occupancy decreases. Compare both sides of the crossing.
    const widths = (cut: number) => [
      ratio(words.slice(0, cut).join(""), 0),
      ratio(words.slice(cut).join(""), 1),
    ];
    let low = 1,
      high = words.length - 1;
    while (low < high) {
      const middle = Math.floor((low + high) / 2),
        [left, right] = widths(middle);
      if (left < right) low = middle + 1;
      else high = middle;
    }
    const cut =
      low > 1 && Math.max(...widths(low - 1)) < Math.max(...widths(low))
        ? low - 1
        : low;
    if (words.slice(0, cut).join("") === boxes[0]!.text) continue;
    splits[binding.id] = { textHash: arsenalHash(text), afterWord: cut };
    changed = true;
  }
  return changed ? splits : undefined;
}

function findFittingWordPartition(scene: ArsenalComposition, boxes: ArsenalElement[], words: string[], measure: ArsenalTextMeasurer) {
  if (words.length > 80) return;
  const limits = boxes.map(box => {
    const base = scene.base.instances.find(instance => instance.id === box.id)!;
    const fit = scene.relations.find(relation => relation.enabled && relation.kind === "textFit" &&
      relation.outputs.some(output => output.targetId === box.id && output.properties.includes("fontSize")));
    return {
      ...box,
      width: widthWithWrapClearance(Math.min(base.width, box.width)),
      height: base.height,
      fontSize: fit?.kind === "textFit" ? Math.min(fit.parameters.minFontSize, box.fontSize) : box.fontSize,
    };
  });
  const rowTops = boxes.map(box => arsenalWorldGeometry(box, scene.groups).y);
  const seen = new Set<string>();
  const split = (index: number, start: number): number[] | undefined => {
    if (index === boxes.length) return start === words.length ? [] : undefined;
    const key = index + ":" + start;
    if (seen.has(key)) return;
    seen.add(key);
    const box = limits[index];
    const last = words.length - (boxes.length - index - 1);
    const first = index === boxes.length - 1 ? last : start + 1;
    // Try longest fitting spans first, leaving at least one word per box.
    for (let end = last; end >= first; end--) {
      if (end < words.length && /^(?:R\$|US\$|€|\$)$/.test(words[end - 1].trim()) && /^\d/.test(words[end].trim())) continue;
      if (end < words.length && /[\r\n]/.test(words[end - 1]) && rowTops[index + 1] <= rowTops[index]) continue;
      const layout = measureArsenalElement({ ...box, text: words.slice(start, end).join("").trim() }, measure);
      if (layout.height > box.height + .01 || layout.lines.some(line => line.width > box.width + .01)) continue;
      const rest = split(index + 1, end);
      if (rest) return end === words.length ? [] : [end, ...rest];
    }
  };
  return split(0, 0);
}

const navigationLabel =
  /^(?:você|dados|filtro|canal|próximo|anterior|agora|arraste|continue|saiba mais)$/i;
const pageIndexTarget =
  /^(?:indice|índice|page[-_]?(?:index|number)|slide[-_]?(?:index|number))$/i;

/** Only consider authored navigation or redundant optional labels. Caller verifies
 * literal requirements, layout and editorial review before delivering the copy. */
export function repairLayoutLabels(
  copy: CopyResponse,
  definitions: ComponentDefinitionV1[],
  findings: TechnicalFinding[],
  nativeGlyphProjection: 1 | undefined,
  accepts: (candidate: CopyResponse) => boolean
) {
  const candidate = structuredClone(copy);
  let changed = false;
  for (const [index, slide] of Array.from(candidate.slides.entries())) {
    const def = definitions[index];
    const issues = affectedIds(
      findings.filter(f => f.target.startsWith(`slide-${index + 1}:`))
    );
    for (const field of completeDesignFields(def, nativeGlyphProjection)) {
      if (field.kind !== "text" || field.role !== "label") continue;
      const bindings = def.fragment.bindings.filter(
        b => b.source === field.source
      );
      const ids = bindings.flatMap(b => b.targetIds);
      const row = slide.values.find(v => v.fieldId === field.id);
      if (
        !row ||
        typeof row.value !== "string" ||
        !row.value.trim() ||
        !ids.length
      )
        continue;
      const previous = row.value;
      const structural =
        definitions.length > 1 && ids.every(id => pageIndexTarget.test(id));
      if (structural) row.value = String(index + 1).padStart(2, "0");
      else {
        if (
          field.required ||
          bindings.some(b => b.required) ||
          !ids.some(id => issues.has(id)) ||
          def.completeDesign?.designGuidance?.requiredTextTargets?.some(id =>
            ids.includes(id)
          )
        )
          continue;
        const otherText = slide.values
          .filter(v => v !== row)
          .flatMap(v => v.value)
          .join(" ")
          .toLocaleLowerCase("pt-BR");
        const needle = previous.trim().toLocaleLowerCase("pt-BR");
        const duplicated = (
          " " +
          otherText.replace(new RegExp("[^\\p{L}\\p{M}\\p{N}]+", "gu"), " ") +
          " "
        ).includes(" " + needle + " ");
        if (
          !otherText.trim() ||
          (!duplicated && !navigationLabel.test(previous.trim()))
        )
          continue;
        row.value = "";
      }
      if (previous === row.value) continue;
      if (!accepts(candidate)) row.value = previous;
      else changed = true;
    }
  }
  return changed ? candidate : undefined;
}
