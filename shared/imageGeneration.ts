/** Contexto visual opcional enviado pelo CanvasLab ao gerar um fundo. */
import { aspectRatioDimensions, storedAspectRatios } from "./aspectRatios";
import { z } from "zod";
export const imageAspectRatios = storedAspectRatios;
export type ImageAspectRatio = (typeof imageAspectRatios)[number];

export const imageDirectionSchema = z.enum(["subject", "context", "conceptual", "custom"]);
export type ImageDirection = z.infer<typeof imageDirectionSchema>;

/** Shared client/server contract for optional context sent with image generation. */
export const imagePostContextSchema = z.object({
  headline: z.string().max(180).optional(),
  body: z.string().max(500).optional(),
  caption: z.string().max(1500).optional(),
  familyName: z.string().max(80).optional(),
  backgroundColor: z.string().max(20).optional(),
  accentColor: z.string().max(20).optional(),
  /** Soft composition hint; never a mandatory mask or empty crop region. */
  copySpace: z.string().max(400).optional(),
  /** Freeform art direction, kept short and subordinate to the selected scene. */
  compositionGuidance: z.string().max(1200).optional(),
  imageDirection: imageDirectionSchema.optional(),
});
export type ImagePostContext = z.infer<typeof imagePostContextSchema>;

export const imageDimensions = aspectRatioDimensions;

/** Current portrait is native 4:5. Historical 5:6 retains its closest provider ratio. */
export const openRouterImageRatio: Record<
  ImageAspectRatio,
  "1:1" | "4:5" | "9:16"
> = {
  "1:1": "1:1",
  "4:5": "4:5",
  "5:6": "4:5",
  "9:16": "9:16",
};

function short(value: string | undefined, limit: number): string {
  return (value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

/**
 * O imagePrompt continua sendo a cena proposta. O texto final do post serve
 * como âncora de significado no instante da geração, sem criar outra chamada
 * de LLM nem alterar a copy autoritativa do CanvasPostModel.
 */
export function buildImageGenerationPrompt(
  prompt: string,
  context?: ImagePostContext
): string {
  const scene = short(prompt, 2000);
  if (!context) return scene;

  const headline = short(context.headline, 180);
  const body = short(context.body, 500);
  const caption = short(context.caption, 350);
  const family = short(context.familyName, 80);
  const background = short(context.backgroundColor, 20);
  const accent = short(context.accentColor, 20);
  const copySpace = short(context.copySpace, 400);
  const compositionGuidance = short(context.compositionGuidance, 1200);

  const meaning = [
    headline && `Headline: ${headline}`,
    body && `Visible message: ${body}`,
    caption && `Caption context: ${caption}`,
  ].filter(Boolean);
  const artDirection = [
    family && `Visual direction: ${family}`,
    background && `Base color: ${background}`,
    accent && `Accent color: ${accent}`,
    copySpace && `Optional copy placement suggestion: ${copySpace}`,
    compositionGuidance && `Optional composition guidance: ${compositionGuidance}`,
  ].filter(Boolean);

  if (meaning.length === 0 && artDirection.length === 0 && !context.imageDirection) return scene;

  return [
    `User-selected scene and primary visual intent: ${scene}`,
    "Keep this scene recognizable and visually dominant, preserving its requested placement. Post text is supporting context; do not replace the selected scene with an unrequested chart, infographic, object or metaphor. Conceptual imagery and charts are welcome when the selected direction asks for them.",
    ...(meaning.length > 0 ? ["Supporting post context:", ...meaning] : []),
    ...artDirection,
    context.imageDirection === "subject"
      ? "Emphasize the selected subject clearly."
      : context.imageDirection === "context"
        ? "Emphasize the relevant environment, circumstances, people or activity around the selected scene. Include buying or marketplace details only when they fit that scene."
        : context.imageDirection === "conceptual"
          ? "A conceptual treatment is welcome when it serves the selected scene; keep the scene recognizable and do not substitute a generic metaphor."
          : context.imageDirection === "custom"
            ? "Follow the user's selected custom visual direction as the primary art direction."
            : "Follow the selected scene as the primary visual direction.",
    "Composition guidance and copy-space notes are soft suggestions only. Do not treat them as masks, mandatory blank bands, forbidden areas or crop zones. Compose a coherent image; keep important content comfortably within the requested canvas when practical.",
    "Use supporting post context, visual direction and colors only to refine the selected scene. Do not invent a specific product category, profession, person or location when the supplied scene and post speak generally. Avoid unrelated stock imagery and decorative symbols. Do not put the post's words inside the image.",
  ].join("\n");
}
