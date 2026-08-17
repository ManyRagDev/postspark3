import type {
  CreativeExecutionBrief,
  SiteIntelligence,
} from "@shared/postspark";

export type ContentObjective =
  | "educate"
  | "authority"
  | "sell"
  | "engage"
  | "lead";

export interface ContentStrategy {
  id: string;
  title: string;
  topic: string;
  objective: ContentObjective;
  audience: string;
  angle:
    | "pain"
    | "benefit"
    | "objection"
    | "authority"
    | "story"
    | "myth"
    | "how-to";
  hook: string;
  promise: string;
  evidenceIds: string[];
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
  candidates: ContentStrategy[];
  selected: ContentStrategy[];
  fallbackUsed: boolean;
}

interface RawStrategy extends Omit<ContentStrategy, "id" | "score"> {}

const ANGLES: ContentStrategy["angle"][] = [
  "pain",
  "benefit",
  "objection",
  "authority",
  "story",
  "myth",
  "how-to",
];

function normalize(value: string): string[] {
  return (
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .match(/[a-z0-9]{3,}/g) ?? []
  );
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
  return (
    executionBrief?.objective ??
    intelligence?.business.goals[0] ??
    "engage"
  );
}

function buildFallbackCandidates(
  sourceContent: string,
  objective: ContentObjective,
  intelligence?: SiteIntelligence | null,
): RawStrategy[] {
  const topics = [
    ...(intelligence?.editorial.priorityTopics ?? []),
    ...(intelligence?.editorial.pillars ?? []),
  ];
  const fallbackTopic =
    intelligence?.business.valueProposition ||
    sourceContent.slice(0, 120) ||
    "tema principal";
  const uniqueTopics = Array.from(new Set(topics.filter(Boolean)));
  const audiences = intelligence?.business.audiences.length
    ? intelligence.business.audiences
    : ["publico principal"];
  const evidenceIds = intelligence?.evidence.map((item) => item.id) ?? [];

  return Array.from({ length: 5 }, (_, index) => {
    const topic = uniqueTopics[index % Math.max(uniqueTopics.length, 1)] || fallbackTopic;
    const angle = ANGLES[index % ANGLES.length];
    return {
      title: `${topic} por ${angle}`,
      topic,
      objective,
      audience: audiences[index % audiences.length],
      angle,
      hook: `${topic}: o ponto que merece atencao agora`,
      promise:
        intelligence?.business.valueProposition ||
        "Entregar uma perspectiva util e acionavel.",
      evidenceIds: evidenceIds.slice(index % 2, index % 2 + 2),
    };
  });
}

function scoreCandidates(
  candidates: RawStrategy[],
  sourceContent: string,
  objective: ContentObjective,
  intelligence?: SiteIntelligence | null,
): ContentStrategy[] {
  const topicReference = [
    sourceContent,
    intelligence?.business.summary ?? "",
    intelligence?.business.valueProposition ?? "",
    ...(intelligence?.editorial.priorityTopics ?? []),
    ...(intelligence?.editorial.pillars ?? []),
  ].join(" ");
  const validEvidence = new Set(
    intelligence?.evidence.map((item) => item.id) ?? [],
  );

  return candidates.map((candidate, index) => {
    const topicRelevance = Math.round(
      Math.min(1, lexicalOverlap(candidate.topic, topicReference) * 1.5) * 100,
    );
    const objectiveAlignment =
      candidate.objective === objective ? 100 : 45;
    const evidenceGrounding = intelligence
      ? candidate.evidenceIds.length === 0
        ? 35
        : Math.round(
            (candidate.evidenceIds.filter((id) => validEvidence.has(id)).length /
              candidate.evidenceIds.length) *
              100,
          )
      : 70;
    const distinctiveness = Math.round(
      (1 -
        Math.max(
          0,
          ...candidates
            .filter((_, otherIndex) => otherIndex !== index)
            .map((other) => lexicalOverlap(candidate.topic, other.topic)),
        )) *
        100,
    );
    const total = Math.round(
      topicRelevance * 0.35 +
        objectiveAlignment * 0.3 +
        evidenceGrounding * 0.25 +
        distinctiveness * 0.1,
    );

    return {
      ...candidate,
      id: `strategy-${index + 1}`,
      score: {
        total,
        topicRelevance,
        objectiveAlignment,
        evidenceGrounding,
        distinctiveness,
      },
    };
  });
}

function selectDistinctStrategies(
  candidates: ContentStrategy[],
): ContentStrategy[] {
  const ranked = [...candidates].sort((a, b) => b.score.total - a.score.total);
  const selected: ContentStrategy[] = [];

  for (const candidate of ranked) {
    const duplicates = selected.some(
      (item) =>
        item.angle === candidate.angle &&
        lexicalOverlap(item.topic, candidate.topic) >= 0.6,
    );
    if (!duplicates) selected.push(candidate);
    if (selected.length === 3) break;
  }

  for (const candidate of ranked) {
    if (selected.length === 3) break;
    if (!selected.some((item) => item.id === candidate.id)) {
      selected.push(candidate);
    }
  }

  return selected;
}

/**
 * SPEC-003/005 — Planejamento determinístico de estratégia (caminho único).
 *
 * A chamada LLM de `content_strategy` saiu do caminho síncrono (SPEC-003) e o
 * caminho LLM foi removido na SPEC-005: o orçamento admite exatamente uma
 * chamada generativa no caminho feliz, e planejamento de estratégia é
 * determinístico. Os candidatos usam inteligência de site real (tópicos,
 * evidências, públicos, proposta de valor) quando disponível.
 */
export function planContentStrategiesDeterministic(input: {
  sourceContent: string;
  siteIntelligence?: SiteIntelligence | null;
  executionBrief?: CreativeExecutionBrief | null;
}): ContentStrategyPlan {
  const objective = resolveObjective(input.siteIntelligence, input.executionBrief);
  const candidates = scoreCandidates(
    buildFallbackCandidates(input.sourceContent, objective, input.siteIntelligence),
    input.sourceContent,
    objective,
    input.siteIntelligence,
  );
  return {
    objective,
    candidates,
    selected: selectDistinctStrategies(candidates),
    fallbackUsed: true,
  };
}
