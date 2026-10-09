import { aspectRatioHeight } from "@shared/aspectRatios";
import {
  CATALOG_COMPILER,
  catalogSelectionSchema,
  type CatalogCompilation,
  type CatalogSelection,
} from "@shared/designCatalog";
import {
  type CanvasPostModel,
  resolveLegibleTextColor,
} from "../components/types";
import { layoutRichText } from "./richTextLayout";
import { canvasTypography } from "./catalogTypography";

const fonts = new Map<string, Promise<void>>();
async function loadCatalogFace(family: string, weight: number): Promise<void> {
  if (/^(Arial|Helvetica|sans-serif|serif|monospace)(,|$)/i.test(family))
    return;
  const key = `${family}:${weight}`;
  let task = fonts.get(key);
  if (!task) {
    task = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch(
          `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&display=swap`,
          { signal: controller.signal }
        );
        if (!response.ok) throw new Error("font_unavailable");
        const css = await response.text();
        const blocks = css.match(/@font-face\s*\{[^}]+\}/g) ?? [];
        if (!blocks.length) throw new Error("font_unavailable");
        await Promise.all(
          blocks.map(async block => {
            const url = block.match(/src:\s*url\(([^)]+)\)/)?.[1];
            if (!url || new URL(url).hostname !== "fonts.gstatic.com")
              throw new Error("font_source_unsupported");
            const file = await fetch(url, { signal: controller.signal });
            if (!file.ok) throw new Error("font_unavailable");
            const face = new FontFace(family, await file.arrayBuffer(), {
              weight: String(weight),
              unicodeRange: block.match(/unicode-range:\s*([^;]+);/)?.[1],
            });
            await face.load();
            document.fonts.add(face);
          })
        );
      } finally {
        clearTimeout(timer);
      }
    })();
    fonts.set(key, task);
    void task.catch(() => fonts.delete(key));
  }
  return task;
}
/** Saved Canvas documents reload exactly the requested weights before relayout. */
export async function ensureCatalogPostFonts(
  post: CanvasPostModel
): Promise<void> {
  await Promise.all([
    loadCatalogFace(post.fontFamily, post.headlineFontWeight ?? 700),
    loadCatalogFace(
      post.subtextFontFamily ?? "Inter",
      post.subtextFontWeight ?? 400
    ),
  ]);
}
export async function compileCatalogPost(
  post: CanvasPostModel,
  selection: CatalogSelection
): Promise<CanvasPostModel> {
  const parsed = catalogSelectionSchema.safeParse(selection);
  if (!parsed.success) return post;
  const s = parsed.data;
  const report: CatalogCompilation = {
    traceId: s.traceId,
    versionId: s.versionId,
    blueprintId: s.blueprintId,
    version: s.version,
    contentHash: s.contentHash,
    compilerVersion: CATALOG_COMPILER,
    status: "applied",
    reasons: [],
  };
  const fallback = (reason: string) => ({
    ...post,
    catalogCompilation: {
      ...report,
      status: "fallback" as const,
      reasons: [reason],
    },
  });
  const b = s.definition;
  if (post.slides.length !== 1 || !b.formats.includes(post.aspectRatio))
    return fallback("format_or_post_mode");
  if (b.media === "required" && !post.bgImage && !post.slides[0].bgImage)
    return fallback("missing_image");
  const slide = post.slides[0];
  if (
    slide.headline.length > b.maxHeadlineChars ||
    slide.subtext.length > b.maxBodyChars
  )
    return fallback("content_length");
  const h = b.pieces.find(p => p.role === "headline")!;
  const body = b.pieces.find(p => p.role === "body")!;
  const headlineFont = s.preserveBrandFonts ? post.fontFamily : h.fontFamily;
  const bodyFont = s.preserveBrandFonts
    ? (post.subtextFontFamily ?? "Inter")
    : body.fontFamily;
  const headlineWeight = s.preserveBrandFonts
    ? (post.headlineFontWeight ?? 700)
    : h.fontWeight;
  const bodyWeight = s.preserveBrandFonts
    ? (post.subtextFontWeight ?? 400)
    : body.fontWeight;
  try {
    await Promise.all([
      loadCatalogFace(headlineFont, headlineWeight),
      loadCatalogFace(bodyFont, bodyWeight),
    ]);
  } catch {
    return fallback("font_unavailable");
  }
  const height =
    aspectRatioHeight(post.aspectRatio);
  // Use the neutral native family: legacy families draw fixed panels behind text.
  const metrics = canvasTypography("editorial-poster");
  const fit = (
    piece: typeof h,
    text: string,
    family: string,
    weight: number,
    headline: boolean
  ) => {
    const padding = piece.effect.startsWith("box-")
      ? 18
      : piece.effect === "strip-line"
        ? 8
        : 3;
    const availableWidth = piece.box.width * 360 - padding * 2;
    const availableHeight = piece.box.height * height - padding * 2;
    if (availableWidth < 40 || availableHeight <= 0) return null;
    for (
      let size = piece.fontSize;
      size >= piece.minFontSize;
      size = Math.max(piece.minFontSize, size - 0.5)
    ) {
      const layout = layoutRichText({
        text,
        width: availableWidth,
        fontSize: size,
        fontFamily: family,
        fontStyle: String(weight),
        align: piece.align,
        fill: "#000000",
        lineHeight: headline
          ? metrics.headlineLineHeight
          : metrics.bodyLineHeight,
        letterSpacing: headline ? metrics.headlineLetterSpacing : 0,
      });
      if (
        layout.height <= availableHeight &&
        layout.lines.every(line => line.width <= availableWidth + 0.01)
      )
        return { size, padding, width: availableWidth };
      if (size === piece.minFontSize) break;
    }
    return null;
  };
  const hf = fit(h, slide.headline, headlineFont, headlineWeight, true);
  const bf = fit(body, slide.subtext, bodyFont, bodyWeight, false);
  if (!hf || !bf) return fallback("text_does_not_fit");
  if (hf.size < h.fontSize || bf.size < body.fontSize) {
    report.status = "adapted";
    report.reasons.push("text_size_reduced");
  }
  const colorFor = (piece: typeof h, proposed: string) =>
    resolveLegibleTextColor(
      piece.effect.startsWith("box-") || piece.effect === "strip-line"
        ? post.palette.accent
        : post.palette.background,
      proposed
    );
  return {
    ...post,
    familyId: "editorial-poster",
    familyName: b.name,
    catalogCompilation: report,
    fontFamily: headlineFont,
    subtextFontFamily: bodyFont,
    customFontUrl: s.preserveBrandFonts ? post.customFontUrl : undefined,
    headlineFontWeight: headlineWeight,
    subtextFontWeight: bodyWeight,
    headlineSizeScale: hf.size / metrics.headlineBase,
    subtextSizeScale: bf.size / metrics.bodyBase,
    headlineAlign: h.align,
    bodyAlign: body.align,
    headlineEffect: h.effect,
    subtextEffect: body.effect,
    headlineEffectColor: post.palette.accent,
    subtextEffectColor: post.palette.accent,
    palette: {
      ...post.palette,
      headlineColor: colorFor(
        h,
        post.palette.headlineColor ?? post.palette.text
      ),
      subtextColor: colorFor(
        body,
        post.palette.subtextColor ?? post.palette.text
      ),
    },
    slides: [
      {
        ...slide,
        suppressFamilyDecorations: true,
        headlinePos: {
          x: h.box.x * 360 + hf.padding,
          y: h.box.y * height + hf.padding,
        },
        subtextPos: {
          x: body.box.x * 360 + bf.padding,
          y: body.box.y * height + bf.padding,
        },
        headlineWidth: hf.width,
        subtextWidth: bf.width,
        headlineScale: 1,
        subtextScale: 1,
      },
    ],
  };
}
