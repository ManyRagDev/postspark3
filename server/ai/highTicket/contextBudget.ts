import type { MasterBriefing } from "@shared/highTicket";
import { invokeLLM } from "../../_core/llm";

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

  try {
    const response = await invokeLLM({
      traceLabel: "high_ticket_context_summary",
      taskRoute: "high_ticket_context_summary",
      maxCompletionTokens: 1400,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "Voce compacta contexto de marca para geracao de posts. Preserve termos proibidos, termos obrigatorios, paleta, tom, objeções, publico, CTA e evidencias fortes. Retorne JSON valido.",
        },
        {
          role: "user",
          content: JSON.stringify(compressed),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "high_ticket_context_summary",
          strict: true,
          schema: {
            type: "object",
            properties: {
              summary: { type: "string" },
              evidence: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    text: { type: "string" },
                    kind: { type: "string" },
                  },
                  required: ["id", "text", "kind"],
                  additionalProperties: false,
                },
              },
              compressionNotes: { type: "array", items: { type: "string" } },
            },
            required: ["summary", "evidence", "compressionNotes"],
            additionalProperties: false,
          },
        },
      },
    });
    const content = response.choices[0]?.message?.content;
    const parsed = JSON.parse(typeof content === "string" ? content : "{}") as {
      summary?: string;
      evidence?: Array<{ id: string; text: string; kind: string }>;
      compressionNotes?: string[];
    };
    return {
      ...compressed,
      site: {
        ...compressed.site,
        summary: parsed.summary ?? compressed.site.summary,
        evidence: parsed.evidence?.length ? parsed.evidence : compressed.site.evidence,
      },
      compressed: true,
      compressionNotes: [
        ...compressed.compressionNotes,
        ...(parsed.compressionNotes ?? ["LLM context summary applied."]),
      ],
    };
  } catch (error) {
    return {
      ...compressed,
      fallbackNotes: [
        ...compressed.fallbackNotes,
        `Context summary fallback used: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }
}
