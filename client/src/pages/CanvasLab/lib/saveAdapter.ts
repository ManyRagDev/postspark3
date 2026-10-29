import { assemblyDirectionV1Schema, assemblySlideRoles, assemblyDensities } from "@shared/componentAssembly";
import { arsenalCompilationReportSchema } from "@shared/arsenalGeneration";
import { catalogCompilationSchema } from "@shared/designCatalog";
import { readArsenalComposition, canvasElementStatesSchema, arsenalLogoSchema } from "@shared/designArsenal";
import { completeDesignProvenanceSchema } from "@shared/completeDesignGeneration";
/**
 * Adapters de persistência do CanvasLab (PostSpark Studio).
 *
 * Conectam o CanvasPostModel (documento autoritativo do editor oficial) ao
 * backend: `post.save` (INSERT) / `post.update` (UPDATE), ambos com a coluna
 * `canvas_model` (drizzle/0016_add_canvas_model_to_posts.sql) para reabertura
 * com fidelidade total.
 */

import {
  OFFICIAL_FAMILIES_META,
  type CanvasPostModel,
  type AspectRatioType,
  type TextAlignType,
  type LogoPositionType,
  type VisualFamilyId,
  type TextLegibilityEffect,
  type OverlayMode,
  type SplitBgPosition,
  type CanvasRichTextChunk,
  TEXT_EFFECTS_META,
} from "../components/types";
import { resolveCoverSlide } from "./documentCommands";
import { resolveSlideAppearance } from "./slideReplication";

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

function normalizeRichTextChunks(value: unknown): CanvasRichTextChunk[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const chunks = value
    .filter((chunk): chunk is Record<string, unknown> => Boolean(chunk) && typeof chunk === "object")
    .map((chunk) => ({
      text: typeof chunk.text === "string" ? chunk.text : "",
      ...(typeof chunk.color === "string" && chunk.color.trim() ? { color: chunk.color } : {}),
      ...(typeof chunk.sizeScale === "number" && Number.isFinite(chunk.sizeScale) && chunk.sizeScale > 0
        ? { sizeScale: chunk.sizeScale }
        : {}),
      ...(typeof chunk.bold === "boolean" ? { bold: chunk.bold } : {}),
      ...(typeof chunk.italic === "boolean" ? { italic: chunk.italic } : {}),
      ...(typeof chunk.underline === "boolean" ? { underline: chunk.underline } : {}),
    }))
    .filter((chunk) => chunk.text.length > 0);
  return chunks; // [] é override explícito: não reativar rich text herdado da raiz.
}

function normalizePositiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function normalizeNativeDecorationTransforms(
  raw: unknown
): Partial<Record<"logo" | "badge" | "bar", { scaleX: number; scaleY: number; rotation: number }>> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const obj = raw as Record<string, unknown>;
  const targets = ["logo", "badge", "bar"] as const;
  const result: Partial<Record<"logo" | "badge" | "bar", { scaleX: number; scaleY: number; rotation: number }>> = {};
  let hasValid = false;

  for (const t of targets) {
    const val = obj[t];
    if (val && typeof val === "object" && !Array.isArray(val)) {
      const v = val as Record<string, unknown>;
      const scaleX = typeof v.scaleX === "number" && Number.isFinite(v.scaleX) && v.scaleX > 0 ? v.scaleX : 1;
      const scaleY = typeof v.scaleY === "number" && Number.isFinite(v.scaleY) && v.scaleY > 0 ? v.scaleY : 1;
      const rotation = typeof v.rotation === "number" && Number.isFinite(v.rotation) ? v.rotation : 0;
      result[t] = { scaleX, scaleY, rotation };
      hasValid = true;
    }
  }

  return hasValid ? result : undefined;
}

function normalizeUserFonts(raw: unknown): import("@shared/designArsenal").ArsenalUserFont[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const valid = raw.filter((f): f is import("@shared/designArsenal").ArsenalUserFont =>
    Boolean(f) && typeof f === "object" && typeof f.family === "string" && f.family.trim().length > 0 && typeof f.url === "string" && f.url.trim().length > 0
  );
  return valid.length > 0 ? valid : undefined;
}

