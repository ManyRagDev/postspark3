/**
 * Adapters de persistência do CanvasLab (PostSpark Studio).
 *
 * Conectam o CanvasPostModel (documento autoritativo do editor oficial) ao
 * backend: `post.save` (INSERT) / `post.update` (UPDATE), ambos com a coluna
 * `canvas_model` (drizzle/0016_add_canvas_model_to_posts.sql) para reabertura
 * com fidelidade total.
 */

import { OFFICIAL_FAMILIES_META, type CanvasPostModel, type AspectRatioType, type TextAlignType, type LogoPositionType, type VisualFamilyId } from "../components/types";

export type SaveInputType = "text" | "url" | "image";

export interface CanvasSaveInputMeta {
  inputType: SaveInputType;
  inputContent: string;
}

export interface CanvasSavePayload {
  inputType: SaveInputType;
  inputContent: string;
  platform: "instagram";
  headline?: string;
  body?: string;
  caption?: string;
  imagePrompt?: string;
  imageUrl?: string;
  backgroundColor?: string;
  textColor?: string;
  accentColor?: string;
  layout: "centered";
  postMode: "static" | "carousel";
  slides: Array<{ headline: string; body: string; slideNumber: number }>;
  canvasModel: Record<string, unknown>;
}

export type SavedPostRecordLike = {
  id: number;
  canvas_model?: unknown;
  headline?: string | null;
  body?: string | null;
  caption?: string | null;
  imagePrompt?: string | null;
  imageUrl?: string | null;
  backgroundColor?: string | null;
  textColor?: string | null;
  accentColor?: string | null;
  postMode?: string | null;
  slides?: unknown;
  inputContent?: string | null;
  inputType?: string | null;
};

/** Constrói o payload de salvamento a partir do modelo do editor. */
export function canvasModelToSavePayload(
  post: CanvasPostModel,
  inputMeta: CanvasSaveInputMeta,
): CanvasSavePayload {
  const activeSlide = post.slides[post.currentSlideIndex] || post.slides[0];
  const activeBg = activeSlide?.bgImage || post.bgImage;

  return {
    inputType: inputMeta.inputType,
    inputContent: inputMeta.inputContent || post.headline || "Post PostSpark",
    platform: "instagram",
    headline: activeSlide?.headline ?? post.headline,
    body: activeSlide?.subtext ?? post.subtext,
    caption: post.caption,
    imagePrompt: post.imagePrompt,
    imageUrl: activeBg,
    backgroundColor: post.palette.background,
    textColor: post.palette.text,
    accentColor: post.palette.accent,
    layout: "centered",
    postMode: post.slides.length > 1 ? "carousel" : "static",
    slides: post.slides.map((s, i) => ({
      headline: s.headline,
      body: s.subtext,
      slideNumber: i + 1,
    })),
    canvasModel: post as unknown as Record<string, unknown>,
  };
}

/** Campos aceitos por post.update (sem inputType/inputContent/platform). */
export function canvasModelToUpdatePayload(post: CanvasPostModel) {
  const { inputType: _it, inputContent: _ic, platform: _p, ...rest } = canvasModelToSavePayload(post, {
    inputType: "text",
    inputContent: "",
  });
  return rest;
}

