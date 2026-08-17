/**
 * contextBudget.ts — movido de server/ai/highTicket/contextBudget.ts (Fase D).
 *
 * CR-004: compressão 100% DETERMINÍSTICA (sem chamada LLM) — o orçamento de
 * chamadas do `post.generate` é o mesmo em todos os modos. Se mesmo após a
 * compressão determinística o contexto ainda exceder o budget, ele é mantido
 * com nota de limitação (nunca estoura a chamada principal com prompt gigante
 * nem invoca um segundo LLM no caminho síncrono).
 */
import type { MasterBriefing } from "@shared/contextBriefing";

export const HIGH_TICKET_CONTEXT_BUDGET_CHARS = 18_000;

function estimateContextSize(briefing: MasterBriefing): number {
  return JSON.stringify({
    brand: briefing.brand,
    persona: briefing.persona,
    site: {
      summary: briefing.site.summary,
      evidence: briefing.site.evidence,
      toneGuidelines: briefing.site.toneGuidelines,
      prohibitedClaims: briefing.site.prohibitedClaims,
    },
    constraints: briefing.constraints,
  }).length;
}

function deterministicCompress(briefing: MasterBriefing): MasterBriefing {
  return {
    ...briefing,
    site: {
      ...briefing.site,
      evidence: briefing.site.evidence
        .filter((item) => item.text.trim())
        .sort((a, b) => b.text.length - a.text.length)
        .slice(0, 12)
        .map((item) => ({ ...item, text: item.text.slice(0, 1_000) })),
    },
    compressed: true,
    compressionNotes: [
      ...briefing.compressionNotes,
      "Deterministic context compression kept the strongest site evidence within budget.",
    ],
  };
}

export async function applyContextBudget(briefing: MasterBriefing): Promise<MasterBriefing> {
  if (estimateContextSize(briefing) <= HIGH_TICKET_CONTEXT_BUDGET_CHARS) {
    return briefing;
  }

  const compressed = deterministicCompress(briefing);
  if (estimateContextSize(compressed) <= HIGH_TICKET_CONTEXT_BUDGET_CHARS) {
    return compressed;
  }

  // CR-004: sem segundo LLM no caminho síncrono. Mantém a compressão
  // determinística com nota explícita — a chamada principal recebe o melhor
  // contexto possível sem custo extra de chamada.
  return {
    ...compressed,
    fallbackNotes: [
      ...compressed.fallbackNotes,
      `Context still above ${HIGH_TICKET_CONTEXT_BUDGET_CHARS} chars after deterministic compression; limited deterministically (no LLM summary in sync path).`,
    ],
  };
}
