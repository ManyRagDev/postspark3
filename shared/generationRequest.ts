import { generationSourceSchema } from "./generationSources";
import { contentRequirementSchema } from "./contentRequirements";
import { z } from "zod";
import { generationProjectSnapshotSchema } from "./projectEditorial";

/** Shared by the batch and orchestrated endpoints; execution controls cannot drift. */
export const executionBriefSchema = z
  .object({
    creationMode: z.literal("execution"),
    format: z.enum(["static", "carousel", "story", "ad"]),
    platform: z.enum(["instagram", "twitter", "linkedin", "facebook"]),
    objective: z.enum(["educate", "authority", "sell", "engage", "lead"]),
    tone: z.string().max(160).optional(),
    callToAction: z.string().max(2000).optional(),
    audience: z.string().max(2000).optional(),
    brandEssence: z.string().max(2000).optional(),
    interventionLevel: z.enum([
      "visual_only",
      "light_optimize",
      "optimize_structure",
    ]),
    contentSourceType: z.enum([
      "freeform",
      "carousel_topics",
      "carousel_slides",
      "caption_ready",
    ]),
    rawInput: z.string().max(24000),
    slides: z
      .array(
        z.object({
          slideNumber: z.number().int().min(1).max(10),
          rawText: z.string().max(8000),
          role: z.enum(["hook", "development", "cta", "custom"]).optional(),
          locked: z.boolean().optional(),
        })
      )
      .max(10)
      .optional(),
    mustKeep: z.array(z.string().max(4000)).max(50).optional(),
    mustInclude: z.array(z.string().max(4000)).max(50).optional(),
    forbiddenTerms: z.array(z.string().max(4000)).max(50).optional(),
    contentRequirements: z.array(contentRequirementSchema).max(50).optional(),
    notes: z.string().max(8000).optional(),
    brandInput: z
      .object({
        websiteUrl: z.string().max(2048).optional(),
        logoUrl: z.string().max(12_000_000).optional(),
        referenceImageUrl: z.string().max(12_000_000).optional(),
        brandColors: z.array(z.string().max(32)).max(20).optional(),
        fontHint: z.string().max(200).optional(),
        adaptationMode: z.enum(["strict", "adaptive", "reference_clone"]),
      })
      .optional(),
  })
  .superRefine((brief, ctx) => {
    const text = [
      brief.rawInput,
      brief.notes ?? "",
      brief.audience ?? "",
      brief.brandEssence ?? "",
      ...(brief.slides ?? []).map(s => s.rawText),
      ...(brief.mustKeep ?? []),
      ...(brief.mustInclude ?? []),
      ...(brief.forbiddenTerms ?? []),
      ...(brief.contentRequirements ?? []).map(r => r.value),
    ];
    if (text.reduce((total, value) => total + value.length, 0) > 96000)
      ctx.addIssue({
        code: "custom",
        message: "Briefing textual excede o orçamento de entrada",
      });
    const slideNumbers = (brief.slides ?? []).map(s => s.slideNumber);
    if (new Set(slideNumbers).size !== slideNumbers.length)
      ctx.addIssue({
        code: "custom",
        path: ["slides"],
        message: "Números de slide duplicados",
      });
  });

export const orchestratedGenerationInputSchema = z
  .object({
    /** Binds locally persisted admission retries to the authenticated account. */
    ownerId: z.string().uuid(),
    inputType: z.enum(["text", "url", "image"]),
    sources: z.array(generationSourceSchema).max(8).optional(),
    content: z.string().min(1).max(24000),
    platform: z.enum(["instagram", "twitter", "linkedin", "facebook"]),
    imageUrl: z.string().max(12_000_000).optional(),
    tone: z.string().max(160).optional(),
    postMode: z.enum(["static", "carousel"]).default("static"),
    formatIntentConfirmed: z.boolean().default(false),
    includeDraftDesigns: z.boolean().default(false),
    slideCount: z.number().int().min(2).max(10).optional(),
    aspectRatio: z.enum(["1:1", "4:5", "5:6", "9:16"]).default("4:5"),
    model: z.enum(["gemini", "llama"]).optional(),
    creationMode: z.enum(["ideation", "execution"]).default("ideation"),
    executionBrief: executionBriefSchema.optional(),
    siteIntelligenceId: z.string().uuid().optional(),
    projectId: z.string().max(64).optional(),
    projectDossier: z.string().max(24000).optional(),
    projectSnapshot: generationProjectSnapshotSchema.optional(),
    idempotencyKey: z.string().min(1).max(128),
  })
  .strict()
  .superRefine((v, ctx) => {
    if(v.inputType==="image"&&!v.imageUrl&&!v.sources?.some(s=>s.kind==="image"&&s.purpose==="content"))ctx.addIssue({code:"custom",path:["imageUrl"],message:"Inclua a imagem fonte do pedido."});
    if (v.creationMode === "execution" && !v.executionBrief)
      ctx.addIssue({
        code: "custom",
        path: ["executionBrief"],
        message: "Briefing de execução obrigatório",
      });
    if (
      v.executionBrief &&
      (v.executionBrief.platform !== v.platform ||
        (v.executionBrief.format === "carousel") !==
          (v.postMode === "carousel"))
    )
      ctx.addIssue({
        code: "custom",
        path: ["executionBrief"],
        message: "Formato/plataforma do briefing divergentes",
      });
  });
export type OrchestratedGenerationInput = z.infer<
  typeof orchestratedGenerationInputSchema
>;

export function normalizeExecutionBrief(
  input: z.infer<typeof executionBriefSchema>
) {
  const brief = executionBriefSchema.parse(input);
  return {
    ...brief,
    slides: (brief.slides ?? [])
      .filter(s => s.rawText.trim())
      .sort((a, b) => a.slideNumber - b.slideNumber)
      .slice(0, 10),
    mustKeep: brief.mustKeep ?? [],
    mustInclude: brief.mustInclude ?? [],
    forbiddenTerms: brief.forbiddenTerms ?? [],
    brandInput: brief.brandInput
      ? { ...brief.brandInput, brandColors: brief.brandInput.brandColors ?? [] }
      : undefined,
  };
}
