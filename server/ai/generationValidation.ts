import type { PostVariation } from "@shared/postspark";
import {
  STATIC_SECTION_DESCRIPTION_MAX_LENGTH,
  STATIC_SECTION_LABEL_MAX_LENGTH,
  STATIC_SECTION_TARGET,
  hasCoherentStaticItemCount,
  hasRequiredCopy,
  hasValidStaticSections,
} from "@shared/validation";
import { variationsNeedDiversification } from "./variationDiversity";

export const POST_VARIATION_TARGET = 3;
export const CAROUSEL_SLIDE_TARGET = 5;
export {
  STATIC_SECTION_DESCRIPTION_MAX_LENGTH,
  STATIC_SECTION_LABEL_MAX_LENGTH,
  STATIC_SECTION_TARGET,
  hasCoherentStaticItemCount,
  hasRequiredCopy,
  hasValidStaticSections,
} from "@shared/validation";

export interface VariationSetValidation {
  valid: boolean;
  errors: string[];
}

export function validateVariationSet(
  variations: Partial<PostVariation>[],
  postMode: "static" | "carousel",
): VariationSetValidation {
  const errors: string[] = [];

  if (variations.length !== POST_VARIATION_TARGET) {
    errors.push(
      `expected ${POST_VARIATION_TARGET} variations, received ${variations.length}`,
    );
  }

  variations.forEach((variation, index) => {
    if (!hasRequiredCopy(variation)) {
      errors.push(`variation ${index + 1} is missing required copy fields`);
    }
    if (!variation.copyAngle?.type || !variation.copyAngle.label) {
      errors.push(`variation ${index + 1} is missing a copy angle`);
    }
    if (postMode === "static" && !hasValidStaticSections(variation)) {
      errors.push(
        `variation ${index + 1} must use no sections for simple templates or exactly ${STATIC_SECTION_TARGET} short sections for structured templates`,
      );
    }
    if (postMode === "static" && !hasCoherentStaticItemCount(variation)) {
      errors.push(
        `variation ${index + 1} headline advertises a different item count than its ${STATIC_SECTION_TARGET} structured sections`,
      );
    }
    if (
      postMode === "carousel" &&
      variation.slides?.length !== CAROUSEL_SLIDE_TARGET
    ) {
      errors.push(
        `variation ${index + 1} must contain ${CAROUSEL_SLIDE_TARGET} slides`,
      );
    }
  });

  if (
    variations.length === POST_VARIATION_TARGET &&
    variationsNeedDiversification(variations)
  ) {
    errors.push("variations are not sufficiently distinct");
  }

  return { valid: errors.length === 0, errors };
}

export function assertVariationSet(
  variations: Partial<PostVariation>[],
  postMode: "static" | "carousel",
): void {
  const validation = validateVariationSet(variations, postMode);
  if (!validation.valid) {
    throw new Error(`Invalid variation set: ${validation.errors.join("; ")}`);
  }
}
