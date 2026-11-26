import { ALL_FONT_NAMES, prepareCanvasFont } from "@/lib/fonts";
import type { CanvasPostModel, CanvasRichTextChunk, CarouselSlideItem } from "../components/types";
import { visibleCompositionAssets } from "./exportMedia";
import { extraTextAppearance, nativeTextAppearance } from "./nativeTextAppearance";

type FontUse = {
  family: string;
  weight: number;
  italic: boolean;
  text: string;
};

export function cleanFontFamily(family?: string | null): string | null {
  const primary = family?.trim().match(/^(?:"([^"]+)"|'([^']+)'|([^,]+))/);
  return (primary?.[1] ?? primary?.[2] ?? primary?.[3])?.trim() || null;
}

function fontDescriptor({ family, weight, italic }: FontUse) {
  const quoted = family.replace(/[\\"]/g, "\\$&");
  return `${italic ? "italic " : ""}${weight} 16px "${quoted}"`;
}

export function collectUsedFontsForSlide(slide: CarouselSlideItem, post: CanvasPostModel): FontUse[] {
  const used = new Map<string, FontUse>();
  const add = (family: string | undefined, text: string, weight: number, italic = false, chunks?: CanvasRichTextChunk[]) => {
    const primary = cleanFontFamily(family);
    if (!primary || !text.trim()) return;
    const addRun = (value: string, weight: number, italic: boolean) => {
      if (!value.trim()) return;
      const use = { family: primary, weight, italic, text: value };
      const key = fontDescriptor(use);
      const previous = used.get(key);
      if (previous) previous.text += value;
      else used.set(key, use);
    };
    let offset = 0;
    for (const chunk of chunks ?? []) {
      const end = offset + chunk.text.length;
      const runWeight = chunk.bold === false ? 400 : chunk.bold ? Math.max(700, weight) : weight;
      addRun(text.slice(offset, end), runWeight, chunk.italic ?? italic);
      offset = end;
    }
    addRun(text.slice(offset), weight, italic);
  };

  if (slide.composition) {
    for (const element of visibleCompositionAssets(slide.composition).elements) {
      if (element.kind === "text") {
        const weight = typeof element.fontWeight === "number" ? element.fontWeight : element.fontWeight === "bold" ? 700 : 400;
        add(element.fontFamily, element.text, weight, false, element.richText);
      }
    }
    return Array.from(used.values());
  }

  const effective = { ...post, ...slide.visualStyle };
  const headline = nativeTextAppearance(effective, slide, "headline");
  if (!slide.elementStates?.headline?.hidden)
    add(headline.fontFamily, slide.headline, headline.fontWeight, false, slide.headlineRich ?? post.headlineRich);
  const body = nativeTextAppearance(effective, slide, "body");
  if (!slide.elementStates?.subtext?.hidden)
    add(body.fontFamily, slide.subtext, body.fontWeight, false, slide.subtextRich ?? post.subtextRich);
  for (const layer of slide.extraTexts ?? post.extraTexts ?? []) {
    if (!slide.elementStates?.[layer.id]?.hidden && layer.opacity !== 0) {
      const appearance = extraTextAppearance(effective, layer);
      add(appearance.fontFamily, layer.text, appearance.fontWeight, layer.fontStyle === "italic", layer.textRich);
    }
  }
  return Array.from(used.values());
}

export function assertFontsReady(used: FontUse[]): void {
  const fonts = typeof document !== "undefined" ? document.fonts : undefined;
  if (!fonts || typeof fonts.check !== "function") return;
  for (const use of used) {
    if (!fonts.check(fontDescriptor(use), use.text))
      throw new Error(`A fonte "${use.family}" ainda não foi carregada no documento.`);
  }
}

export async function prepareFontsForExport(used: FontUse[]): Promise<void> {
  const fonts = typeof document !== "undefined" ? document.fonts : undefined;
  if (!fonts || !used.length) return;
  if (typeof fonts.load !== "function") {
    assertFontsReady(used);
    return;
  }

  await Promise.all(used.map(async use => {
    const descriptor = fontDescriptor(use);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const load = async () => {
        const faces = await fonts.load(descriptor, use.text);
        if (!faces.length && ALL_FONT_NAMES.includes(use.family)) {
          await prepareCanvasFont(use.family, use.weight, use.italic);
          await fonts.load(descriptor, use.text);
        }
      };
      const deadline = new Promise<never>((_, reject) => {
        timeout = setTimeout(reject, 4000);
      });
      await Promise.race([load(), deadline]);
      assertFontsReady([use]);
    } catch {
      throw new Error(`Não foi possível carregar a fonte "${use.family}" para exportar. Tente novamente.`);
    } finally {
      clearTimeout(timeout);
    }
  }));
}
