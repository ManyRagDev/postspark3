import { z } from "zod";
import { arsenalHash } from "./arsenalContent";
import {
  assemblyIdentity,
  componentCardV1Schema,
  type ComponentCardV1,
} from "./componentAssembly";
import { narrativeSlideRole } from "./carouselNarrative";
import { carouselVisualContract } from "./carouselVisual";
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const completeDesignOfferV1Schema = z
  .object({
    version: z.literal(1),
    offerId: z.string().uuid(),
    sourceId: z.string().uuid(),
    sourceHash: hash,
    family: z.string().min(1),
    contentMode: z.enum(["compose", "literal"]),
    visualMode: z.enum(["static", "role_variants", "uniform"]),
    slides: z
      .array(
        z
          .object({
            slideIndex: z.number().int().min(0).max(9),
            role: z.enum(["static", "cover", "development", "closing"]),
            componentId: z.string().uuid(),
            componentHash: hash,
            card: componentCardV1Schema,
          })
          .strict()
      )
      .min(1)
      .max(10),
    signature: hash,
  })
  .strict();
export type CompleteDesignOfferV1 = z.infer<typeof completeDesignOfferV1Schema>;
/** Only real, current catalog cards. Status/assets are checked by the catalog reader and hydration. */
export function resolveCompleteDesignOffers(
  cards: ComponentCardV1[],
  input: {
    slideCount: number;
    contentMode: "compose" | "literal";
    instructions?: string;
  }
): CompleteDesignOfferV1[] {
  const count = input.slideCount;
  if (!Number.isInteger(count) || count < 1 || count > 10)
    throw new Error("offer_slide_count_invalid");
  const visualMode =
    count === 1
      ? "static"
      : carouselVisualContract(count, input.instructions)
        ? "role_variants"
        : "uniform";
  const result: CompleteDesignOfferV1[] = [];
  for (const source of cards) {
    if (
      !source.completeDesign?.baselineVerified ||
      source.completeDesign.designGuidance?.carouselVariant ||
      !source.roles.includes(count === 1 ? "static" : "cover")
    )
      continue;
    const sequence: ComponentCardV1[] = [];
    for (let i = 0; i < count; i++) {
      const role = narrativeSlideRole(i, count);
      if (visualMode !== "role_variants" || i === 0) {
        if (!source.roles.includes(role)) break;
        sequence.push(source);
      } else {
        const members = cards.filter(card => {
          const v = card.completeDesign?.designGuidance?.carouselVariant;
          return (
            card.completeDesign?.baselineVerified &&
            card.completeDesign.family === source.completeDesign!.family &&
            card.roles.includes(role) &&
            v?.version === 2 &&
            v.sourceId === source.id &&
            v.sourceHash === source.hash &&
            v.role === role &&
            v.contentMode === input.contentMode
          );
        });
        if (members.length > 1)
          throw new Error("complete_design_variant_ambiguous");
        if (members.length !== 1) break;
        sequence.push(members[0]);
      }
    }
    if (sequence.length !== count) continue;
    const slides = sequence.map((card, slideIndex) => ({
      slideIndex,
      role: narrativeSlideRole(
        slideIndex,
        count
      ) as CompleteDesignOfferV1["slides"][number]["role"],
      componentId: card.id,
      componentHash: card.hash,
      card,
    }));
    const signature = arsenalHash({
      version: 1,
      sourceId: source.id,
      sourceHash: source.hash,
      contentMode: input.contentMode,
      visualMode,
      slides: slides.map(
        ({ slideIndex, role, componentId, componentHash }) => ({
          slideIndex,
          role,
          componentId,
          componentHash,
        })
      ),
    });
    result.push({
      version: 1,
      offerId: assemblyIdentity(["complete-design-offer-v1", signature]),
      sourceId: source.id,
      sourceHash: source.hash,
      family: source.completeDesign.family,
      contentMode: input.contentMode,
      visualMode,
      slides,
      signature,
    });
  }
  return result.sort((a, b) => a.offerId.localeCompare(b.offerId));
}
