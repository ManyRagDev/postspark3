import { arsenalHash } from "@shared/arsenalContent";
import type { ReviewSourceEvidenceV10 } from "@shared/proposalReviewV10";
import type { EditorialContextV3 } from "./editorialContextV9";
import { resolvedEditorialContext } from "./editorialContextV8";
import { reviewTextUnitsV7 } from "./proposalReviewPolicy";

/** Unit identity follows its native address, not its wording or array traversal order. */
export function reviewTextUnitsV10(
  ...args: Parameters<typeof reviewTextUnitsV7>
) {
  return reviewTextUnitsV7(...args).map(u => ({
    ...u,
    id: `u_${arsenalHash([u.scope, u.slideIndex, u.fieldId, u.itemIndex]).slice(0, 20)}`,
  }));
}

/** Segment only at known type boundaries and paragraphs. Source bytes/UTF-16 ranges
 * are retained by code; the reviewer only selects evidence IDs. No semantic classifier. */
export function buildSourceEvidenceV10(
  context: EditorialContextV3
): ReviewSourceEvidenceV10[] {
  const inventory: ReviewSourceEvidenceV10[] = [];
  for (const source of context.sources) {
    const guidance = context.guidanceRanges.filter(
      r => r.sourceId === source.id
    );
    const boundaries = new Set([
      0,
      source.text.length,
      ...guidance.flatMap(r => [r.start, r.end]),
    ]);
    for (const m of Array.from(source.text.matchAll(/\n\s*\n/g)))
      boundaries.add(m.index! + m[0].length);
    const sorted = Array.from(boundaries).sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      let start = sorted[i - 1];
      while (start < sorted[i]) {
        let end = Math.min(sorted[i], start + 4000);
        // Never bisect a surrogate pair at the size boundary.
        if (end < sorted[i] && /[\uD800-\uDBFF]/.test(source.text[end - 1]))
          end--;
        const text = source.text.slice(start, end);
        if (text.trim()) {
          const kind =
            guidance.some(r => start < r.end && end > r.start) ||
            source.origin.startsWith("piece_")
              ? "guidance"
              : source.origin === "requirement"
                ? "requirement"
                : "content";
          const evidence = {
            sourceId: source.id,
            origin: source.origin,
            kind,
            start,
            end,
            text,
          } as const;
          inventory.push({
            id: `ev_${arsenalHash(evidence).slice(0, 24)}`,
            ...evidence,
          });
        }
        start = end;
      }
    }
  }
  return inventory;
}

/** Provider-facing view: no source offsets to calculate and no duplicate raw inventory. */
export function reviewContextV10(
  context: EditorialContextV3,
  evidence: ReviewSourceEvidenceV10[]
) {
  const { sources: _sources, ...resolved } = resolvedEditorialContext(context);
  return {
    ...resolved,
    version: 4,
    sourceEvidence: evidence.map(({ start: _start, end: _end, ...e }) => e),
  };
}
