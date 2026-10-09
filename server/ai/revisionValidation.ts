import type { PostVariation, SiteIntelligence } from "@shared/postspark";
import { applyDeterministicCopyGuards, hasCoherentStaticItemCount, hasRequiredCopy, hasValidStaticSections } from "@shared/validation";
import { createPostVisualSnapshot } from "@shared/variationSnapshot";
import { validateVisualFit } from "@shared/visualFit";
import { enforceBrandVisualGuardian } from "./brandVisualGuardian";
import { CAROUSEL_SLIDE_TARGET, STATIC_SECTION_TARGET } from "./generationValidation";

export interface RevisionValidationResult<T extends PostVariation> {
  candidate: T;
  errors: string[];
}

export function validateRevisedCandidate<T extends PostVariation>(input: {
  candidate: T;
  candidateIndex: number;
  candidates: T[];
  postMode: "static" | "carousel";
  siteIntelligence?: SiteIntelligence | null;
}): RevisionValidationResult<T> {
  const guardedCopy = applyDeterministicCopyGuards(input.candidate);
  const guardedBrand = input.siteIntelligence
    ? enforceBrandVisualGuardian(
        [guardedCopy],
        input.siteIntelligence,
        { enforcePalette: true, backgroundSnapTolerance: 40 },
      )[0] as T
    : guardedCopy;
  // Um reparo de slot não depende do estado dos outros slots ainda não reparados.
  const errors: string[] = [];
  if (!hasRequiredCopy(guardedBrand)) errors.push(`variation ${input.candidateIndex + 1} is missing required copy fields`);
  if (!guardedBrand.copyAngle?.type || !guardedBrand.copyAngle.label) errors.push(`variation ${input.candidateIndex + 1} is missing a copy angle`);
  if (input.postMode === "static" && !hasValidStaticSections(guardedBrand)) errors.push(`variation ${input.candidateIndex + 1} must use no sections for simple templates or exactly ${STATIC_SECTION_TARGET} short sections for structured templates`);
  if (input.postMode === "static" && !hasCoherentStaticItemCount(guardedBrand)) errors.push(`variation ${input.candidateIndex + 1} headline advertises a different item count than its ${STATIC_SECTION_TARGET} structured sections`);
  if (input.postMode === "carousel" && guardedBrand.slides?.length !== CAROUSEL_SLIDE_TARGET) errors.push(`variation ${input.candidateIndex + 1} must contain ${CAROUSEL_SLIDE_TARGET} slides`);

  try {
    const snapshot = createPostVisualSnapshot(
      guardedBrand,
      guardedBrand.aspectRatio ?? "1:1",
    );
    const visualFit = validateVisualFit(snapshot);
    errors.push(
      ...visualFit.issues.map((issue) =>
        `variation ${input.candidateIndex + 1} ${issue.type}: ${issue.detail}`
      ),
    );
  } catch (error) {
    errors.push(
      `variation ${input.candidateIndex + 1} could not produce a valid visual snapshot: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  return { candidate: guardedBrand, errors: Array.from(new Set(errors)) };
}
