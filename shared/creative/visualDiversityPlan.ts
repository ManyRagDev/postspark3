import type { DesignTokens, PostVariation } from "../postspark";
import { composeVariation } from "./compose";
import { creativeCellOf, directCreative } from "./directCreative";
import { FAMILIES } from "./families";
import { hashString } from "./seed";

export interface VisualDiversitySlot {
  id: string;
  familyId?: string;
  cell?: string;
  layout?: PostVariation["layout"];
}

export interface VisualDiversityPlan {
  slots: VisualDiversitySlot[];
  layouts: string[];
  familyIds: string[];
  cells: string[];
  recompositionAttempts: number;
  issues: string[];
}

export interface VisualDiversityPlanResult {
  variations: PostVariation[];
  plan: VisualDiversityPlan;
}

/**
 * Post-composition invariants. They deliberately only apply when every item
 * has a creative direction: raw LLM candidates are validated by the existing
 * lexical guard, while this guard owns the final rendered composition set.
 */
export function visualDiversityIssues(
  variations: Array<Partial<PostVariation>>,
): string[] {
  if (variations.length < 2 || !variations.every((variation) => variation.creativeDirection?.familyId)) {
    return [];
  }

  const layouts = new Set(variations.map((variation) => variation.layout).filter(Boolean));
  const familyIds = new Set(variations.map((variation) => variation.creativeDirection?.familyId).filter(Boolean));
  const cells = new Set(
    variations
      .map((variation) => FAMILIES.find((family) => family.id === variation.creativeDirection?.familyId))
      .filter(Boolean)
      .map((family) => creativeCellOf(family!)),
  );
  const issues: string[] = [];

  if (layouts.size < 2) issues.push("visual diversity requires at least two composed layouts");
  if (familyIds.size < 2) issues.push("visual diversity requires at least two creative families");
  if (cells.size < 2) issues.push("visual diversity requires at least two composition cells");
  return issues;
}

function cloneForComposition(
  variation: PostVariation,
  creativeDirection: NonNullable<PostVariation["creativeDirection"]>,
): PostVariation {
  return {
    ...variation,
    copyAngle: variation.copyAngle ? { ...variation.copyAngle } : variation.copyAngle,
    creativeDirection: {
      ...creativeDirection,
      hiddenOrnaments: creativeDirection.hiddenOrnaments
        ? { ...creativeDirection.hiddenOrnaments }
        : undefined,
    },
  };
}

/**
 * Selects and composes each slot sequentially. Candidate scoring is based on
 * the family output (the effective layout), which is the only layout the
 * renderer will receive. No LLM copy is rewritten as part of this correction.
 */
export function composeVisualDiversityPlan(
  variations: PostVariation[],
  brandTokens: DesignTokens,
  options: { brandLocked?: boolean } = {},
): VisualDiversityPlanResult {
  const composed: PostVariation[] = [];
  const usedFamilyIds: string[] = [];
  const usedLayouts = new Set<string>();
  const usedCells = new Set<string>();
  let recompositionAttempts = 0;

  for (const variation of variations) {
    let best: PostVariation | undefined;
    let bestScore = -1;

    // A bounded deterministic search allows the family output to decide the
    // result and still makes retries reproducible for a trace/replay.
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const seed = hashString(`${variation.id}:visual-diversity:${attempt}`);
      // SPEC-002: `creativeIntent` nunca é produzido em nenhum ponto ativo
      // do código — era lido via `as any` sem nada popular o campo.
      const creativeDirection = directCreative(
        variation,
        null,
        seed,
        { excludeFamilyIds: usedFamilyIds, brandLocked: options.brandLocked },
      );
      const candidate = composeVariation(
        cloneForComposition(variation, creativeDirection),
        brandTokens,
      );
      const family = FAMILIES.find((item) => item.id === creativeDirection.familyId);
      const cell = family ? creativeCellOf(family) : "unknown";
      const score =
        (usedLayouts.has(candidate.layout) ? 0 : 4) +
        (usedFamilyIds.includes(creativeDirection.familyId) ? 0 : 2) +
        (usedCells.has(cell) ? 0 : 1);

      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
      if (score === 7) break;
    }

    // directCreative always has a deterministic fallback; this guard protects
    // the contract if a future family registry becomes empty.
    if (!best) {
      best = composeVariation(variation, brandTokens, { brandLocked: options.brandLocked });
    }

    const familyId = best.creativeDirection?.familyId;
    const family = FAMILIES.find((item) => item.id === familyId);
    const cell = family ? creativeCellOf(family) : undefined;
    if (composed.length > 0) recompositionAttempts += 1;
    composed.push(best);
    if (familyId) usedFamilyIds.push(familyId);
    if (best.layout) usedLayouts.add(best.layout);
    if (cell) usedCells.add(cell);
  }

  const issues = visualDiversityIssues(composed);
  return {
    variations: composed,
    plan: {
      slots: composed.map((variation) => {
        const familyId = variation.creativeDirection?.familyId;
        const family = FAMILIES.find((item) => item.id === familyId);
        return {
          id: variation.id,
          familyId,
          cell: family ? creativeCellOf(family) : undefined,
          layout: variation.layout,
        };
      }),
      layouts: Array.from(usedLayouts),
      familyIds: Array.from(new Set(usedFamilyIds)),
      cells: Array.from(usedCells),
      recompositionAttempts,
      issues,
    },
  };
}
