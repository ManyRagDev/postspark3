import type {
  CreativeExecutionBrief,
  SiteIntelligence,
} from "@shared/postspark";
import {
  planContentStrategiesDeterministic,
  type ContentStrategyPlan,
} from "./contentStrategy";
import { buildStrategyGenerationContext } from "./postGenerator";
import type { BriefInterpretation } from "./briefInterpretation";
import { interpretedContent } from "./briefInterpretation";

export interface PreparedGenerationPlan {
  strategies: ContentStrategyPlan;
  promptContext: string;
}

/**
 * SPEC-003 — Prepara o plano de estratégia sem chamada LLM extra: o caminho
 * produtivo usa planejamento determinístico (ver `contentStrategy.ts`). O
 * LLM `content_strategy` não participa mais do caminho síncrono.
 */
export async function prepareGenerationPlan(input: {
  sourceContent: string;
  siteIntelligence?: SiteIntelligence | null;
  executionBrief?: CreativeExecutionBrief | null;
  briefInterpretation?: BriefInterpretation | null;
}): Promise<PreparedGenerationPlan> {
  const strategies = planContentStrategiesDeterministic({
    ...input,
    interpretedContent: interpretedContent(input.briefInterpretation ?? null),
  });
  return {
    strategies,
    promptContext: buildStrategyGenerationContext(strategies.selected, strategies.meaningPlan),
  };
}