/** Constrói o payload de salvamento a partir do modelo do editor. */
export function canvasModelToSavePayload(
  post: CanvasPostModel,
  inputMeta: CanvasSaveInputMeta,
): CanvasSavePayload {
  // Etapa 2 §7.4 — campos legados do post representam a CAPA (primeiro
  // slide), nunca o slide ativo no instante do save.
  const cover = resolveCoverSlide(post);
  const coverAppearance = resolveSlideAppearance(post, 0);
  const coverBg = cover.bgImage ?? post.bgImage;

  return {
    inputType: inputMeta.inputType,
    inputContent: inputMeta.inputContent || post.headline || "Post PostSpark",
    platform: "instagram",
    headline: cover.headline ?? post.headline,
    body: cover.subtext ?? post.subtext,
    caption: post.caption,
    imagePrompt: post.imagePrompt,
    imageUrl: coverBg,
    backgroundColor: coverAppearance.palette.background,
    textColor: coverAppearance.palette.text,
    accentColor: coverAppearance.palette.accent,
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
  const aspectRatio = (["1:1", "4:5", "5:6", "9:16"].includes(String(raw.aspectRatio))
    ? raw.aspectRatio
    : "1:1") as AspectRatioType;
  const familyId = (OFFICIAL_FAMILIES_META[raw.familyId as VisualFamilyId]
    ? raw.familyId
    : "editorial-poster") as VisualFamilyId;
  const meta = OFFICIAL_FAMILIES_META[familyId];
  const logoPosition = (["top-left", "top-right", "bottom-left", "bottom-right"].includes(String(raw.logoPosition))
    ? raw.logoPosition
    : "top-right") as LogoPositionType;

  const headlineEffect = (raw.headlineEffect && raw.headlineEffect in TEXT_EFFECTS_META
    ? raw.headlineEffect
    : "none") as TextLegibilityEffect;
  const subtextEffect = (raw.subtextEffect && raw.subtextEffect in TEXT_EFFECTS_META
    ? raw.subtextEffect
    : "none") as TextLegibilityEffect;

  return {
    id: raw.id || `saved-${Date.now()}`,
    modelVersion: raw.modelVersion,
    ...(completeDesignProvenanceSchema.safeParse(raw.completeDesign).success ? { completeDesign: completeDesignProvenanceSchema.parse(raw.completeDesign) } : {}),
    catalogCompilation: catalogCompilationSchema.safeParse(raw.catalogCompilation).data,
    arsenalCompilation: arsenalCompilationReportSchema.safeParse(raw.arsenalCompilation).data,
    ...(raw.componentAssembly?.schemaVersion === 1 && assemblyDirectionV1Schema.safeParse(raw.componentAssembly.direction).success ? { componentAssembly: raw.componentAssembly } : {}),
    ...(Array.isArray(raw.componentCompilationReports) ? { componentCompilationReports: raw.componentCompilationReports.flatMap(entry => {
      const report = arsenalCompilationReportSchema.safeParse(entry.report);
      return typeof entry.slideId === 'string' && report.success ? [{ slideId: entry.slideId, report: report.data }] : [];
    }) } : {}),
    ...(raw.provenance ? { provenance: raw.provenance } : {}),
    ...(typeof raw.callToAction === "string" ? { callToAction: raw.callToAction } : {}),
    ...(Array.isArray(raw.hashtags) ? { hashtags: raw.hashtags } : {}),
    ...(Array.isArray(raw.sections) ? { sections: raw.sections } : {}),
    ...(raw.copyAngle ? { copyAngle: raw.copyAngle } : {}),
    familyId,
    familyName: raw.familyName || meta.name,
    aspectRatio,
    headlineAlign: (raw.headlineAlign === "center" || raw.headlineAlign === "right" ? raw.headlineAlign : "left"),
    bodyAlign: (raw.bodyAlign === "center" || raw.bodyAlign === "right" ? raw.bodyAlign : "left"),
    showBadge: Boolean(raw.showBadge),
    badgeText: raw.badgeText ?? "",
    showStep: Boolean(raw.showStep),
    headline: raw.headline ?? "",
    subtext: raw.subtext ?? "",
    headlineRich: normalizeRichTextChunks(raw.headlineRich),
    subtextRich: normalizeRichTextChunks(raw.subtextRich),
    caption: raw.caption ?? "",
    imagePrompt: raw.imagePrompt,
    fontFamily: raw.fontFamily || meta.defaultFont,
    subtextFontFamily: typeof raw.subtextFontFamily === "string" && raw.subtextFontFamily.trim() ? raw.subtextFontFamily : undefined,
    headlineFontWeight: typeof raw.headlineFontWeight === "number" && raw.headlineFontWeight >= 100 && raw.headlineFontWeight <= 900 ? raw.headlineFontWeight : undefined,
    subtextFontWeight: typeof raw.subtextFontWeight === "number" && raw.subtextFontWeight >= 100 && raw.subtextFontWeight <= 900 ? raw.subtextFontWeight : undefined,
    customFontUrl: raw.customFontUrl,
    bgImage: raw.bgImage,
    bgTransform: raw.bgTransform,
    bgPlacement: raw.bgPlacement,
    overlayOpacity: typeof raw.overlayOpacity === "number" ? raw.overlayOpacity : 0.55,
    overlayColor: typeof raw.overlayColor === "string" && raw.overlayColor.trim() ? raw.overlayColor.trim() : undefined,
    overlayMode: (typeof raw.overlayMode === "string" && ["gradient-bottom", "gradient-top", "solid", "radial"].includes(raw.overlayMode) ? raw.overlayMode : "gradient-bottom") as OverlayMode,
    logoUrl: raw.logoUrl,
    logoPosition,
    isSnapEnabled: raw.isSnapEnabled !== false,
    headlineSizeScale: raw.headlineSizeScale,
    subtextSizeScale: raw.subtextSizeScale,
    manualHeadlineColor: raw.manualHeadlineColor,
    manualSubtextColor: raw.manualSubtextColor,
    headlineEffect,
    headlineEffectColor: typeof raw.headlineEffectColor === "string" ? raw.headlineEffectColor : undefined,
    subtextEffect,
    subtextEffectColor: typeof raw.subtextEffectColor === "string" ? raw.subtextEffectColor : undefined,
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
          ...(s.composition !== undefined ? { composition: readArsenalComposition(s.composition) } : {}),
          id: s.id || `s-${i + 1}`,
          elementStates: canvasElementStatesSchema.safeParse(s.elementStates).data,
          elementOrder: Array.isArray(s.elementOrder) ? Array.from(new Set(s.elementOrder.filter(id => typeof id === "string"))) : undefined,
          logo: arsenalLogoSchema.safeParse(s.logo).data,
          ...(s.assemblyRole && assemblySlideRoles.includes(s.assemblyRole) ? { assemblyRole: s.assemblyRole } : {}),
          ...(s.assemblyDensity && assemblyDensities.includes(s.assemblyDensity) ? { assemblyDensity: s.assemblyDensity } : {}),
          step: s.step || `SLIDE 0${i + 1}`,
          headline: s.headline ?? "",
          subtext: s.subtext ?? "",
          headlineRich: normalizeRichTextChunks(s.headlineRich),
          subtextRich: normalizeRichTextChunks(s.subtextRich),
          bgImage: s.bgImage,
          bgTransform: s.bgTransform,
          bgPlacement: s.bgPlacement,
          imagePrompt: s.imagePrompt,
          headlinePos: s.headlinePos,
          subtextPos: s.subtextPos,
          badgePos: s.badgePos,
          barPos: s.barPos,
          logoPos: s.logoPos,
          headlineWidth: normalizePositiveNumber(s.headlineWidth),
          subtextWidth: normalizePositiveNumber(s.subtextWidth),
          headlineScale: normalizePositiveNumber(s.headlineScale),
          subtextScale: normalizePositiveNumber(s.subtextScale),
          nativeDecorationTransforms: normalizeNativeDecorationTransforms(s.nativeDecorationTransforms),
          extraTexts: Array.isArray(s.extraTexts) ? s.extraTexts : undefined,
          extraShapes: Array.isArray(s.extraShapes) ? s.extraShapes : undefined,
          extraImages: Array.isArray(s.extraImages) ? s.extraImages : undefined,
          suppressFamilyDecorations: s.suppressFamilyDecorations === true ? true : undefined,
          splitBgPosition: (typeof s.splitBgPosition === "string" && ["bottom", "top", "full"].includes(s.splitBgPosition) ? s.splitBgPosition : undefined) as SplitBgPosition | undefined,
          guidedComposition: s.guidedComposition?.version === 1 && ["headline", "image", "balanced"].includes(s.guidedComposition.id)
            && Number.isFinite(s.guidedComposition.readingArea?.y) && Number.isFinite(s.guidedComposition.readingArea?.height)
            ? s.guidedComposition : undefined,
          initialVisual: s.initialVisual?.version === 1 && s.initialVisual.visualStyle && s.initialVisual.geometry
            && ["1:1", "4:5", "5:6", "9:16"].includes(s.initialVisual.aspectRatio) ? {
              ...s.initialVisual,
              geometry: {
                ...s.initialVisual.geometry,
                nativeDecorationTransforms: normalizeNativeDecorationTransforms(s.initialVisual.geometry.nativeDecorationTransforms),
              },
            } : undefined,
          visualStyle: s.visualStyle && typeof s.visualStyle === "object" ? s.visualStyle : undefined,
        }))
      : [
          {
            id: "s1",
            step: "SLIDE 01 // CAPA",
            headline: raw.headline ?? "",
            subtext: raw.subtext ?? "",
            extraTexts: Array.isArray(raw.extraTexts) ? raw.extraTexts : undefined,
            extraImages: Array.isArray(raw.extraImages) ? raw.extraImages : undefined,
            splitBgPosition: (typeof raw.splitBgPosition === "string" && ["bottom", "top", "full"].includes(raw.splitBgPosition) ? raw.splitBgPosition : undefined) as SplitBgPosition | undefined,
          },
        ],
    extraTexts: Array.isArray(raw.extraTexts) ? raw.extraTexts : undefined,
    extraImages: Array.isArray(raw.extraImages) ? raw.extraImages : undefined,
    splitBgPosition: (typeof raw.splitBgPosition === "string" && ["bottom", "top", "full"].includes(raw.splitBgPosition) ? raw.splitBgPosition : undefined) as SplitBgPosition | undefined,
    userFonts: normalizeUserFonts(raw.userFonts),
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
