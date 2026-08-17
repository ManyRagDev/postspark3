/**
 * Context briefing types — movidos de shared/highTicket.ts (Fase D).
 *
 * Apenas os tipos consumidos pelos módulos canônicos relocados
 * (contextLoader, contextBudget, intentRouter, slimBriefing). Os tipos
 * específicos do pipeline paralelo removido (HighTicketGraphState,
 * WorkerPayload, QaResult, etc.) não foram portados.
 */
import type {
  DesignTokens,
  CreativeExecutionBrief,
  InputType,
  Platform,
  PostMode,
  SiteIntelligence,
} from "./postspark";

export interface BrandKitContext {
  toneOfVoice?: string;
  formattingRules: string[];
  forbiddenTerms: string[];
  requiredTerms: string[];
  dictionary: Record<string, string>;
  colors: string[];
  fontPrimary?: string;
  fontSecondary?: string;
  visualTokens?: Partial<DesignTokens>;
  fallbackUsed: boolean;
}

export interface PersonaContext {
  audience?: string;
  pains: string[];
  goals: string[];
  languageStyle?: string;
  objections: string[];
  fallbackUsed: boolean;
}

export interface SiteIntelligenceContext {
  siteIntelligenceId?: string;
  summary?: string;
  evidence: Array<{ id: string; text: string; kind?: string }>;
  toneGuidelines: string[];
  prohibitedClaims: string[];
  source?: SiteIntelligence;
  fallbackUsed: boolean;
}

export interface MasterBriefing {
  version: 1;
  userInput: {
    inputType: InputType;
    content: string;
    platform: Platform;
    postMode: PostMode;
    creationMode: "ideation" | "execution";
    executionBrief?: CreativeExecutionBrief;
  };
  brand: BrandKitContext;
  persona: PersonaContext;
  site: SiteIntelligenceContext;
  constraints: {
    forbiddenTerms: string[];
    requiredTerms: string[];
    toneGuidelines: string[];
    formattingRules: string[];
    preferredColors: string[];
    maxHeadlineChars: number;
    maxBodyChars: number;
  };
  compressed: boolean;
  compressionNotes: string[];
  fallbackNotes: string[];
}

export type AngleMechanism =
  | "pain"
  | "benefit"
  | "objection"
  | "authority"
  | "story"
  | "myth"
  | "how-to";

export interface IntentClassification {
  objective: "educate" | "authority" | "sell" | "engage" | "lead";
  confidence: number;
  rationale: string;
}

export interface AngleAssignment {
  angleId: string;
  title: string;
  thesis: string;
  mechanism: AngleMechanism;
  audience: string;
  hook: string;
  promise: string;
  visualDirection: string;
  risks: string[];
}

export interface RouterOutput {
  intent: IntentClassification;
  angles: [AngleAssignment, AngleAssignment, AngleAssignment];
  fallbackUsed: boolean;
}

/**
 * Input para o carregamento de contexto canônico (movido de HighTicketPipelineInput,
 * sem os campos específicos do pipeline paralelo removido).
 */
export interface ContextLoaderInput {
  userUuid: string;
  inputType: InputType;
  content: string;
  platform: Platform;
  postMode: PostMode;
  creationMode: "ideation" | "execution";
  executionBrief?: CreativeExecutionBrief;
  siteIntelligenceId?: string;
}
