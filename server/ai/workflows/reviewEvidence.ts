import { arsenalHash } from "@shared/arsenalContent";
import type { ArsenalComposition } from "@shared/designArsenal";
import type { ReviewEvidenceAnchorV1 } from "@shared/proposalReview";
import type { ReviewCopy } from "./proposalReview";
/** Exact visible slices only. Hidden siblings never lend the rest of their field. */
export function reviewEvidenceAnchors(
  copy: ReviewCopy,
  compositions: ArsenalComposition[]
): ReviewEvidenceAnchorV1[] {
  const anchors = new Map<string, ReviewEvidenceAnchorV1>();
  compositions.forEach((scene, slideIndex) => {
    for (const element of scene.elements) {
      if (
        element.kind !== "text" ||
        element.opacity <= 0 ||
        element.width <= 0 ||
        element.height <= 0 ||
        !element.text ||
        !element.bindingId
      )
        continue;
      let parent = element.parentId;
      const seen = new Set<string>();
      while (parent) {
        if (seen.has(parent)) break;
        seen.add(parent);
        const group = scene.groups.find(g => g.id === parent);
        if (!group || group.opacity <= 0) break;
        parent = group.parentId;
      }
      if (parent) continue;
      const binding = scene.base.bindings.find(b => b.id === element.bindingId);
      const match = binding?.source.match(/^content:(.+):(text|items)$/);
      if (!match) continue;
      const row = copy.slides[slideIndex]?.values.find(
        v => v.fieldId === match[1]
      );
      if (
        !row ||
        (Array.isArray(row.value) ? match[2] !== "items" : match[2] !== "text")
      )
        continue;
      const block = scene.content.schemaVersion === 3 ? scene.content.blocks.find(b => b.id === row.fieldId) : undefined;
      const itemIndex =
        Array.isArray(row.value) && block?.type === "list"
          ? block.items.findIndex(item => item.id === element.itemId)
          : null;
      if (Array.isArray(row.value)) {
        if (
          itemIndex === null ||
          itemIndex < 0 ||
          !element.itemId ||
          !binding!.targetIds.some(
            target =>
              element.id === target ||
              element.id ===
                `${target}~${arsenalHash(element.itemId).slice(0, 16)}`
          )
        )
          continue;
      } else if (!binding!.targetIds.includes(element.id)) continue;
      const values = Array.isArray(row.value) ? row.value : [row.value];
      let visible = element.text;
      if (binding!.prefix && visible.startsWith(binding!.prefix))
        visible = visible.slice(binding!.prefix.length);
      values.forEach((value, index) => {
        if (itemIndex !== null && index !== itemIndex) return;
        const offset = value.indexOf(visible);
        if (!visible.trim() || offset < 0) return;
        for (let start = offset; start < offset + visible.length; ) {
          let end = Math.min(start + 500, offset + visible.length);
          // UTF-16 offsets with no surrogate pair cut.
          if (
            end < value.length &&
            /[\uD800-\uDBFF]/.test(value[end - 1]) &&
            /[\uDC00-\uDFFF]/.test(value[end])
          )
            end--;
          const quote = value.slice(start, end);
          if (quote.trim()) {
            const data = {
              slideIndex,
              fieldId: row.fieldId,
              itemIndex: Array.isArray(row.value) ? index : null,
              start,
              end,
              quote,
              textHash: arsenalHash(quote),
            };
            const anchorId = arsenalHash(data);
            anchors.set(anchorId, { anchorId, ...data });
          }
          start = end;
        }
      });
    }
  });
  return Array.from(anchors.values());
}
export function resolveReviewEvidence(
  ids: string[],
  anchors: ReviewEvidenceAnchorV1[]
) {
  if (new Set(ids).size !== ids.length)
    throw new Error("proposal_review_duplicate_evidence_reference");
  return ids.map(id => {
    const anchor = anchors.find(a => a.anchorId === id);
    if (!anchor) throw new Error("proposal_review_unknown_evidence_reference");
    return {
      slideIndex: anchor.slideIndex,
      fieldId: anchor.fieldId,
      quote: anchor.quote,
    };
  });
}

export type ReviewEvidenceAliasInventory = {
  alias: string;
  anchorId: string;
  slideIndex: number;
  fieldId: string;
  itemIndex: number | null;
  start: number;
  end: number;
  quote: string;
  textHash: string;
};

export function buildReviewEvidenceAliases(anchors: ReviewEvidenceAnchorV1[]): {
  inventory: ReviewEvidenceAliasInventory[];
  aliasMap: Record<string, string>;
  anchorMap: Record<string, string>;
  promptInventory: Array<{
    alias: string;
    slideIndex: number;
    fieldId: string;
    itemIndex: number | null;
    start: number;
    end: number;
    quote: string;
  }>;
} {
  const sorted = [...anchors].sort((a, b) => {
    if (a.slideIndex !== b.slideIndex) return a.slideIndex - b.slideIndex;
    if (a.fieldId !== b.fieldId) return a.fieldId.localeCompare(b.fieldId, "en");
    const itemA = a.itemIndex ?? -1;
    const itemB = b.itemIndex ?? -1;
    if (itemA !== itemB) return itemA - itemB;
    if (a.start !== b.start) return a.start - b.start;
    if (a.end !== b.end) return a.end - b.end;
    return a.anchorId.localeCompare(b.anchorId, "en");
  });

  const inventory: ReviewEvidenceAliasInventory[] = [];
  const aliasMap: Record<string, string> = {};
  const anchorMap: Record<string, string> = {};
  const promptInventory: Array<{
    alias: string;
    slideIndex: number;
    fieldId: string;
    itemIndex: number | null;
    start: number;
    end: number;
    quote: string;
  }> = [];

  sorted.forEach((anchor, index) => {
    const alias = `e${index + 1}`;
    aliasMap[alias] = anchor.anchorId;
    anchorMap[anchor.anchorId] = alias;
    inventory.push({
      alias,
      anchorId: anchor.anchorId,
      slideIndex: anchor.slideIndex,
      fieldId: anchor.fieldId,
      itemIndex: anchor.itemIndex,
      start: anchor.start,
      end: anchor.end,
      quote: anchor.quote,
      textHash: anchor.textHash,
    });
    promptInventory.push({
      alias,
      slideIndex: anchor.slideIndex,
      fieldId: anchor.fieldId,
      itemIndex: anchor.itemIndex,
      start: anchor.start,
      end: anchor.end,
      quote: anchor.quote,
    });
  });

  return { inventory, aliasMap, anchorMap, promptInventory };
}

export function resolveReviewEvidenceV6(
  aliases: string[],
  aliasMap: Record<string, string>,
  anchors: ReviewEvidenceAnchorV1[]
) {
  if (new Set(aliases).size !== aliases.length)
    throw new Error("proposal_review_duplicate_evidence_reference");
  return aliases.map(alias => {
    const anchorId = aliasMap[alias];
    if (!anchorId) throw new Error("proposal_review_unknown_evidence_reference");
    const anchor = anchors.find(a => a.anchorId === anchorId);
    if (!anchor) throw new Error("proposal_review_unknown_evidence_reference");
    return {
      slideIndex: anchor.slideIndex,
      fieldId: anchor.fieldId,
      quote: anchor.quote,
    };
  });
}
