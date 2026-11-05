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
    const selected = new Set([
      ...normalFamilyIds(Array.from(familyScores.values())),
      ...(recovery?.recoveredIds ?? []),
    ]);
    const memberIds = new Set(
      families
        .filter(f => selected.has(f.id))
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
      if (args.sufficient(aggregate())) break;
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
  if (args.recovery) {
    const scores = Array.from(familyScores.values());
    recovery = planFamilyRecovery(scores, ids =>
      args.recovery!.inspect(ids, scores)
    );
  }
  return aggregate();
}
