import type { EditorialContext } from "./editorialContextV8";

/** Lossless text projection. Distinct origins keep distinct source IDs even
 * when their text shares storage. Recomputable source digests stay in the
 * authoritative receipt rather than consuming the provider's input budget. */
export function compactSelectionContextV1(context: EditorialContext) {
  const texts: Record<string, string> = {};
  const refs = new Map<string, { textId: string; start: number; end: number }>();
  for (const source of [...context.sources].sort((a, b) => b.text.length - a.text.length || a.id.localeCompare(b.id))) {
    const match = Object.entries(texts).find(([, text]) => text.includes(source.text));
    const [textId, text] = match ?? [`t${Object.keys(texts).length + 1}`, source.text];
    texts[textId] = text;
    const start = text.indexOf(source.text);
    refs.set(source.id, { textId, start, end: start + source.text.length });
  }
  return {
    ...context,
    sourceTextEncoding: "Resolve each source.textRef by slicing sourceTexts[textId] from start to end (UTF-16). Original source IDs, origins, guidance ranges and their meaning remain distinct. All original source ranges refer to that expanded source text. The context hash identifies the expanded authoritative context.",
    sourceTexts: texts,
    sources: context.sources.map(({ text: _text, hash: _hash, canonicalHash: _canonicalHash, ...source }) => ({ ...source, textRef: refs.get(source.id)! })),
  };
}
