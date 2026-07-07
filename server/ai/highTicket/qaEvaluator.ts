import type { AngleAssignment, MasterBriefing, OriginalityResult, QaResult, WorkerPayload } from "@shared/highTicket";
import type { GenerationEvaluationSummary } from "@shared/postspark";
import { generationEvaluationSchema } from "@shared/postsparkSchemas";
import { invokeLLM } from "../../_core/llm";
import { mapWorkerPayloadsToPostVariations } from "./finalMapper";
import { slimBriefingForWorker } from "./slimBriefing";

interface QaFeedback {
  overallScore: number;
  accepted: boolean;
  dimensions: GenerationEvaluationSummary["dimensions"];
  feedback: string[];
}

function normalizeDimensions(raw: Record<string, number>): GenerationEvaluationSummary["dimensions"] {
  const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
  return {
    brandAlignment: clamp(raw.brandAlignment ?? 60),
    objectiveAlignment: clamp(raw.objectiveAlignment ?? 60),
    audienceRelevance: clamp(raw.audienceRelevance ?? 60),
    factuality: clamp(raw.factuality ?? 60),
    originality: clamp(raw.originality ?? 60),
    clarity: clamp(raw.clarity ?? 60),
    platformFit: clamp(raw.platformFit ?? 60),
    visualReadability: clamp(raw.visualReadability ?? 60),
    captionCoherence: clamp(raw.captionCoherence ?? 60),
  };
}

export interface HighTicketQaEvaluation {
  results: QaResult[];
  evaluations: GenerationEvaluationSummary[];
  acceptedIndexes: number[];
  rejectedIndexes: number[];
}

export async function evaluateHighTicketQa(input: {
  runId: string;
  briefing: MasterBriefing;
  angles: AngleAssignment[];
  payloads: WorkerPayload[];
  originality: OriginalityResult;
}): Promise<HighTicketQaEvaluation> {
  const slimContext = slimBriefingForWorker(input.briefing);
  const results: QaResult[] = [];

  await Promise.all(
    input.payloads.map(async (payload, index) => {
      const angle = input.angles[index];
      const originalityScore = input.originality.assessments[index]?.score ?? 60;
      const angleId = payload.angleId || angle?.angleId || `angle-${index + 1}`;

      try {
        const response = await invokeLLM({
          traceLabel: `high_ticket_qa_${angleId}`,
          taskRoute: "high_ticket_qa",
          maxCompletionTokens: 1400,
          temperature: 0.2,
          reasoningEffort: "high",
          messages: [
            {
              role: "system",
              content: `Voce e um Diretor de Criacao senior. Avalie um WorkerPayload High Ticket contra os criterios abaixo. Seja rigoroso mas justo. Responda JSON valido.

CRITERIOS DE AVALIACAO (cada dimensao 0-100):
- brandAlignment: o tom, termos proibidos e identidade da marca foram respeitados?
- objectiveAlignment: o angulo estrategico foi executado com fidelidade?
- audienceRelevance: o conteudo fala com o publico-alvo real?
- factuality: ha afirmacoes nao sustentadas ou numeros inventados?
- originality: a abordagem e distinta das outras variacoes e de posts anteriores?
- clarity: headline e body sao diretos, sem jargao vazio?
- platformFit: a legenda respeita o limite de caracteres da plataforma?
- visualReadability: contraste, hierarquia e layout sao adequados?
- captionCoherence: a legenda reflete fielmente o conteudo visual (slides/secoes)?

LIMIAR DE APROVACAO:
- overallScore >= 75
- brandAlignment >= 80
- visualReadability >= 80
- captionCoherence >= 70
- Se qualquer hard gate falhar, accepted deve ser false.`,
            },
            {
              role: "user",
              content: JSON.stringify({
                angle: { angleId: angle?.angleId, mechanism: angle?.mechanism, thesis: angle?.thesis, visualDirection: angle?.visualDirection },
                payload: {
                  copy: payload.copy,
                  visual: {
                    concept: payload.visual.concept,
                    layout: payload.visual.layout,
                    template: payload.visual.template,
                    backgroundColor: payload.visual.backgroundColor,
                    textColor: payload.visual.textColor,
                    accentColor: payload.visual.accentColor,
                    slidesCount: payload.visual.slides?.length ?? 0,
                    sectionsCount: payload.visual.sections?.length ?? 0,
                  },
                },
                brandKit: {
                  tone: slimContext.brand?.toneOfVoice,
                  forbiddenTerms: slimContext.constraints?.forbiddenTerms,
                  requiredTerms: slimContext.constraints?.requiredTerms,
                  preferredColors: slimContext.constraints?.preferredColors,
                },
                persona: {
                  audience: slimContext.persona?.audience,
                  objections: slimContext.persona?.objections,
                  languageStyle: slimContext.persona?.languageStyle,
                },
                originalityScore,
              }),
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "high_ticket_qa_result",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  overallScore: { type: "number" },
                  accepted: { type: "boolean" },
                  dimensions: {
                    type: "object",
                    properties: {
                      brandAlignment: { type: "number" },
                      objectiveAlignment: { type: "number" },
                      audienceRelevance: { type: "number" },
                      factuality: { type: "number" },
                      originality: { type: "number" },
                      clarity: { type: "number" },
                      platformFit: { type: "number" },
                      visualReadability: { type: "number" },
                      captionCoherence: { type: "number" },
                    },
                    required: [
                      "brandAlignment",
                      "objectiveAlignment",
                      "audienceRelevance",
                      "factuality",
                      "originality",
                      "clarity",
                      "platformFit",
                      "visualReadability",
                      "captionCoherence",
                    ],
                    additionalProperties: false,
                  },
                  feedback: { type: "array", items: { type: "string" } },
                },
                required: ["overallScore", "accepted", "dimensions", "feedback"],
                additionalProperties: false,
              },
            },
          },
        });

        const content = response.choices[0]?.message?.content;
        const raw = JSON.parse(typeof content === "string" ? content : "{}") as QaFeedback;
        const summary: GenerationEvaluationSummary = {
          overallScore: raw.overallScore ?? 0,
          accepted: raw.accepted ?? false,
          dimensions: normalizeDimensions(raw.dimensions),
          feedback: (Array.isArray(raw.feedback) ? raw.feedback : []).slice(0, 4),
        };

        const checked = generationEvaluationSchema.safeParse(summary);
        results[index] = {
          angleId,
          passed: checked.success ? checked.data.accepted : false,
          evaluation: checked.success ? checked.data as GenerationEvaluationSummary : summary,
          feedback: summary.feedback,
        };
      } catch (error) {
        results[index] = {
          angleId,
          passed: false,
          evaluation: {
            overallScore: 50,
            accepted: false,
            dimensions: {
              brandAlignment: 50,
              objectiveAlignment: 50,
              audienceRelevance: 50,
              factuality: 50,
              originality: originalityScore,
              clarity: 50,
              platformFit: 50,
              visualReadability: 50,
              captionCoherence: 50,
            },
            feedback: [error instanceof Error ? error.message : "QA evaluation failed"],
          },
          feedback: [error instanceof Error ? error.message : "QA evaluation failed"],
        };
      }
    }),
  );

  const evaluations = results.map((result) => result.evaluation);
  return {
    results,
    evaluations,
    acceptedIndexes: results.flatMap((item, index) => (item.passed ? [index] : [])),
    rejectedIndexes: results.flatMap((item, index) => (item.passed ? [] : [index])),
  };
}
