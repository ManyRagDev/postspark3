import type { CreativeExecutionBrief, SiteIntelligence } from "@shared/postspark";

export type ContentObjective = "educate" | "authority" | "sell" | "engage" | "lead";
export type EditorialFactPlacement = "headline" | "visible-body" | "carousel" | "caption" | "any";

export interface EditorialSourceFact {
  id: string;
  text: string;
  placement: EditorialFactPlacement;
  required: boolean;
}

export interface EditorialProposition {
  id: string;
  literalClaim: string;
  supportIds: string[];
  readerPayoff?: string;
}

export interface EditorialMeaningPlan {
  objective: ContentObjective;
  audience?: string;
  propositions: EditorialProposition[];
  sourceFacts: EditorialSourceFact[];
  authoritySource?: string;
  semanticVariationBudget: 1 | 2 | 3;
  mustKeep: string[];
}

export interface ContentStrategy {
  id: string;
  title: string;
  topic: string;
  objective: ContentObjective;
  audience: string;
  angle: "pain" | "benefit" | "objection" | "authority" | "story" | "myth" | "how-to";
  hook: string;
  promise: string;
  evidenceIds: string[];
  propositionId?: string;
  literalClaim?: string;
  supportIds?: string[];
  readerPayoff?: string;
  score: {
    total: number;
    topicRelevance: number;
    objectiveAlignment: number;
    evidenceGrounding: number;
    distinctiveness: number;
  };
}

export interface ContentStrategyPlan {
  objective: ContentObjective;
  meaningPlan: EditorialMeaningPlan;
  candidates: ContentStrategy[];
  selected: ContentStrategy[];
  fallbackUsed: boolean;
}

function normalize(value: string): string[] {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/[a-z0-9]{3,}/g) ?? [];
}

function lexicalOverlap(a: string, b: string): number {
  const aSet = new Set(normalize(a));
  const bSet = new Set(normalize(b));
  if (aSet.size === 0 || bSet.size === 0) return 0;
  const intersection = Array.from(aSet).filter((token) => bSet.has(token)).length;
  return intersection / Math.min(aSet.size, bSet.size);
}

function resolveObjective(
  intelligence?: SiteIntelligence | null,
  executionBrief?: CreativeExecutionBrief | null,
): ContentObjective {
  return executionBrief?.objective ?? intelligence?.business.goals[0] ?? "engage";
}

