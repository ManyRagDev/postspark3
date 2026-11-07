import {familyTie} from "@shared/familyNeutrality";
import { arsenalHash } from "@shared/arsenalContent";
import type { FamilySelectionCandidate } from "@shared/designFamilySelection";
import type { FamilyRetrievalReceipt } from "@shared/familyRetrieval";
import { FAMILY_RETRIEVAL_POLICY as policy } from "@shared/familyRetrieval";
import type {
  DesignShortlistInput,
  DesignShortlistResult,
} from "./designShortlist";
import { shortlistDesignFamilies } from "./familyShortlist";
import type { GenerationPlanningReceipt } from "@shared/generationPlan";
import {
  planFamilyRecovery,
  normalFamilyIds,
  type FamilyPlanFit,
  type FamilyScore,
  effectiveFamilyScore,
} from "@shared/familyRecovery";

type Result = DesignShortlistResult & {
  familyElection: NonNullable<GenerationPlanningReceipt["familyElection"]>;
};
/** At most two disjoint provider waves. Every family without a provider answer
 * remains unassessed, never assigned a fabricated score or permanent rejection. */
export async function boundedFamilyShortlist(args: {
  input: DesignShortlistInput;
  families: FamilySelectionCandidate[];
  retrieval: FamilyRetrievalReceipt;
  shortlist: (input: DesignShortlistInput) => Promise<DesignShortlistResult>;
  sufficient: (result: Result) => boolean;
  recovery?: {
    inspect: (ids: string[], scores: FamilyScore[]) => FamilyPlanFit;
  };
}): Promise<Result> {
  const { input, families, shortlist } = args;
  const retrieval = structuredClone(args.retrieval);
  const automatic = Boolean(retrieval.semanticRetrieval);
  const tie=retrieval.neutrality ? (id:string)=>familyTie(retrieval.neutrality!.seed,families.find(f=>f.id===id)!.family) : undefined;
  const budget = {
    maxRequestBytes: policy.maxRequestBytes,
    maxTotalRequestBytes: policy.maxTotalRequestBytes,
    maxBatches: policy.maxBatches,
    usedBytes: 0,
    usedBatches: 0,
    largestRequestBytes: 0,
  };
  const evaluated: DesignShortlistResult["evaluated"] = [];
  const familyScores = new Map<
    string,
    { id: string; score: number; confidence: number }
  >();
  let inputTokens = 0,
    outputTokens = 0,
    costUsd = 0;
  let recovery: ReturnType<typeof planFamilyRecovery> | undefined;
  const aggregate = (): Result => {
    const ranked = Array.from(familyScores.values()).sort((a,b) => effectiveFamilyScore(b)-effectiveFamilyScore(a) ||
      (tie ? tie(a.id).localeCompare(tie(b.id)) : a.id.localeCompare(b.id)));
    const selected = new Set([
      ...(automatic ? ranked.slice(0,12).map(r => r.id) : normalFamilyIds(Array.from(familyScores.values()),tie)),
      ...(recovery?.recoveredIds ?? []),
    ]);
    const memberIds = new Set(
      families
        // Automatic judgments rank continuously. All assessed families remain
        // available for local technical fallback, including a score of zero.
        .filter(f => automatic ? familyScores.has(f.id) : selected.has(f.id))
        .flatMap(f => f.repertoires.map(r => r.defaultOffer.offerId))
    );
    retrieval.transport = {
      batches: budget.usedBatches,
      bytes: budget.usedBytes,
      largestRequestBytes: budget.largestRequestBytes,
    };
    return {
      cards: input.cards.filter(c => memberIds.has(c.id)),
      evaluated,
      batches: budget.usedBatches,
      inputTokens,
      outputTokens,
      costUsd,
      familyElection: {
        version: args.recovery ? 3 : 2,
        ...(recovery ? { recovery } : {}),
        candidates: families.map(f => ({
          id: f.id,
          family: f.family,
          signature: f.signature,
          profileHash: arsenalHash(f.profile),
          memberIds: f.repertoires.map(r => r.defaultOffer.offerId),
        })),
        ranking: Array.from(familyScores.values()),
        shortlistedIds: Array.from(selected),
        retrieval: structuredClone(retrieval),
      },
    };
  };
  for (const [wave, ids] of Array.from(
    [retrieval.initialIds, retrieval.additionalIds].entries()
  )) {
    if (!ids.length) continue;
    if (wave === 1) {
      if (automatic) {
        // A style preference or low provider score is not evidence that the
        // catalogue cannot implement the content. Only local structural fit
        // over ALL judged families can justify buying the second bounded wave.
        if (!args.recovery) break;
        const checkedIds = Array.from(familyScores.keys());
        const fit = args.recovery.inspect(checkedIds, Array.from(familyScores.values()));
        if (!/^[a-f0-9]{64}$/.test(fit.planHash) || new Set(fit.viableSlots).size !== fit.viableSlots.length ||
            fit.viableSlots.some(s => ![0,1,2].includes(s))) throw new Error("family_recovery_fit_invalid");
        retrieval.semanticRetrieval!.technicalFit = {checkedFamilyIds: checkedIds, ...fit};
        if (fit.viableSlots.length === 3) break;
      } else if (args.sufficient(aggregate())) break;
      retrieval.expanded = true;
    }
    const set = new Set(ids),
      subset = families.filter(f => set.has(f.id));
    if (subset.length !== ids.length || ids.some(id => familyScores.has(id)))
      throw new Error("family_retrieval_wave_invalid");
    const members = new Set(
      subset.flatMap(f => f.repertoires.map(r => r.defaultOffer.offerId))
    );
    const result = await shortlistDesignFamilies(
      {
        ...input,
        cards: input.cards.filter(c => members.has(c.id)),
        transportBudget: budget,
      },
      subset,
      shortlist
    );
    evaluated.push(...result.evaluated);
    for (const score of result.familyElection.ranking)
      familyScores.set(score.id, score);
    inputTokens += result.inputTokens;
    outputTokens += result.outputTokens;
    costUsd += result.costUsd;
  }
  if (args.recovery && !automatic) {
    const scores = Array.from(familyScores.values());
    recovery = planFamilyRecovery(scores, ids =>
      args.recovery!.inspect(ids, scores), tie
    );
  }
  return aggregate();
}
