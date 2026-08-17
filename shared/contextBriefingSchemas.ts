/**
 * Schemas Zod para context briefing — movidos de shared/highTicketSchemas.ts (Fase D).
 *
 * Apenas os schemas consumidos pelos módulos canônicos relocados
 * (contextLoader, contextBudget, intentRouter). Schemas específicos do
 * pipeline paralelo removido (workerPayload, graphState, qaResult) não foram
 * portados.
 */
import { z } from "zod";
import { platformSchema, postModeSchema } from "./postsparkSchemas";

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
