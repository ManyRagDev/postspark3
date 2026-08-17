import type { PostVariation } from "./postspark";

export const STATIC_SECTION_TARGET = 3;
export const STATIC_SECTION_LABEL_MAX_LENGTH = 24;
export const STATIC_SECTION_DESCRIPTION_MAX_LENGTH = 36;

export function hasRequiredCopy(variation: Partial<PostVariation>): boolean {
  // Famílias headline-only escondem o body do VISUAL via
  // `ornaments.body: "hide"` (shared/creative/compose.ts) — o texto continua
  // presente, só relocado para `creativeDirection.hiddenOrnaments.body`. Um
  // body vazio nesse caso não é copy faltando, é supressão deliberada.
  const hasBody = Boolean(
    variation.body?.trim() || variation.creativeDirection?.hiddenOrnaments?.body?.trim(),
  );
  return Boolean(
    variation.headline?.trim() &&
      hasBody &&
      variation.caption?.trim() &&
      variation.callToAction?.trim() &&
      variation.imagePrompt?.trim(),
  );
}

export function advertisedItemCounts(text: string | undefined): number[] {
  if (!text) return [];
  const normalized = text.toLowerCase();
  const counts = new Set<number>();
  const itemWords = "(dicas|criterios|crit.rios|perguntas|passos|sinais|motivos|erros|formas|maneiras|itens|pontos|topicos|t.picos|metricas|m.tricas)";
  const explicitPattern = new RegExp(`\\b([2-9]|1[0-9]|20)\\s+${itemWords}\\b`, "gi");
  let match: RegExpExecArray | null;
  while ((match = explicitPattern.exec(normalized))) {
    counts.add(Number(match[1]));
  }

  const danglingCountPattern = /[:\-\u2013\u2014]\s*([2-9]|1[0-9]|20)\s*(?:\.{2,}|\u2026)?\s*$/g;
  while ((match = danglingCountPattern.exec(normalized))) {
    counts.add(Number(match[1]));
  }

  return Array.from(counts);
}

export function hasCoherentStaticItemCount(
  variation: Partial<PostVariation>,
): boolean {
  if (!variation.template || variation.template === "simple") return true;
  const counts = advertisedItemCounts(variation.headline);
  return counts.length === 0 || counts.every((count) => count === STATIC_SECTION_TARGET);
}

export function hasValidStaticSections(
  variation: Partial<PostVariation>,
): boolean {
  const sections = variation.sections ?? [];

  if (!variation.template || variation.template === "simple") {
    return sections.length === 0;
  }

  return (
    sections.length === STATIC_SECTION_TARGET &&
    sections.every(
      (section) =>
        Boolean(section.label?.trim()) &&
        section.label.trim().length <= STATIC_SECTION_LABEL_MAX_LENGTH &&
        (section.description?.trim().length ?? 0) <=
          STATIC_SECTION_DESCRIPTION_MAX_LENGTH,
    )
  );
}

export function applyDeterministicCopyGuards<T extends Record<string, any>>(variation: T): T {
  const next: Record<string, any> = { ...variation };
  if (typeof next.headline === "string") {
    let headline = next.headline
      .slice(0, 60)
      .trim()
      .replace(/(?:\.{2,}|\u2026)+$/, "")
      .trim();
    if (next.template && next.template !== "simple") {
      headline = headline.replace(/[:\-\u2013\u2014]\s*([2-9]|1[0-9]|20)\s*$/, "").trim();
    }
    headline = headline.replace(/[:\-\u2013\u2014]\s*$/, "").trim();
    next.headline = headline;
  }
  if (typeof next.body === "string") next.body = next.body.slice(0, 140).trim();
  if (typeof next.caption === "string") {
    next.caption = next.caption.slice(0, 1500).trim();
  }
  if (typeof next.callToAction === "string") next.callToAction = next.callToAction.slice(0, 40).trim();
  if (Array.isArray(next.hashtags)) {
    next.hashtags = next.hashtags
      .filter((item: unknown): item is string => typeof item === "string" && item.trim().startsWith("#"))
      .map((item: string) => item.trim())
      .slice(0, 4);
  }
  return next as T;
}
