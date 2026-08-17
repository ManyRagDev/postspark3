/**
 * intentRouter.ts — movido de server/ai/highTicket/intentRouter.ts (Fase D).
 *
 * CR-004: o caminho LLM (`high_ticket_intent_router`) SAIA do caminho síncrono
 * do `post.generate` — o orçamento de chamadas é único para ideation e
 * execution (1 chamada generativa principal + ≤1 reparo + juízes em paralelo).
 * O roteamento de intenção agora é DETERMINÍSTICO: 3 ângulos ortogonais
 * (story / authority / objection) derivados do briefing e do contexto, sem
 * chamada LLM. Inclui `angleToStrategy` (movido de highTicket/captionSynthesis.ts)
 * que converte AngleAssignment → ContentStrategy, alimentando o pipeline
 * canônico diretamente.
 */
import type { AngleAssignment, MasterBriefing, RouterOutput } from "@shared/contextBriefing";
import type { ContentStrategy } from "./contentStrategy";

const MECHANISMS: AngleAssignment["mechanism"][] = ["story", "authority", "objection"];

export function routeHighTicketIntentDeterministic(briefing: MasterBriefing): RouterOutput {
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

/** Compatibilidade: mesmo nome da função original, agora determinística. */
export function routeHighTicketIntent(briefing: MasterBriefing): RouterOutput {
  return routeHighTicketIntentDeterministic(briefing);
}

/**
 * Converte AngleAssignment (saída do intent router) → ContentStrategy (entrada
 * do pipeline canônico). Movido de highTicket/captionSynthesis.ts:6. Quase 1:1;
 * `objective` é hardcoded pois no intent router ele vive em RouterOutput.intent,
 * não no ângulo; `evidenceIds` é vazio (grounding é responsabilidade do QA).
 */
export function angleToStrategy(angle: AngleAssignment, index: number): ContentStrategy {
  return {
    id: angle.angleId,
    title: angle.title,
    topic: angle.thesis,
    objective: "engage",
    audience: angle.audience,
    angle:
      angle.mechanism === "story" ? "story"
      : angle.mechanism === "objection" ? "objection"
      : angle.mechanism === "authority" ? "authority"
      : angle.mechanism === "myth" ? "myth"
      : angle.mechanism === "how-to" ? "how-to"
      : angle.mechanism === "pain" ? "pain"
      : "benefit",
    hook: angle.hook,
    promise: angle.promise,
    evidenceIds: [],
    score: {
      total: 80 - index,
      topicRelevance: 80,
      objectiveAlignment: 80,
      evidenceGrounding: 70,
      distinctiveness: 85,
    },
  };
}
