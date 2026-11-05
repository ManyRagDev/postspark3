import { arsenalHash } from "./arsenalContent";

/** Conservative initial uncertainty band, not a calibrated probability model.
 * A different band requires another pinned protocol; old receipts stay valid. */
export const FAMILY_RECOVERY_POLICY = Object.freeze({
  version: 1 as const,
  maxAttempts: 3,
  minScore: 1,
  normalScore: 2,
  maxConfidence: 0.35,
});
export const FAMILY_RECOVERY_REASON =
  "Composição recuperada após avaliação editorial incerta; o planejamento validou conteúdo, campos e mídia. Encaixe físico e revisão ainda são obrigatórios.";
export type FamilyScore = { id: string; score: number; confidence: number };
export type FamilyPlanFit = { viableSlots: number[]; planHash: string };
export interface FamilyRecoveryReceipt {
  version: 1;
  policyHash: string;
  outcome: "not_needed" | "recovered" | "partial" | "exhausted";
  normalIds: string[];
  baseline: FamilyPlanFit;
  attempts: Array<
    FamilyScore & {
      fit: FamilyPlanFit;
      accepted: boolean;
      reason: "verified_gain" | "no_verified_gain";
    }
  >;
  recoveredIds: string[];
  final: FamilyPlanFit;
}
export const familyRecoveryPolicyHash = () =>
  arsenalHash(FAMILY_RECOVERY_POLICY);
export const effectiveFamilyScore = (r: FamilyScore) =>
  r.score * (0.5 + 0.5 * r.confidence);
export const orderFamilyScores = (a: FamilyScore, b: FamilyScore) =>
  effectiveFamilyScore(b) - effectiveFamilyScore(a) || a.id.localeCompare(b.id);
export const normalFamilyIds = (scores: FamilyScore[]) =>
  [...scores]
    .filter(s => s.score >= 2)
    .sort(orderFamilyScores)
    .slice(0, 12)
    .map(s => s.id);

/** Pure, replayable recovery. The inspector must perform real local planning;
 * no provider call, new family vote, score rewrite or catalogue expansion. */
export function planFamilyRecovery(
  scores: FamilyScore[],
  inspect: (ids: string[]) => FamilyPlanFit
): FamilyRecoveryReceipt {
  const normalIds = normalFamilyIds(scores),
    recoveredIds: string[] = [];
  const verify = (ids: string[]) => {
    const fit = inspect(ids);
    if (
      !/^[a-f0-9]{64}$/.test(fit.planHash) ||
      new Set(fit.viableSlots).size !== fit.viableSlots.length ||
      fit.viableSlots.some(s => ![0, 1, 2].includes(s))
    )
      throw new Error("family_recovery_fit_invalid");
    return fit;
  };
  const baseline = verify(normalIds);
  let current = baseline;
  const attempts: FamilyRecoveryReceipt["attempts"] = [];
  const candidates = [...scores]
    .filter(
      s =>
        s.score >= FAMILY_RECOVERY_POLICY.minScore &&
        s.score < FAMILY_RECOVERY_POLICY.normalScore &&
        s.confidence <= FAMILY_RECOVERY_POLICY.maxConfidence
    )
    .sort(orderFamilyScores);
  for (const candidate of candidates.slice(
    0,
    FAMILY_RECOVERY_POLICY.maxAttempts
  )) {
    if (current.viableSlots.length === 3) break;
    const fit = verify([...normalIds, ...recoveredIds, candidate.id]);
    const accepted =
      fit.viableSlots.length > current.viableSlots.length &&
      current.viableSlots.every(s => fit.viableSlots.includes(s));
    attempts.push({
      ...candidate,
      fit,
      accepted,
      reason: accepted ? "verified_gain" : "no_verified_gain",
    });
    if (accepted) {
      recoveredIds.push(candidate.id);
      current = fit;
    }
  }
  return {
    version: 1,
    policyHash: familyRecoveryPolicyHash(),
    normalIds,
    baseline,
    attempts,
    recoveredIds,
    final: current,
    outcome:
      baseline.viableSlots.length === 3
        ? "not_needed"
        : current.viableSlots.length === 3
          ? "recovered"
          : recoveredIds.length
            ? "partial"
            : "exhausted",
  };
}