/** Normaliza defensivamente um objeto parcial em CanvasPostModel completo. */
export function normalizeCanvasModel(raw: Partial<CanvasPostModel> & { id?: string }): CanvasPostModel {
  const aspectRatio = (["1:1", "5:6", "9:16"].includes(String(raw.aspectRatio))
    ? raw.aspectRatio
    : "1:1") as AspectRatioType;
  const familyId = (OFFICIAL_FAMILIES_META[raw.familyId as VisualFamilyId]
    ? raw.familyId
    : "editorial-poster") as VisualFamilyId;
  const meta = OFFICIAL_FAMILIES_META[familyId];
  const logoPosition = (["top-left", "top-right", "bottom-left", "bottom-right"].includes(String(raw.logoPosition))
    ? raw.logoPosition
    : "top-right") as LogoPositionType;

  return {
    id: raw.id || `saved-${Date.now()}`,
    familyId,
    familyName: raw.familyName || meta.name,
    aspectRatio,
    headlineAlign: (raw.headlineAlign === "center" || raw.headlineAlign === "right" ? raw.headlineAlign : "left"),
    bodyAlign: (raw.bodyAlign === "center" || raw.bodyAlign === "right" ? raw.bodyAlign : "left"),
    badgeText: raw.badgeText ?? "",
    headline: raw.headline ?? "",
    subtext: raw.subtext ?? "",
    caption: raw.caption ?? "",
    imagePrompt: raw.imagePrompt,
    fontFamily: raw.fontFamily || meta.defaultFont,
    customFontUrl: raw.customFontUrl,
    bgImage: raw.bgImage,
    bgTransform: raw.bgTransform,
    overlayOpacity: typeof raw.overlayOpacity === "number" ? raw.overlayOpacity : 0.55,
    logoUrl: raw.logoUrl,
    logoPosition,
    isSnapEnabled: raw.isSnapEnabled !== false,
    headlineSizeScale: raw.headlineSizeScale,
    subtextSizeScale: raw.subtextSizeScale,
    manualHeadlineColor: raw.manualHeadlineColor,
    manualSubtextColor: raw.manualSubtextColor,
    palette: {
      background: raw.palette?.background || "#120D0A",
      text: raw.palette?.text || "#F8F4EE",
      accent: raw.palette?.accent || "#E5A93C",
      surface: raw.palette?.surface,
      headlineColor: raw.palette?.headlineColor,
      subtextColor: raw.palette?.subtextColor,
    },
    slides: Array.isArray(raw.slides) && raw.slides.length > 0
      ? raw.slides.map((s, i) => ({
          id: s.id || `s-${i + 1}`,
          step: s.step || `SLIDE 0${i + 1}`,
          headline: s.headline ?? "",
          subtext: s.subtext ?? "",
          bgImage: s.bgImage,
          bgTransform: s.bgTransform,
          imagePrompt: s.imagePrompt,
          headlinePos: s.headlinePos,
          subtextPos: s.subtextPos,
          badgePos: s.badgePos,
          barPos: s.barPos,
          logoPos: s.logoPos,
        }))
      : [
          {
            id: "s1",
            step: "SLIDE 01 // CAPA",
            headline: raw.headline ?? "",
            subtext: raw.subtext ?? "",
          },
        ],
    currentSlideIndex: Math.min(
      Math.max(0, raw.currentSlideIndex ?? 0),
      Math.max(0, (raw.slides?.length ?? 1) - 1),
    ),
  };
}

/**
 * Reconstrói um CanvasPostModel a partir de um post salvo.
 * 1. Preferência: coluna canvas_model (fidelidade total — posições arrastadas,
 *    logo, escalas, cores por elemento).
 * 2. Fallback heurístico para posts legados criados fora do CanvasLab.
 */
export function savedPostToCanvasModel(record: SavedPostRecordLike): CanvasPostModel {
  if (record.canvas_model && typeof record.canvas_model === "object" && !Array.isArray(record.canvas_model)) {
    return normalizeCanvasModel(record.canvas_model as Partial<CanvasPostModel> & { id?: string });
  }

  // ─── Fallback legado: reconstrução aproximada a partir dos campos do post ───
  const legacySlidesRaw = Array.isArray(record.slides) ? (record.slides as Array<Record<string, unknown>>) : [];
  const legacySlides = legacySlidesRaw.length > 0
    ? legacySlidesRaw.map((s, i) => ({
        id: `s-${i + 1}`,
        step: `SLIDE 0${i + 1}`,
        headline: String(s?.headline ?? ""),
        subtext: String(s?.body ?? ""),
      }))
    : [
        {
          id: "s1",
          step: "SLIDE 01 // CAPA",
          headline: record.headline || "",
          subtext: record.body || "",
        },
      ];

  return normalizeCanvasModel({
    id: `saved-${record.id}`,
    headline: record.headline || "",
    subtext: record.body || "",
    caption: record.caption || "",
    imagePrompt: record.imagePrompt || undefined,
    bgImage: record.imageUrl || undefined,
    palette: {
      background: record.backgroundColor || "#120D0A",
      text: record.textColor || "#F8F4EE",
      accent: record.accentColor || "#E5A93C",
    },
    slides: legacySlides,
  });
}
