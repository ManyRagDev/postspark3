export interface VariationDiversityInput {
  headline?: string;
  body?: string;
  callToAction?: string;
  caption?: string;
  tone?: string;
  layout?: string;
  backgroundColor?: string;
  textColor?: string;
  accentColor?: string;
}

export function normalizeVariationText(value: string | undefined): string {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeVariationText(value: string | undefined): string[] {
  return normalizeVariationText(value)
    .split(" ")
    .filter((token) => token.length > 2);
}

export function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;

  const aSet = new Set(a);
  const bSet = new Set(b);
  let intersection = 0;

  for (const token of Array.from(aSet)) {
    if (bSet.has(token)) intersection += 1;
  }

  const union = new Set([...Array.from(aSet), ...Array.from(bSet)]).size;
  return union === 0 ? 0 : intersection / union;
}

export function variationsNeedDiversification(
  variations: VariationDiversityInput[],
): boolean {
  if (variations.length < 3) return true;

  for (let i = 0; i < variations.length; i++) {
    for (let j = i + 1; j < variations.length; j++) {
      const a = variations[i];
      const b = variations[j];
      const aText = tokenizeVariationText(
        `${a.headline} ${a.body} ${a.callToAction} ${a.caption}`,
      );
      const bText = tokenizeVariationText(
        `${b.headline} ${b.body} ${b.callToAction} ${b.caption}`,
      );
      const copySimilarity = jaccardSimilarity(aText, bText);

      const sameHeadline =
        normalizeVariationText(a.headline) === normalizeVariationText(b.headline);
      const sameBody =
        normalizeVariationText(a.body) === normalizeVariationText(b.body);
      const sameTone =
        normalizeVariationText(a.tone) === normalizeVariationText(b.tone);
      const sameLayout = a.layout === b.layout;
      const sameColors =
        a.backgroundColor === b.backgroundColor &&
        a.textColor === b.textColor &&
        a.accentColor === b.accentColor;

      if (
        sameHeadline ||
        (sameBody && sameLayout) ||
        (copySimilarity >= 0.78 && sameLayout) ||
        (copySimilarity >= 0.9 && sameColors) ||
        (sameTone && sameLayout && sameColors)
      ) {
        return true;
      }
    }
  }

  return false;
}
