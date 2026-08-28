import type { Platform, PostVariation } from "@shared/postspark";
import { PLATFORM_SPECS } from "@shared/postspark";

interface SlideLike {
  headline?: string;
  body?: string;
}

interface SectionLike {
  label?: string;
  description?: string;
}

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
 * Síntese determinística de legenda com tom autoral e de autoridade (sem clichês de IA).
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
  if (headline) paragraphs.push(headline);

  if (source === "slides") {
    const slides = (variation.slides ?? []) as SlideLike[];
    const items = slides
      .map((slide, index) => {
        const slideHeadline = slide.headline?.trim() ?? "";
        const slideBody = slide.body?.trim() ?? "";
        return `• ${slideHeadline}${slideBody ? `: ${slideBody}` : ""}`;
      })
      .join("\n");
    paragraphs.push(
      `Consistência e clareza visual são os pilares de marcas que lideram seus mercados.\n\nOs pontos centrais deste posicionamento:\n${items}`,
    );
  } else if (source === "sections") {
    const sections = (variation.sections ?? []) as SectionLike[];
    const items = sections
      .map((section) => {
        const label = section.label?.trim() ?? "";
        const description = section.description?.trim() ?? "";
        return `• ${label}${description ? `: ${description}` : ""}`;
      })
      .join("\n");
    paragraphs.push(
      `A percepção de valor nasce quando cada elemento é deliberado:\n${items}`,
    );
  } else if (body) {
    paragraphs.push(body);
  }

  if (callToAction) {
    paragraphs.push(callToAction);
  } else {
    paragraphs.push("Qual desses princípios é inegociável na sua operação hoje?");
  }

  return paragraphs.join("\n\n").slice(0, maxChars).trim();
}