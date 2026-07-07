import type { AngleAssignment, MasterBriefing, RouterOutput } from "@shared/highTicket";
import { routerOutputSchema } from "@shared/highTicketSchemas";
import { invokeLLM } from "../../_core/llm";

const MECHANISMS: AngleAssignment["mechanism"][] = ["story", "authority", "objection"];

function fallbackRouter(briefing: MasterBriefing): RouterOutput {
  const audience = briefing.persona.audience || briefing.site.source?.business.audiences[0] || "publico principal";
  const topic = briefing.site.summary || briefing.userInput.content.slice(0, 100) || "tema principal";
  return {
    intent: {
      objective: briefing.userInput.executionBrief?.objective ?? "engage",
      confidence: 0.55,
      rationale: "Fallback deterministico baseado no briefing e contexto disponivel.",
    },
    angles: [
      {
        angleId: "angle-story",
        title: "Narrativa de transformacao",
        thesis: `Mostrar ${topic} como uma mudanca concreta na rotina do publico.`,
        mechanism: "story",
        audience,
        hook: "Antes de prometer mais, mostre o que muda.",
        promise: "Uma leitura clara do ganho real.",
        visualDirection: "Composicao editorial premium, hierarquia forte e respiro.",
        risks: ["Evitar melodrama", "Nao inventar cases"],
      },
      {
        angleId: "angle-authority",
        title: "Autoridade objetiva",
        thesis: `Posicionar ${topic} com criterio, prova e linguagem senior.`,
        mechanism: "authority",
        audience,
        hook: "O que profissionais maduros observam primeiro.",
        promise: "Clareza para decidir com mais seguranca.",
        visualDirection: "Visual limpo, contraste alto, tom institucional sofisticado.",
        risks: ["Nao inventar numeros", "Evitar jargao vazio"],
      },
      {
        angleId: "angle-objection",
        title: "Quebra de objecao",
        thesis: `Enfrentar a principal friccao do publico antes de vender ${topic}.`,
        mechanism: "objection",
        audience,
        hook: "A objecao que trava a decisao.",
        promise: "Reduzir incerteza com uma resposta direta.",
        visualDirection: "Composicao direta, tensao controlada e CTA claro.",
        risks: ["Nao soar agressivo", "Nao exagerar dor"],
      },
    ],
    fallbackUsed: true,
  };
}

export async function routeHighTicketIntent(briefing: MasterBriefing): Promise<RouterOutput> {
  try {
    const response = await invokeLLM({
      traceLabel: "high_ticket_intent_router",
      taskRoute: "high_ticket_intent_router",
      maxCompletionTokens: 1600,
      temperature: 0.25,
      reasoningEffort: "medium",
      messages: [
        {
          role: "system",
          content:
            "Voce e estrategista senior de conteudo high ticket. Defina exatamente 3 angulos ortogonais. Nao escreva posts finais. Responda JSON valido.",
        },
        {
          role: "user",
          content: JSON.stringify({
            input: briefing.userInput,
            constraints: briefing.constraints,
            brand: briefing.brand,
            persona: briefing.persona,
            site: {
              summary: briefing.site.summary,
              evidence: briefing.site.evidence.slice(0, 10),
              toneGuidelines: briefing.site.toneGuidelines,
            },
            requiredMechanisms: MECHANISMS,
          }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "high_ticket_router_output",
          strict: true,
          schema: {
            type: "object",
            properties: {
              intent: {
                type: "object",
                properties: {
                  objective: { type: "string", enum: ["educate", "authority", "sell", "engage", "lead"] },
                  confidence: { type: "number" },
                  rationale: { type: "string" },
                },
                required: ["objective", "confidence", "rationale"],
                additionalProperties: false,
              },
              angles: {
                type: "array",
                minItems: 3,
                maxItems: 3,
                items: {
                  type: "object",
                  properties: {
                    angleId: { type: "string" },
                    title: { type: "string" },
                    thesis: { type: "string" },
                    mechanism: { type: "string", enum: ["pain", "benefit", "objection", "authority", "story", "myth", "how-to"] },
                    audience: { type: "string" },
                    hook: { type: "string" },
                    promise: { type: "string" },
                    visualDirection: { type: "string" },
                    risks: { type: "array", items: { type: "string" } },
                  },
                  required: ["angleId", "title", "thesis", "mechanism", "audience", "hook", "promise", "visualDirection", "risks"],
                  additionalProperties: false,
                },
              },
              fallbackUsed: { type: "boolean" },
            },
            required: ["intent", "angles", "fallbackUsed"],
            additionalProperties: false,
          },
        },
      },
    });
    const content = response.choices[0]?.message?.content;
    const parsed = JSON.parse(typeof content === "string" ? content : "{}");
    const checked = routerOutputSchema.safeParse(parsed);
    return checked.success ? checked.data : fallbackRouter(briefing);
  } catch (error) {
    return fallbackRouter(briefing);
  }
}
