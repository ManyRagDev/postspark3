import { z } from "zod";
import {
  aspectRatioSchema,
  carouselSlideSchema,
  contentSectionSchema,
  copyAngleSchema,
  generationEvaluationSchema,
  platformSchema,
  postLayoutSchema,
  postModeSchema,
} from "./postsparkSchemas";

const hexColorSchema = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "expected hex color");

const designTokensSchema = z.object({
  colors: z
    .object({
      background: hexColorSchema,
      primary: hexColorSchema,
      secondary: hexColorSchema,
      text: hexColorSchema,
      card: hexColorSchema,
    })
    .optional(),
  typography: z
    .object({
      fontFamily: z.string(),
      customFontUrl: z.string(),
      originalFont: z.string(),
      textTransform: z.enum(["none", "uppercase"]),
      textAlign: z.enum(["left", "center"]),
    })
    .optional(),
  structure: z
    .object({
      borderRadius: z.string(),
      boxShadow: z.string(),
      border: z.string(),
    })
    .optional(),
  decorations: z.enum(["minimal", "playful"]).optional(),
});

const formatOptimizationSchema = z.object({
  layout: postLayoutSchema,
  backgroundColor: hexColorSchema,
  textColor: hexColorSchema,
  accentColor: hexColorSchema,
  headlineFontSize: z.number().optional(),
  bodyFontSize: z.number().optional(),
  padding: z.number().optional(),
});

export const brandKitContextSchema = z.object({
  toneOfVoice: z.string().optional(),
  formattingRules: z.array(z.string()),
  forbiddenTerms: z.array(z.string()),
  requiredTerms: z.array(z.string()),
  dictionary: z.record(z.string(), z.string()),
  colors: z.array(hexColorSchema),
  fontPrimary: z.string().optional(),
  fontSecondary: z.string().optional(),
  visualTokens: designTokensSchema.optional(),
  fallbackUsed: z.boolean(),
});

export const personaContextSchema = z.object({
  audience: z.string().optional(),
  pains: z.array(z.string()),
  goals: z.array(z.string()),
  languageStyle: z.string().optional(),
  objections: z.array(z.string()),
  fallbackUsed: z.boolean(),
});

export const siteIntelligenceContextSchema = z.object({
  siteIntelligenceId: z.string().optional(),
  summary: z.string().optional(),
  evidence: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      kind: z.string().optional(),
    }),
  ),
  toneGuidelines: z.array(z.string()),
  prohibitedClaims: z.array(z.string()),
  source: z.unknown().optional(),
  fallbackUsed: z.boolean(),
});

export const masterBriefingSchema = z.object({
  version: z.literal(1),
  userInput: z.object({
    inputType: z.enum(["text", "url", "image"]),
    content: z.string(),
    platform: platformSchema,
    postMode: postModeSchema,
    creationMode: z.enum(["ideation", "execution"]),
    executionBrief: z.unknown().optional(),
  }),
  brand: brandKitContextSchema,
  persona: personaContextSchema,
  site: siteIntelligenceContextSchema,
  constraints: z.object({
    forbiddenTerms: z.array(z.string()),
    requiredTerms: z.array(z.string()),
    toneGuidelines: z.array(z.string()),
    formattingRules: z.array(z.string()),
    preferredColors: z.array(hexColorSchema),
    maxHeadlineChars: z.number(),
    maxBodyChars: z.number(),
  }),
  compressed: z.boolean(),
  compressionNotes: z.array(z.string()),
  fallbackNotes: z.array(z.string()),
});

export const angleAssignmentSchema = z.object({
  angleId: z.string(),
  title: z.string(),
  thesis: z.string(),
  mechanism: z.enum([
    "pain",
    "benefit",
    "objection",
    "authority",
    "story",
    "myth",
    "how-to",
  ]),
  audience: z.string(),
  hook: z.string(),
  promise: z.string(),
  visualDirection: z.string(),
  risks: z.array(z.string()),
});

export const routerOutputSchema = z.object({
  intent: z.object({
    objective: z.enum(["educate", "authority", "sell", "engage", "lead"]),
    confidence: z.number().min(0).max(1),
    rationale: z.string(),
  }),
  angles: z.tuple([
    angleAssignmentSchema,
    angleAssignmentSchema,
    angleAssignmentSchema,
  ]),
  fallbackUsed: z.boolean(),
});

export const workerPayloadSchema = z.object({
  angleId: z.string(),
  copy: z.object({
    headline: z.string().min(1).max(80),
    body: z.string().min(1).max(160),
    caption: z.string().min(1),
    hashtags: z.array(z.string()).max(6),
    callToAction: z.string().min(1).max(50),
    tone: z.string().min(1),
  }),
  visual: z.object({
    concept: z.string().min(1),
    imagePrompt: z.string().min(1),
    layout: postLayoutSchema,
    aspectRatio: aspectRatioSchema,
    template: z.enum(["simple", "feature-grid", "numbered-list", "step-by-step"]).optional(),
    sections: z.array(contentSectionSchema).optional(),
    slides: z.array(carouselSlideSchema).optional(),
    backgroundColor: hexColorSchema,
    textColor: hexColorSchema,
    accentColor: hexColorSchema,
    designTokens: designTokensSchema.optional(),
    aspectRatioOptimizations: z
      .object({
        "1:1": formatOptimizationSchema,
        "5:6": formatOptimizationSchema,
        "9:16": formatOptimizationSchema,
      })
      .optional(),
    layoutSettingsByAspectRatio: z.record(aspectRatioSchema, z.unknown()).optional(),
  }),
});

export const originalityAssessmentSchema = z.object({
  score: z.number(),
  maxCandidateSimilarity: z.number(),
  maxSiteSimilarity: z.number(),
  maxHistorySimilarity: z.number(),
  closestSource: z.enum(["candidate", "site", "history", "none"]),
  fallbackUsed: z.boolean(),
});

export const originalityResultSchema = z.object({
  assessments: z.array(originalityAssessmentSchema),
  embeddings: z.array(z.array(z.number())),
  fallbackUsed: z.boolean(),
});

export const qaResultSchema = z.object({
  angleId: z.string(),
  passed: z.boolean(),
  evaluation: generationEvaluationSchema,
  feedback: z.array(z.string()),
});

export const graphStateSchema = z.object({
  runId: z.string(),
  status: z.enum([
    "created",
    "context_loaded",
    "context_compressed",
    "routed",
    "workers_completed",
    "originality_completed",
    "qa_completed",
    "revision_completed",
    "visual_contract_validated",
    "caption_synthesized",
    "mapped",
    "completed",
    "failed",
  ]),
  attempt: z.number(),
  input: masterBriefingSchema.shape.userInput,
  context: masterBriefingSchema.optional(),
  routing: routerOutputSchema.optional(),
  workers: z.array(workerPayloadSchema),
  originality: originalityResultSchema.optional(),
  qa: z.array(qaResultSchema),
  output: z.object({ variations: z.array(z.unknown()) }).optional(),
  control: z.object({
    maxCorrectionAttempts: z.number(),
    failedReason: z.string().optional(),
    fallbackToLegacy: z.boolean().optional(),
  }),
  events: z.array(
    z.object({
      at: z.string(),
      status: z.string(),
      detail: z.string(),
      data: z.unknown().optional(),
    }),
  ),
});

export type WorkerPayloadInput = z.infer<typeof workerPayloadSchema>;