function cleanSourceInstruction(value: string): string {
  return value
    .replace(
      /^(?:eu\s+)?(?:quero|preciso|gostaria|fa[cç]a|crie|gere)\s+(?:um\s+)?(?:post|carrossel|conte[uú]do|pe[cç]a)\s*/i,
      "",
    )
    .replace(/^(?:para\s+)?(?:instagram|linkedin|facebook|twitter|x)?\s*(?:sobre|para|anunciando|anunciar|divulgando|divulgar)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sourceSegments(value: string): string[] {
  const segments = cleanSourceInstruction(value)
    .split(/(?:\r?\n)+|(?<=[.!?;])\s+/)
    .map((item) => item.replace(/^[\s\-\d.)]+/, "").trim())
    .filter((item) => item.length >= 8);
  return Array.from(new Set(segments)).slice(0, 6);
}

function likelyAuthoritySource(value: string): boolean {
  return /\b(?:segundo|conforme|de acordo com|estudo|pesquisa|levantamento|dados de|crm\b|crefito\b|certificad[oa]|especialista|mestre|doutor[ao]?|anos de experi[eê]ncia)\b/i.test(value);
}

function readerPayoffFor(objective: ContentObjective): string {
  if (objective === "sell" || objective === "lead") return "Entender com clareza a oferta, a condição e o próximo passo.";
  if (objective === "educate") return "Sair da leitura com uma explicação ou orientação aplicável.";
  if (objective === "authority") return "Reconhecer competência por precisão e evidência, sem autoridade encenada.";
  return "Entender por que o assunto importa sem precisar reconstruir premissas ausentes.";
}

function buildMeaningPlan(input: {
  sourceContent: string;
  siteIntelligence?: SiteIntelligence | null;
  executionBrief?: CreativeExecutionBrief | null;
}): EditorialMeaningPlan {
  const objective = resolveObjective(input.siteIntelligence, input.executionBrief);
  const segments = sourceSegments(input.executionBrief?.rawInput || input.sourceContent);
  const mustKeep = Array.from(new Set([
    ...(input.executionBrief?.mustKeep ?? []),
    ...(input.executionBrief?.mustInclude ?? []),
  ].map((item) => item.trim()).filter(Boolean)));
  const sourceFacts: EditorialSourceFact[] = [];
  const addFact = (text: string, required: boolean, idPrefix: string) => {
    const normalized = text.trim();
    if (!normalized || sourceFacts.some((item) => item.text.toLowerCase() === normalized.toLowerCase())) return;
    sourceFacts.push({ id: `${idPrefix}-${sourceFacts.length + 1}`, text: normalized, placement: "any", required });
  };

  mustKeep.forEach((text) => addFact(text, true, "brief"));
  segments.forEach((text) => {
    // Texto promocional genérico continua flexível. Valores, prazos e itens
    // fixados pelo briefing são contrato factual duro.
    const isConcrete = /\b\d+(?:[.,]\d+)?\s*(?:%|h|hora|horas|dia|dias|x)?\b/i.test(text);
    addFact(text, isConcrete, "input");
  });
  (input.siteIntelligence?.anchors?.facts ?? []).forEach((fact) => addFact(fact.text, true, "anchor"));
  (input.siteIntelligence?.evidence ?? []).slice(0, 4).forEach((fact) => addFact(fact.text, false, "site"));

  const propositionSources = Array.from(new Set([
    ...segments,
    ...(input.siteIntelligence?.anchors?.facts.map((fact) => fact.text) ?? []),
    input.siteIntelligence?.business.valueProposition ?? "",
    ...(input.siteIntelligence?.editorial.priorityTopics ?? []),
  ].map((item) => item.trim()).filter(Boolean)));
  const semanticVariationBudget = Math.max(1, Math.min(3, propositionSources.length)) as 1 | 2 | 3;
  const fallbackClaim = input.siteIntelligence?.business.valueProposition || cleanSourceInstruction(input.sourceContent) || "O tema informado precisa ser apresentado com clareza";
  const claims = (propositionSources.length ? propositionSources : [fallbackClaim]).slice(0, semanticVariationBudget);
  const propositions = claims.map((literalClaim, index) => ({
    id: `proposition-${index + 1}`,
    literalClaim,
    supportIds: sourceFacts
      .filter((fact) => lexicalOverlap(fact.text, literalClaim) >= 0.25 || fact.required)
      .map((fact) => fact.id),
    readerPayoff: readerPayoffFor(objective),
  }));
  const authoritySource = [...segments, ...(input.siteIntelligence?.evidence.map((item) => item.text) ?? [])].find(likelyAuthoritySource);

  return {
    objective,
    audience: input.siteIntelligence?.business.audiences[0],
    propositions,
    sourceFacts,
    authoritySource,
    semanticVariationBudget,
    mustKeep,
  };
}

function angleFor(objective: ContentObjective, hasAuthoritySource: boolean): ContentStrategy["angle"] {
  if (objective === "authority") return hasAuthoritySource ? "authority" : "benefit";
  if (objective === "educate") return "how-to";
  if (objective === "sell" || objective === "lead") return "benefit";
  return "story";
}

function buildStrategies(
  meaningPlan: EditorialMeaningPlan,
  sourceContent: string,
  intelligence?: SiteIntelligence | null,
): ContentStrategy[] {
  const topicReference = [sourceContent, intelligence?.business.summary ?? "", intelligence?.business.valueProposition ?? ""].join(" ");
  const audience = meaningPlan.audience || "público principal";
  const angle = angleFor(meaningPlan.objective, Boolean(meaningPlan.authoritySource));

  return Array.from({ length: 3 }, (_, index) => {
    const proposition = meaningPlan.propositions[index % meaningPlan.propositions.length];
    const topicRelevance = Math.round(Math.min(1, lexicalOverlap(proposition.literalClaim, topicReference) * 1.5) * 100);
    const evidenceGrounding = proposition.supportIds.length > 0 ? 100 : 70;
    return {
      id: `strategy-${index + 1}`,
      title: `Proposição ${proposition.id.replace("proposition-", "")} · direção visual ${index + 1}`,
      topic: proposition.literalClaim,
      objective: meaningPlan.objective,
      audience,
      angle,
      hook: proposition.literalClaim,
      promise: proposition.readerPayoff ?? "Entregar significado claro e sustentado.",
      evidenceIds: proposition.supportIds,
      propositionId: proposition.id,
      literalClaim: proposition.literalClaim,
      supportIds: proposition.supportIds,
      readerPayoff: proposition.readerPayoff,
      score: {
        total: Math.round(topicRelevance * 0.4 + 30 + evidenceGrounding * 0.3),
        topicRelevance,
        objectiveAlignment: 100,
        evidenceGrounding,
        distinctiveness: meaningPlan.semanticVariationBudget === 1 ? 100 : 80,
      },
    };
  });
}

/** Planejamento semântico determinístico, sem criar uma chamada LLM extra. */
export function planContentStrategiesDeterministic(input: {
  sourceContent: string;
  siteIntelligence?: SiteIntelligence | null;
  executionBrief?: CreativeExecutionBrief | null;
}): ContentStrategyPlan {
  const meaningPlan = buildMeaningPlan(input);
  const candidates = buildStrategies(meaningPlan, input.sourceContent, input.siteIntelligence);
  return {
    objective: meaningPlan.objective,
    meaningPlan,
    candidates,
    selected: candidates,
    fallbackUsed: false,
  };
}
