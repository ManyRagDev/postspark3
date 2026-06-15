import type {
  CreativeExecutionBrief,
  SiteIntelligence,
} from "@shared/postspark";
import {
  planContentStrategies,
  type ContentStrategyPlan,
} from "./contentStrategy";
import { buildStrategyGenerationContext } from "./postGenerator";

export interface PreparedGenerationPlan {
  strategies: ContentStrategyPlan;
  promptContext: string;
}

export async function prepareGenerationPlan(input: {
  sourceContent: string;
  siteIntelligence?: SiteIntelligence | null;
  executionBrief?: CreativeExecutionBrief | null;
}): Promise<PreparedGenerationPlan> {
  const strategies = await planContentStrategies(input);
  return {
    strategies,
    promptContext: buildStrategyGenerationContext(strategies.selected),
  };
}
