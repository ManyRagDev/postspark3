import type { CompleteDesignVariationV1 } from "./completeDesignGeneration";
import type { OrchestratedGenerationInput } from "./generationRequest";
import { projectContentBody, projectContentHeadline } from "./arsenalContent";
import type { PostVariation } from "./postspark";

/** Compatibility projection for history. Canvas consumes the canonical completeDesignV1. */
export function projectProposalVariation(
  bundle: CompleteDesignVariationV1,
  input: Pick<
    OrchestratedGenerationInput,
    "platform" | "tone" | "creationMode" | "executionBrief"
  >
): PostVariation {
  const first = bundle.slides[0].composition;
  const text =
    Object.values(first.pieces).find(p => p.kind === "text")?.fill ?? "#111111";
  const palette = {
    background: first.base.artboard.background,
    text,
    accent:
      Object.values(first.pieces).find(
        p => p.kind !== "text" && p.fill !== first.base.artboard.background
      )?.fill ?? text,
  };
  return {
    id: `design-${bundle.runId}-${bundle.slot}`,
    completeDesignV1: bundle,
    headline: projectContentHeadline(first.content),
    body: projectContentBody(first.content),
    caption: bundle.caption,
    hashtags: bundle.hashtags,
    callToAction: "",
    tone: input.tone ?? "Profissional",
    imagePrompt: "",
    platform: input.platform,
    postMode: bundle.slides.length > 1 ? "carousel" : "static",
    aspectRatio: first.effectiveAspectRatio,
    layout: "left-aligned",
    backgroundColor: palette.background,
    textColor: palette.text,
    accentColor: palette.accent,
    ...(bundle.slides.length > 1
      ? {
          slides: bundle.slides.map((s, i) => ({
            headline: projectContentHeadline(s.composition.content),
            body: projectContentBody(s.composition.content),
            slideNumber: i + 1,
            isTitleSlide: i === 0,
            isCtaSlide: i === bundle.slides.length - 1,
          })),
        }
      : {}),
    generationMeta: {
      creationMode: input.creationMode,
      fidelity: input.executionBrief ? "high" : "medium",
      interventionLevel: input.executionBrief?.interventionLevel,
      revisionCount: 0,
      revisionApplied: false,
    },
  };
}
