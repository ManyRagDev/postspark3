import type {
  CreativeExecutionBrief,
  SiteIntelligence,
} from "@shared/postspark";
import {
  planContentStrategiesDeterministic,
  type ContentStrategyPlan,
} from "./contentStrategy";
import { buildStrategyGenerationContext } from "./postGenerator";

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
}): Promise<PreparedGenerationPlan> {
  const strategies = planContentStrategiesDeterministic(input);
  return {
    strategies,
    promptContext: buildStrategyGenerationContext(strategies.selected),
  };
}
