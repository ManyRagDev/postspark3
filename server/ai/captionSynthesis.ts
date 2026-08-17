import type { Platform, PostVariation } from "@shared/postspark";
import { PLATFORM_SPECS } from "@shared/postspark";

/**
 * Caption Synthesis — caminho produtivo (SPEC-003/005).
 *
 * As captions vêm da chamada principal do orquestrador; este módulo fornece
 * apenas o fallback DETERMINÍSTICO (sem LLM) usado quando a caption é curta
 * ou ausente, garantindo coerência estrutural com o conteúdo visual. O
 * caminho LLM (`caption_synthesis`) foi removido na SPEC-005 — não existe
 * mais síntese tardia no caminho síncrono.
 */

interface SlideLike {
  headline?: string;
  body?: string;
}

interface SectionLike {
  label?: string;
  description?: string;
}

/**
 * Extrai o conteúdo visual real do post (slides, seções ou headline+body)
 * para servir como fonte obrigatória na geração da legenda.
 */
export function extractVisualContent(
  variation: Partial<PostVariation>,
): { text: string; source: "slides" | "sections" | "headline_body" } {
  const slides = (variation.slides ?? []) as SlideLike[];
  if (slides.length > 0) {
    const text = slides
      .map((slide, index) => {
        const headline = slide.headline?.trim() ?? "";
        const body = slide.body?.trim() ?? "";
        return `Slide ${index + 1}: ${headline}${body ? ` — ${body}` : ""}`;
      })
      .join("\n");
    return { text, source: "slides" };
  }

  const sections = (variation.sections ?? []) as SectionLike[];
  if (sections.length > 0) {
    const text = sections
      .map((section, index) => {
        const label = section.label?.trim() ?? "";
        const description = section.description?.trim() ?? "";
        return `Item ${index + 1}: ${label}${description ? ` — ${description}` : ""}`;
      })
      .join("\n");
    return { text, source: "sections" };
  }

  const headline = variation.headline?.trim() ?? "";
  const body = variation.body?.trim() ?? "";
  return {
    text: `${headline}${body ? ` — ${body}` : ""}`,
    source: "headline_body",
  };
}

/**
 * SPEC-003 — Síntese determinística de legenda (fallback marcado).
 *
 * Usada quando a chamada principal não produz caption. Monta a legenda a
 * partir do conteúdo visual real (slides/seções/headline+body) garantindo
 * coerência estrutural de item count — sem chamada LLM.
 */
export function synthesizeCaptionDeterministic(
  variation: Partial<PostVariation>,
  platform: Platform,
): string {
  const { source } = extractVisualContent(variation);
  const maxChars = PLATFORM_SPECS[platform].maxChars;
  const headline = variation.headline?.trim() ?? "";
  const body = variation.body?.trim() ?? "";
  const callToAction = variation.callToAction?.trim() ?? "";

  const paragraphs: string[] = [];
  if (headline) paragraphs.push(`${headline}.`);

  if (source === "slides") {
    const slides = (variation.slides ?? []) as SlideLike[];
    const items = slides
      .map((slide, index) => {
        const slideHeadline = slide.headline?.trim() ?? "";
        const slideBody = slide.body?.trim() ?? "";
        return `\u2794 ${slideHeadline}${slideBody ? `: ${slideBody}` : ""}`;
      })
      .join("\n");
    paragraphs.push(
      `Neste carrossel de ${slides.length} passos, você acompanha:\n${items}`,
    );
  } else if (source === "sections") {
    const sections = (variation.sections ?? []) as SectionLike[];
    const items = sections
      .map((section) => {
        const label = section.label?.trim() ?? "";
        const description = section.description?.trim() ?? "";
        return `\u2794 ${label}${description ? `: ${description}` : ""}`;
      })
      .join("\n");
    paragraphs.push(
      `Em ${sections.length} pontos diretos, o essencial fica assim:\n${items}`,
    );
  } else if (body) {
    paragraphs.push(body);
  }

  if (callToAction) paragraphs.push(callToAction);

  return paragraphs.join("\n\n").slice(0, maxChars).trim();
}
