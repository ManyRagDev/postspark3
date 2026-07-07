import type { AngleAssignment, MasterBriefing, OriginalityResult, WorkerPayload } from "@shared/highTicket";
import { assessSemanticOriginality, persistCandidateFingerprints } from "../semanticOriginality";
import type { PostRecord } from "../../db";
import { mapWorkerPayloadsToPostVariations } from "./finalMapper";
import type { PostVariation } from "@shared/postspark";

export async function assessHighTicketOriginality(input: {
  runId: string;
  userUuid: string;
  briefing: MasterBriefing;
  angles: AngleAssignment[];
  payloads: WorkerPayload[];
  recentPosts: PostRecord[];
}): Promise<OriginalityResult> {
  const candidates = mapWorkerPayloadsToPostVariations({
    payloads: input.payloads,
    angles: input.angles,
    briefing: input.briefing,
    runId: input.runId,
  });
  return assessSemanticOriginality({
    candidates,
    siteIntelligence: input.briefing.site.source ?? null,
    recentPosts: input.recentPosts,
  });
}

export async function persistHighTicketFingerprints(input: {
  runId: string;
  userUuid: string;
  briefing: MasterBriefing;
  angles: AngleAssignment[];
  payloads: WorkerPayload[];
  originality: OriginalityResult;
  variations?: PostVariation[];
}): Promise<void> {
  const candidates = input.variations ?? mapWorkerPayloadsToPostVariations({
    payloads: input.payloads,
    angles: input.angles,
    briefing: input.briefing,
    runId: input.runId,
  });
  await persistCandidateFingerprints({
    userUuid: input.userUuid,
    generationRunId: input.runId,
    candidates,
    embeddings: input.originality.embeddings,
    assessments: input.originality.assessments,
  });
}
