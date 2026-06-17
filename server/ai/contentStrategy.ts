import type {
  CreativeExecutionBrief,
  SiteIntelligence,
} from "@shared/postspark";
import { invokeLLM } from "../_core/llm";
import { ENV } from "../_core/env";

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

function parseResponse(content: unknown): RawStrategy[] {
  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content
            .filter(
              (part): part is { type: "text"; text: string } =>
                Boolean(part) &&
                typeof part === "object" &&
                "type" in part &&
                part.type === "text" &&
                "text" in part,
            )
            .map((part) => part.text)
            .join("\n")
        : "";
  const parsed = JSON.parse(text) as { strategies?: RawStrategy[] };
  return Array.isArray(parsed.strategies) ? parsed.strategies.slice(0, 5) : [];
}

async function generateCandidates(
  sourceContent: string,
  objective: ContentObjective,
  intelligence?: SiteIntelligence | null,
  executionBrief?: CreativeExecutionBrief | null,
): Promise<{ candidates: RawStrategy[]; fallbackUsed: boolean }> {
  if (!ENV.aiContentStrategyEnabled) {
    return {
      candidates: buildFallbackCandidates(sourceContent, objective, intelligence),
      fallbackUsed: true,
    };
  }

  const evidence = intelligence?.evidence
    .map((item) => `[${item.id}] ${item.text}`)
    .join("\n")
    .slice(0, 18_000);
  const context = intelligence
    ? `Negocio: ${intelligence.business.summary}
Proposta de valor: ${intelligence.business.valueProposition}
Publicos: ${intelligence.business.audiences.join("; ")}
Problemas: ${intelligence.business.audienceProblems.join("; ")}
Pilares: ${intelligence.editorial.pillars.join("; ")}
Temas prioritarios: ${intelligence.editorial.priorityTopics.join("; ")}
Evidencias:
${evidence}`
    : `Conteudo fornecido:\n${sourceContent.slice(0, 18_000)}`;

  try {
    const response = await invokeLLM({
      traceLabel: "content_strategy",
      taskRoute: "content_strategy",
      maxCompletionTokens: 1024,
      messages: [
        {
          role: "system",
          content: `Voce e um estrategista editorial. Proponha exatamente 5 estrategias de post diferentes.
Cada estrategia deve ser relevante ao contexto, servir ao objetivo informado e citar apenas evidenceIds existentes.
Nao escreva o post final. Nao invente fatos. Varie topico, angulo e promessa.
Em modo execution, preserve a intencao do briefing e varie somente a abordagem permitida.`,
        },
        {
          role: "user",
          content: `Objetivo: ${objective}
Modo: ${executionBrief ? "execution" : "ideation"}
${executionBrief ? `Briefing: ${executionBrief.rawInput}` : ""}

${context}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "content_strategies",
          strict: true,
          schema: {
            type: "object",
            properties: {
              strategies: {
                type: "array",
                minItems: 5,
                maxItems: 5,
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    topic: { type: "string" },
                    objective: {
                      type: "string",
                      enum: ["educate", "authority", "sell", "engage", "lead"],
                    },
                    audience: { type: "string" },
                    angle: {
                      type: "string",
                      enum: [
                        "pain",
                        "benefit",
                        "objection",
                        "authority",
                        "story",
                        "myth",
                        "how-to",
                      ],
                    },
                    hook: { type: "string" },
                    promise: { type: "string" },
                    evidenceIds: {
                      type: "array",
                      items: { type: "string" },
                    },
                  },
                  required: [
                    "title",
                    "topic",
                    "objective",
                    "audience",
                    "angle",
                    "hook",
                    "promise",
                    "evidenceIds",
                  ],
                  additionalProperties: false,
                },
              },
            },
            required: ["strategies"],
            additionalProperties: false,
          },
        },
      },
    });
    const candidates = parseResponse(response.choices[0]?.message?.content);
    if (candidates.length === 5) {
      return { candidates, fallbackUsed: false };
    }
  } catch (error) {
    console.warn("[contentStrategy] Candidate generation failed:", error);
  }

  return {
    candidates: buildFallbackCandidates(sourceContent, objective, intelligence),
    fallbackUsed: true,
  };
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

export async function planContentStrategies(input: {
  sourceContent: string;
  siteIntelligence?: SiteIntelligence | null;
  executionBrief?: CreativeExecutionBrief | null;
}): Promise<ContentStrategyPlan> {
  const objective = resolveObjective(
    input.siteIntelligence,
    input.executionBrief,
  );
  const generated = await generateCandidates(
    input.sourceContent,
    objective,
    input.siteIntelligence,
    input.executionBrief,
  );
  const candidates = scoreCandidates(
    generated.candidates,
    input.sourceContent,
    objective,
    input.siteIntelligence,
  );

  return {
    objective,
    candidates,
    selected: selectDistinctStrategies(candidates),
    fallbackUsed: generated.fallbackUsed,
  };
}
