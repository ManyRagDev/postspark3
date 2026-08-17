import type { PostVariation, SiteIntelligence } from "@shared/postspark";
import { applyDeterministicCopyGuards } from "@shared/validation";
import { createPostVisualSnapshot } from "@shared/variationSnapshot";
import { validateVisualFit } from "@shared/visualFit";
import { enforceBrandVisualGuardian } from "./brandVisualGuardian";
import { validateVariationSet } from "./generationValidation";

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
  const tentativeSet = input.candidates.map((candidate, index) =>
    index === input.candidateIndex ? guardedBrand : candidate
  );
  const schemaValidation = validateVariationSet(tentativeSet, input.postMode);
  const errors = [...schemaValidation.errors];

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
