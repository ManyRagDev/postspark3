import { arsenalHash } from "./arsenalContent";
import { assemblyIdentity, type ComponentCardV1 } from "./componentAssembly";
import {
  completeDesignOfferV1Schema,
  type CompleteDesignOfferV1,
} from "./completeDesignOffers";
import { narrativeSlideRole } from "./carouselNarrative";
import { carouselVisualContract } from "./carouselVisual";

export interface DesignFamilyRepertoire {
  version: 1;
  sourceId: string;
  sourceHash: string;
  family: string;
  contentMode: "compose" | "literal";
  visualMode: CompleteDesignOfferV1["visualMode"];
  slides: Array<{
    slideIndex: number;
    role: CompleteDesignOfferV1["slides"][number]["role"];
    variants: ComponentCardV1[];
  }>;
  /** Stable candidate identity includes every offered alternative. It is not an executable sequence. */
  signature: string;
  defaultOffer: CompleteDesignOfferV1;
}

type RepertoireCore = Omit<DesignFamilyRepertoire, "defaultOffer">;

/** No content estimates are admission gates. Hydration remains responsible for asset availability. */
export function materializeDesignFamilyOffer(
  repertoire: RepertoireCore,
  componentIds: readonly string[]
): CompleteDesignOfferV1 {
  if (
    componentIds.length !== repertoire.slides.length ||
    componentIds.length < 1 ||
    componentIds.length > 10
  )
    throw new Error("repertoire_sequence_length_invalid");
  const slides = repertoire.slides.map((slide, index) => {
    if (
      slide.slideIndex !== index ||
      slide.role !== narrativeSlideRole(index, componentIds.length)
    )
      throw new Error("repertoire_sequence_role_invalid");
    const alternatives = slide.variants.filter(
      c => c.id === componentIds[index]
    );
    if (alternatives.length !== 1)
      throw new Error("repertoire_variant_not_offered");
    const card = alternatives[0],
      variant = card.completeDesign?.designGuidance?.carouselVariant;
    if (
      !card.completeDesign?.baselineVerified ||
      card.completeDesign.family !== repertoire.family ||
      !card.roles.includes(slide.role)
    )
      throw new Error("repertoire_variant_contract_invalid");
    if (index === 0 || repertoire.visualMode !== "role_variants") {
      if (
        card.id !== repertoire.sourceId ||
        card.hash !== repertoire.sourceHash ||
        variant
      )
        throw new Error("repertoire_source_hash_mismatch");
    } else if (
      !variant ||
      variant.version < 2 ||
      variant.sourceId !== repertoire.sourceId ||
      variant.sourceHash !== repertoire.sourceHash ||
      variant.role !== slide.role ||
      !("contentMode" in variant) ||
      variant.contentMode !== repertoire.contentMode
    ) {
      throw new Error("repertoire_variant_provenance_mismatch");
    }
    return {
      slideIndex: index,
      role: slide.role,
      componentId: card.id,
      componentHash: card.hash,
      card,
    };
  });
  if (
    !slides[0].card.aspectRatios.some(aspect =>
      slides.every(s => s.card.aspectRatios.includes(aspect))
    )
  )
    throw new Error("repertoire_aspect_incompatible");
  for (const slide of slides.slice(1))
    for (const slot of slides[0].card.mediaSlots) {
      if (
        !slide.card.mediaSlots.some(
          s =>
            s.id === slot.id &&
            s.deferred === slot.deferred &&
            s.policy === slot.policy
        )
      )
        throw new Error("repertoire_media_contract_mismatch");
    }
  const basis = {
    version: 1 as const,
    sourceId: repertoire.sourceId,
    sourceHash: repertoire.sourceHash,
    family: repertoire.family,
    contentMode: repertoire.contentMode,
    visualMode: repertoire.visualMode,
  };
  const signature = arsenalHash({
    ...basis,
    slides: slides.map(({ card: _card, ...slide }) => slide),
  });
  return completeDesignOfferV1Schema.parse({
    ...basis,
    offerId: assemblyIdentity(["complete-design-offer-v1", signature]),
    slides,
    signature,
  });
}

/** Linear size: roles reference alternatives; no enumeration of their Cartesian product. */
export function resolveDesignFamilyRepertoires(
  cards: ComponentCardV1[],
  input: {
    slideCount: number;
    contentMode: "compose" | "literal";
    instructions?: string;
  }
): DesignFamilyRepertoire[] {
  const count = input.slideCount;
  if (!Number.isInteger(count) || count < 1 || count > 10)
    throw new Error("offer_slide_count_invalid");
  const visualMode =
    count === 1
      ? "static"
      : carouselVisualContract(count, input.instructions)
        ? "role_variants"
        : "uniform";
  const result: DesignFamilyRepertoire[] = [];
  for (const source of cards) {
    if (
      !source.completeDesign?.baselineVerified ||
      source.completeDesign.designGuidance?.carouselVariant ||
      !source.roles.includes(count === 1 ? "static" : "cover")
    )
      continue;
    const slides = Array.from({ length: count }, (_, slideIndex) => {
      const role = narrativeSlideRole(
        slideIndex,
        count
      ) as CompleteDesignOfferV1["slides"][number]["role"];
      let variants =
        visualMode !== "role_variants" || slideIndex === 0
          ? source.roles.includes(role)
            ? [source]
            : []
          : cards.filter(card => {
              const v = card.completeDesign?.designGuidance?.carouselVariant;
              return (
                card.completeDesign?.baselineVerified &&
                card.completeDesign.family === source.completeDesign!.family &&
                card.roles.includes(role) &&
                v &&
                v.version >= 2 &&
                v.sourceId === source.id &&
                v.sourceHash === source.hash &&
                v.role === role &&
                "contentMode" in v &&
                v.contentMode === input.contentMode
              );
            });
      // A curated v3 repertoire supersedes the generic v2 child for new requests only.
      if (
        variants.some(
          c => c.completeDesign?.designGuidance?.carouselVariant?.version === 3
        )
      )
        variants = variants.filter(
          c => c.completeDesign?.designGuidance?.carouselVariant?.version === 3
        );
      return {
        slideIndex,
        role,
        variants: variants.slice().sort((a, b) => a.id.localeCompare(b.id)),
      };
    });
    if (slides.some(s => !s.variants.length)) continue;
    const signature = arsenalHash({
      sourceId: source.id,
      sourceHash: source.hash,
      contentMode: input.contentMode,
      visualMode,
      slides: slides.map(s => ({
        role: s.role,
        variants: s.variants.map(c => [c.id, c.hash]),
      })),
    });
    const core: RepertoireCore = {
      version: 1,
      sourceId: source.id,
      sourceHash: source.hash,
      family: source.completeDesign.family,
      contentMode: input.contentMode,
      visualMode,
      slides,
      signature,
    };
    const defaultOffer = materializeDesignFamilyOffer(
      core,
      slides.map(s => s.variants[0].id)
    );
    // Candidate identity changes if the repertoire changes, even if the representative sequence does not.
    defaultOffer.offerId = assemblyIdentity([
      "design-family-repertoire-v1",
      signature,
    ]);
    result.push({ ...core, defaultOffer });
  }
  return result.sort((a, b) =>
    a.defaultOffer.offerId.localeCompare(b.defaultOffer.offerId)
  );
}
