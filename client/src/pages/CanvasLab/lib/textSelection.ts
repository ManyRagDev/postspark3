export interface TextRange {
  start: number;
  end: number;
}

/** Seleciona a palavra sob o cursor sem dividir pares substitutos/emoji. */
export function wordRangeAt(text: string, requestedIndex: number): TextRange {
  const index = Math.max(0, Math.min(requestedIndex, text.length));
  if (!text) return { start: 0, end: 0 };
  if (index < text.length && /\s/.test(text[index])) return { start: index, end: index };

  if (typeof Intl.Segmenter === "function") {
    const segments = Array.from(new Intl.Segmenter("pt-BR", { granularity: "word" }).segment(text));
    const word = segments.find(segment =>
      segment.isWordLike && index >= segment.index && index < segment.index + segment.segment.length
    ) ?? segments.find(segment =>
      segment.isWordLike && segment.index + segment.segment.length === index
    );
    if (word) return { start: word.index, end: word.index + word.segment.length };
  }

  const words = Array.from(text.matchAll(/[A-Za-zÀ-ÖØ-öø-ÿ0-9_]+/g));
  const match = words.find(candidate => {
    const start = candidate.index ?? 0;
    return index >= start && index <= start + candidate[0].length;
  });
  return match
    ? { start: match.index ?? 0, end: (match.index ?? 0) + match[0].length }
    : { start: index, end: index };
}
