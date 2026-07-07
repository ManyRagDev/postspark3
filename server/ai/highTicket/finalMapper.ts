import type { AngleAssignment, MasterBriefing, WorkerPayload } from "@shared/highTicket";
import type { CopyAngleType, GenerationEvaluationSummary, PostVariation } from "@shared/postspark";
import type { OriginalityAssessment } from "@shared/highTicket";

const mechanismToCopyAngle: Record<AngleAssignment["mechanism"], CopyAngleType> = {
  pain: "dor",
  benefit: "beneficio",
  objection: "objecao",
  authority: "autoridade",
  story: "storytelling",
  myth: "mito_vs_verdade",
  "how-to": "beneficio",
};

export function workerPayloadToPostVariation(input: {
  payload: WorkerPayload;
  angle: AngleAssignment;
  briefing: MasterBriefing;
  index: number;
  runId: string;
  evaluation?: GenerationEvaluationSummary;
  originality?: OriginalityAssessment;
  revisionCount?: number;
  revisionApplied?: boolean;
  revisionFailed?: boolean;
}): PostVariation {
  const { payload, angle, briefing } = input;
  return {
    id: `${input.runId}-${input.index + 1}`,
    headline: payload.copy.headline,
    body: payload.copy.body,
    caption: payload.copy.caption,
    hashtags: payload.copy.hashtags,
    callToAction: payload.copy.callToAction,
    tone: payload.copy.tone,
    platform: briefing.userInput.platform,
    imagePrompt: payload.visual.imagePrompt,
    backgroundColor: payload.visual.backgroundColor,
    textColor: payload.visual.textColor,
    accentColor: payload.visual.accentColor,
    layout: payload.visual.layout,
    aspectRatio: payload.visual.aspectRatio,
    postMode: briefing.userInput.postMode,
    template: payload.visual.template,
    sections: payload.visual.sections,
    slides: payload.visual.slides,
    designTokens: payload.visual.designTokens,
    aspectRatioOptimizations: payload.visual.aspectRatioOptimizations,
    layoutSettingsByAspectRatio: payload.visual.layoutSettingsByAspectRatio,
    copyAngle: {
      type: mechanismToCopyAngle[angle.mechanism],
      label: angle.title,
      badge: angle.mechanism,
      stickerText: angle.mechanism === "objection" ? "Direto" : "Premium",
    },
    generationMeta: {
      creationMode: briefing.userInput.creationMode,
      fidelity: "high",
      interventionLevel: briefing.userInput.executionBrief?.interventionLevel,
      siteIntelligenceId: briefing.site.siteIntelligenceId,
      strategyId: angle.angleId,
      revisionCount: input.revisionCount,
      revisionApplied: input.revisionApplied,
      revisionFailed: input.revisionFailed,
      evaluation: input.evaluation,
      originality: input.originality,
    },
  };
}

export function mapWorkerPayloadsToPostVariations(input: {
  payloads: WorkerPayload[];
  angles: AngleAssignment[];
  briefing: MasterBriefing;
  runId: string;
  evaluations?: GenerationEvaluationSummary[];
  originality?: OriginalityAssessment[];
  revisionCount?: number;
  revisedIndexes?: number[];
  revisionFailedIndexes?: number[];
}): PostVariation[] {
  return input.payloads.map((payload, index) =>
    workerPayloadToPostVariation({
      payload,
      angle: input.angles[index],
      briefing: input.briefing,
      index,
      runId: input.runId,
      evaluation: input.evaluations?.[index],
      originality: input.originality?.[index],
      revisionCount: input.revisionCount,
      revisionApplied: input.revisedIndexes?.includes(index),
      revisionFailed: input.revisionFailedIndexes?.includes(index),
    }),
  );
}
