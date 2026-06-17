import { z } from "zod";

export const inputTypeSchema = z.enum(["text", "url", "image"]);
export const platformSchema = z.enum(["instagram", "twitter", "linkedin", "facebook"]);
export const aspectRatioSchema = z.enum(["1:1", "5:6", "9:16"]);
export const postModeSchema = z.enum(["static", "carousel"]);
export const postLayoutSchema = z.enum(["centered", "left-aligned", "split", "minimal"]);
export const postTemplateSchema = z.enum(["simple", "feature-grid", "numbered-list", "step-by-step"]);

export const layoutPositionSchema = z.object({
  position: z.enum(["top-left", "top-center", "top-right", "center-left", "center", "center-right", "bottom-left", "bottom-center", "bottom-right"]),
  textAlign: z.enum(["left", "center", "right"]),
  freePosition: z
    .object({
      x: z.number(),
      y: z.number(),
    })
    .optional(),
  width: z.number().optional(),
  backgroundColor: z.string().optional(),
  borderRadius: z.number().optional(),
});

export const advancedLayoutSettingsSchema = z.object({
  headline: layoutPositionSchema,
  body: layoutPositionSchema,
  accentBar: layoutPositionSchema,
  badge: layoutPositionSchema,
  sticker: layoutPositionSchema,
  carouselArrow: layoutPositionSchema,
  card: layoutPositionSchema,
  sectionLayouts: z.record(z.string(), layoutPositionSchema).optional(),
  padding: z.number(),
});

export const imageSettingsSchema = z.object({
  zoom: z.number(),
  brightness: z.number(),
  contrast: z.number(),
  saturation: z.number(),
  blur: z.number(),
  overlayOpacity: z.number(),
  overlayColor: z.string(),
  blendMode: z.enum(["normal", "multiply", "screen", "overlay", "darken", "lighten"]),
  panX: z.number(),
  panY: z.number(),
});

export const backgroundValueSchema = z.object({
  type: z.enum(["none", "gallery", "upload", "ai", "solid"]),
  url: z.string().optional(),
  color: z.string().optional(),
});

export const bgOverlaySettingsSchema = z.object({
  opacity: z.number(),
  color: z.string(),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
});

export const copyAngleSchema = z.object({
  type: z.enum(["dor", "beneficio", "objecao", "autoridade", "escassez", "storytelling", "mito_vs_verdade"]),
  label: z.string(),
  badge: z.string(),
  stickerText: z.string(),
});

export const contentSectionSchema = z.object({
  id: z.string().optional(),
  icon: z.string().optional(),
  label: z.string(),
  description: z.string().optional(),
  number: z.number().optional(),
});

export const textElementSchema = z.object({
  id: z.string(),
  text: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.union([z.number(), z.literal("auto")]),
  height: z.union([z.number(), z.literal("auto")]),
  rotation: z.number(),
  styles: z.object({
    fontSize: z.string(),
    fontFamily: z.string(),
    color: z.string(),
    fontWeight: z.string(),
    fontStyle: z.string(),
    textDecoration: z.string(),
    textAlign: z.enum(["left", "center", "right"]),
    lineHeight: z.string(),
    opacity: z.string(),
  }),
});

const designTokensSchema = z.object({
  colors: z.object({
    background: z.string(),
    primary: z.string(),
    secondary: z.string(),
    text: z.string(),
    card: z.string(),
  }),
  typography: z.object({
    fontFamily: z.string(),
    customFontUrl: z.string(),
    originalFont: z.string(),
    textTransform: z.enum(["none", "uppercase"]),
    textAlign: z.enum(["left", "center"]),
  }),
  structure: z.object({
    borderRadius: z.string(),
    boxShadow: z.string(),
    border: z.string(),
  }),
  decorations: z.enum(["minimal", "playful"]),
});

const formatOptimizationSchema = z.object({
  layout: postLayoutSchema,
  backgroundColor: z.string(),
  textColor: z.string(),
  accentColor: z.string(),
  headlineFontSize: z.number().optional(),
  bodyFontSize: z.number().optional(),
  padding: z.number().optional(),
  headline: z
    .object({
      x: z.number().optional(),
      y: z.number().optional(),
      width: z.number().optional(),
      textAlign: z.enum(["left", "center", "right"]).optional(),
      backgroundColor: z.string().optional(),
      borderRadius: z.number().optional(),
    })
    .optional(),
  body: z
    .object({
      x: z.number().optional(),
      y: z.number().optional(),
      width: z.number().optional(),
      textAlign: z.enum(["left", "center", "right"]).optional(),
      backgroundColor: z.string().optional(),
      borderRadius: z.number().optional(),
    })
    .optional(),
  card: z
    .object({
      x: z.number().optional(),
      y: z.number().optional(),
      width: z.number().optional(),
      textAlign: z.enum(["left", "center", "right"]).optional(),
      backgroundColor: z.string().optional(),
      borderRadius: z.number().optional(),
    })
    .optional(),
});

const generationEvaluationSchema = z.object({
  overallScore: z.number(),
  accepted: z.boolean(),
  dimensions: z.object({
    brandAlignment: z.number(),
    objectiveAlignment: z.number(),
    audienceRelevance: z.number(),
    factuality: z.number(),
    originality: z.number(),
    clarity: z.number(),
    platformFit: z.number(),
    visualReadability: z.number(),
  }),
  feedback: z.array(z.string()),
});

