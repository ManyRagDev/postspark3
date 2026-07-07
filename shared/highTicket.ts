import type {
  AspectRatio,
  CarouselSlide,
  ContentSection,
  CreativeExecutionBrief,
  DesignTokens,
  GenerationEvaluationSummary,
  InputType,
  Platform,
  PostMode,
  PostVariation,
  SiteIntelligence,
} from "./postspark";

export type HighTicketGraphStatus =
  | "created"
  | "context_loaded"
  | "context_compressed"
  | "routed"
  | "workers_completed"
  | "originality_completed"
  | "qa_completed"
  | "revision_completed"
  | "visual_contract_validated"
  | "caption_synthesized"
  | "mapped"
  | "completed"
  | "failed";

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

export interface WorkerPayload {
  angleId: string;
  copy: {
    headline: string;
    body: string;
    caption: string;
    hashtags: string[];
    callToAction: string;
    tone: string;
  };
  visual: {
    concept: string;
    imagePrompt: string;
    layout: PostVariation["layout"];
    aspectRatio: AspectRatio;
    template?: PostVariation["template"];
    sections?: ContentSection[];
    slides?: CarouselSlide[];
    backgroundColor: string;
    textColor: string;
    accentColor: string;
    designTokens?: Partial<DesignTokens>;
    aspectRatioOptimizations?: PostVariation["aspectRatioOptimizations"];
    layoutSettingsByAspectRatio?: PostVariation["layoutSettingsByAspectRatio"];
  };
}

export interface OriginalityAssessment {
  score: number;
  maxCandidateSimilarity: number;
  maxSiteSimilarity: number;
  maxHistorySimilarity: number;
  closestSource: "candidate" | "site" | "history" | "none";
  fallbackUsed: boolean;
}

export interface OriginalityResult {
  assessments: OriginalityAssessment[];
  embeddings: number[][];
  fallbackUsed: boolean;
}

export interface QaResult {
  angleId: string;
  passed: boolean;
  evaluation: GenerationEvaluationSummary;
  feedback: string[];
}

export interface HighTicketGraphState {
  runId: string;
  status: HighTicketGraphStatus;
  attempt: number;
  input: MasterBriefing["userInput"];
  context?: MasterBriefing;
  routing?: RouterOutput;
  workers: WorkerPayload[];
  originality?: OriginalityResult;
  qa: QaResult[];
  output?: {
    variations: PostVariation[];
  };
  control: {
    maxCorrectionAttempts: number;
    failedReason?: string;
    fallbackToLegacy?: boolean;
  };
  events: Array<{
    at: string;
    status: HighTicketGraphStatus;
    detail: string;
    data?: unknown;
  }>;
}

export interface HighTicketPipelineInput {
  runId: string;
  userUuid: string;
  inputType: InputType;
  content: string;
  platform: Platform;
  postMode: PostMode;
  model?: string;
  creationMode: "ideation" | "execution";
  executionBrief?: CreativeExecutionBrief;
  siteIntelligenceId?: string;
  debug?: boolean;
}

export interface HighTicketPipelineResult {
  generationRunId: string;
  variations: PostVariation[];
  graphState: HighTicketGraphState;
}
