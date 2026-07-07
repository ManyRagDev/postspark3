import type { MasterBriefing } from "@shared/highTicket";

export interface SlimBriefing {
  brand?: {
    toneOfVoice?: string;
    formattingRules: string[];
    dictionary: Record<string, string>;
    fontPrimary?: string;
    visualTokens?: MasterBriefing["brand"]["visualTokens"];
  };
  persona?: {
    audience?: string;
    pains: string[];
    goals: string[];
    languageStyle?: string;
    objections: string[];
  };
  constraints?: {
    forbiddenTerms: string[];
    requiredTerms: string[];
    toneGuidelines: string[];
    formattingRules: string[];
    preferredColors: string[];
    maxHeadlineChars: number;
    maxBodyChars: number;
  };
  userInput?: {
    postMode: MasterBriefing["userInput"]["postMode"];
    platform: MasterBriefing["userInput"]["platform"];
    creationMode: MasterBriefing["userInput"]["creationMode"];
    executionBrief?: MasterBriefing["userInput"]["executionBrief"];
  };
  site?: {
    summary?: string;
    evidence: Array<{ id: string; text: string }>;
    toneGuidelines: string[];
  };
}

export function slimBriefingForWorker(briefing: MasterBriefing): SlimBriefing {
  return {
    brand: {
      toneOfVoice: briefing.brand.toneOfVoice,
      formattingRules: briefing.brand.formattingRules,
      dictionary: briefing.brand.dictionary,
      fontPrimary: briefing.brand.fontPrimary,
      visualTokens: briefing.brand.visualTokens,
    },
    persona: {
      audience: briefing.persona.audience,
      pains: briefing.persona.pains,
      goals: briefing.persona.goals,
      languageStyle: briefing.persona.languageStyle,
      objections: briefing.persona.objections,
    },
    constraints: briefing.constraints,
    userInput: {
      postMode: briefing.userInput.postMode,
      platform: briefing.userInput.platform,
      creationMode: briefing.userInput.creationMode,
      executionBrief: briefing.userInput.executionBrief,
    },
    site: {
      summary: briefing.site.summary,
      evidence: briefing.site.evidence.slice(0, 8).map((item) => ({ id: item.id, text: item.text })),
      toneGuidelines: briefing.site.toneGuidelines.slice(0, 5),
    },
  };
}