const generationMetaSchema = z.object({
  creationMode: z.enum(["ideation", "execution"]),
  fidelity: z.enum(["high", "medium"]).optional(),
  interventionLevel: z.enum(["visual_only", "light_optimize", "optimize_structure"]).optional(),
  siteIntelligenceId: z.string().optional(),
  strategyId: z.string().optional(),
  revisionCount: z.number().optional(),
  revisionApplied: z.boolean().optional(),
  revisionFailed: z.boolean().optional(),
  evaluation: generationEvaluationSchema.optional(),
  originality: z
    .object({
      score: z.number(),
      maxCandidateSimilarity: z.number(),
      maxSiteSimilarity: z.number(),
      maxHistorySimilarity: z.number(),
      closestSource: z.enum(["candidate", "site", "history", "none"]),
      fallbackUsed: z.boolean(),
    })
    .optional(),
});

const variationVisualPatchSchema = z.object({
  headline: z.string().optional(),
  body: z.string().optional(),
  caption: z.string().optional(),
  hashtags: z.array(z.string()).optional(),
  callToAction: z.string().optional(),
  tone: z.string().optional(),
  platform: platformSchema.optional(),
  imagePrompt: z.string().optional(),
  imageUrl: z.string().optional(),
  backgroundColor: z.string().optional(),
  textColor: z.string().optional(),
  headlineColor: z.string().optional(),
  bodyColor: z.string().optional(),
  headlineFontSize: z.number().optional(),
  bodyFontSize: z.number().optional(),
  headlineFontFamily: z.string().optional(),
  bodyFontFamily: z.string().optional(),
  accentColor: z.string().optional(),
  layout: postLayoutSchema.optional(),
  aspectRatio: aspectRatioSchema.optional(),
  postMode: postModeSchema.optional(),
  splitImagePosition: z.enum(["top", "bottom"]).optional(),
  template: postTemplateSchema.optional(),
  sections: z.array(contentSectionSchema).optional(),
  textElements: z.array(textElementSchema).optional(),
  imageSettings: imageSettingsSchema.optional(),
  layoutSettings: advancedLayoutSettingsSchema.optional(),
  bgValue: backgroundValueSchema.optional(),
  bgOverlay: bgOverlaySettingsSchema.optional(),
  copyAngle: copyAngleSchema.optional(),
  designTokens: designTokensSchema.partial().optional(),
  brandMeta: z
    .object({
      logoUrl: z.string().optional(),
      brandName: z.string().optional(),
      favicon: z.string().optional(),
    })
    .optional(),
});

export const carouselSlideSchema = z.object({
  headline: z.string(),
  body: z.string(),
  slideNumber: z.number(),
  isTitleSlide: z.boolean().optional(),
  isCtaSlide: z.boolean().optional(),
  editorState: z
    .object({
      variation: variationVisualPatchSchema.optional(),
      imageSettings: imageSettingsSchema.partial().optional(),
      layoutSettings: advancedLayoutSettingsSchema.partial().optional(),
      bgValue: backgroundValueSchema.optional(),
      bgOverlay: bgOverlaySettingsSchema.partial().optional(),
    })
    .optional(),
});

export const postVisualSnapshotSchema = z.object({
  snapshotVersion: z.literal(1),
  id: z.string(),
  headline: z.string(),
  body: z.string(),
  caption: z.string(),
  hashtags: z.array(z.string()),
  callToAction: z.string(),
  tone: z.string(),
  platform: platformSchema,
  imagePrompt: z.string(),
  imageUrl: z.string().optional(),
  backgroundColor: z.string(),
  textColor: z.string(),
  headlineColor: z.string().optional(),
  bodyColor: z.string().optional(),
  headlineFontSize: z.number().optional(),
  bodyFontSize: z.number().optional(),
  headlineFontFamily: z.string().optional(),
  bodyFontFamily: z.string().optional(),
  accentColor: z.string(),
  layout: postLayoutSchema,
  aspectRatio: aspectRatioSchema,
  postMode: postModeSchema,
  slides: z.array(carouselSlideSchema).optional(),
  splitImagePosition: z.enum(["top", "bottom"]).optional(),
  template: postTemplateSchema.optional(),
  sections: z.array(contentSectionSchema).optional(),
  textElements: z.array(textElementSchema).optional(),
  aspectRatioOptimizations: z.partialRecord(aspectRatioSchema, formatOptimizationSchema).optional(),
  layoutSettingsByAspectRatio: z.partialRecord(aspectRatioSchema, advancedLayoutSettingsSchema).optional(),
  copyAngle: copyAngleSchema.optional(),
  designTokens: designTokensSchema.partial().optional(),
  brandMeta: z
    .object({
      logoUrl: z.string().optional(),
      brandName: z.string().optional(),
      favicon: z.string().optional(),
    })
    .optional(),
  generationMeta: generationMetaSchema.optional(),
  imageSettings: imageSettingsSchema,
  layoutSettings: advancedLayoutSettingsSchema,
  bgValue: backgroundValueSchema,
  bgOverlay: bgOverlaySettingsSchema,
});
