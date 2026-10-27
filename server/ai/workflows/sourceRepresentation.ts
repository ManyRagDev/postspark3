import { arsenalHash } from "@shared/arsenalContent";
export const SOURCE_REPRESENTATION_VERSION = 1 as const;
export interface SourceRepresentation {
  version: 1;
  originalHash: string;
  text: string;
  spans: Array<{ start: number; end: number }>;
}
/** Only paired, standalone bold markup, never arbitrary asterisks/formulas. */
export function sourceRepresentation(original: string): SourceRepresentation {
  const ignored = new Set<number>();
  const emphasis: Array<{ start: number; end: number }> = [];
  for (const m of Array.from(
    original.matchAll(
      new RegExp("(?<![\\w*])\\*\\*([^*\\n]+)\\*\\*(?![\\w*])", "gu")
    )
  )) {
    if (!new RegExp("\\p{L}", "u").test(m[1]) || m[1].trim() !== m[1]) continue;
    emphasis.push({ start: m.index!, end: m.index! + m[0].length });
    for (const n of [
      m.index!,
      m.index! + 1,
      m.index! + m[0].length - 2,
      m.index! + m[0].length - 1,
    ])
      ignored.add(n);
  }
  const segments = new Intl.Segmenter("und", { granularity: "grapheme" });
  let text = "";
  const spans: SourceRepresentation["spans"] = [];
  for (const segment of Array.from(segments.segment(original))) {
    const start = segment.index,
      end = start + segment.segment.length;
    if ([...Array(end - start)].every((_, i) => ignored.has(start + i)))
      continue;
    const originStart =
      emphasis.find(r => r.start + 2 === start)?.start ?? start;
    const originEnd = emphasis.find(r => r.end - 2 === end)?.end ?? end;
    const value = segment.segment.normalize("NFC");
    if (/^\s+$/.test(value)) {
      if (text.endsWith(" ")) {
        spans[spans.length - 1].end = end;
        continue;
      }
      text += " ";
      spans.push({ start: originStart, end: originEnd });
    } else {
      text += value;
      for (let i = 0; i < value.length; i++)
        spans.push({ start: originStart, end: originEnd });
    }
  }
  return { version: 1, originalHash: arsenalHash(original), text, spans };
}
export function resolveSourceQuote(original: string, quote: string) {
  const rep = sourceRepresentation(original),
    needle = sourceRepresentation(quote).text.trim();
  if (!needle) return [];
  const matches: Array<{ start: number; end: number; original: string }> = [];
  for (let from = 0; from <= rep.text.length; ) {
    const i = rep.text.indexOf(needle, from);
    if (i < 0) break;
    const start = rep.spans[i].start,
      end = rep.spans[i + needle.length - 1].end;
    matches.push({ start, end, original: original.slice(start, end) });
    from = i + needle.length;
  }
  return matches;
}
