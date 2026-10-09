import type { PostVariation } from "@shared/postspark";
import { invokeLLM } from "../_core/llm";

/** A interpretação auxilia a geração; o texto original continua preservado. */
export interface BriefInterpretation {
  contentSpans: string[];
  instructionSpans: string[];
  verbatimSpans: string[];
  uncertain: boolean;
}

const MAX_SPANS = 12;
const MAX_SPAN_LENGTH = 800;

function exactSpans(value: unknown, source: string): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item.length <= MAX_SPAN_LENGTH && source.includes(item))))
    .slice(0, MAX_SPANS);
}

export function validateBriefInterpretation(value: unknown, source: string): BriefInterpretation | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const contentSpans = exactSpans(candidate.contentSpans, source);
  if (contentSpans.length === 0) return null;
  const verbatimSpans = exactSpans(candidate.verbatimSpans, source);
  const instructionSpans = exactSpans(candidate.instructionSpans, source)
    .filter((span) => !contentSpans.some((content) => content.includes(span) || span.includes(content)))
    .filter((span) => !verbatimSpans.some((literal) => literal.includes(span) || span.includes(literal)));
  return {
    contentSpans,
    instructionSpans,
    verbatimSpans,
    uncertain: candidate.uncertain !== false,
  };
}

export async function interpretGenerationBrief(source: string): Promise<BriefInterpretation | null> {
  if (!source.trim()) return null;
  const response = await invokeLLM({
    traceLabel: "brief_interpretation",
    taskRoute: "brief_interpretation",
    disableFallback: true,
    maxCompletionTokens: 1024,
    messages: [
      {
        role: "system",
        content: `Separe um briefing de criação de posts em conteúdo e instruções de produção.
Retorne APENAS trechos copiados literalmente da entrada, sem completar, resumir ou inventar fatos.
contentSpans: assuntos, afirmações, exemplos, dados, ofertas e ideias que podem aparecer no post.
instructionSpans: comandos dirigidos ao criador (formato, tom, ação de criar/escrever, restrições).
verbatimSpans: frases que o usuário pediu explicitamente para reproduzir ao pé da letra.
Uma frase como "quero criar um post sobre alimentação saudável" contém instrução "quero criar um post sobre" e assunto "alimentação saudável".
Se a divisão for ambígua, marque uncertain=true. Nunca descarte o assunto por ser parecido com o pedido.`,
      },
      { role: "user", content: source },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "brief_interpretation",
        strict: true,
        schema: {
          type: "object",
          properties: {
            contentSpans: { type: "array", items: { type: "string" } },
            instructionSpans: { type: "array", items: { type: "string" } },
            verbatimSpans: { type: "array", items: { type: "string" } },
            uncertain: { type: "boolean" },
          },
          required: ["contentSpans", "instructionSpans", "verbatimSpans", "uncertain"],
          additionalProperties: false,
        },
      },
    },
  });
  const content = response.choices[0]?.message?.content;
  if (typeof content !== "string") return null;
  try {
    return validateBriefInterpretation(JSON.parse(content), source);
  } catch {
    return null;
  }
}

export function interpretedContent(interpretation: BriefInterpretation | null): string | null {
  return interpretation && !interpretation.uncertain
    ? interpretation.contentSpans.join("\n")
    : null;
}

export function briefInterpretationPrompt(interpretation: BriefInterpretation | null): string {
  if (!interpretation || interpretation.uncertain) return "";
  return `\nLEITURA DO BRIEFING (orientação auxiliar; o texto original prevalece em caso de conflito):
- Conteúdo e assunto: ${interpretation.contentSpans.join(" | ")}
- Instruções de produção, não copiáveis para o post: ${interpretation.instructionSpans.join(" | ") || "nenhuma"}
- Trechos solicitados literalmente: ${interpretation.verbatimSpans.join(" | ") || "nenhum"}
Use as instruções para orientar o trabalho, mas não as reproduza como copy. Reutilizar palavras do assunto e fatos do usuário é permitido.\n`;
}

function normalize(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Só frases operacionais completas podem acionar reparo; assunto nunca é bloqueio. */
export function findInstructionLeakage(
  variation: Partial<PostVariation>,
  interpretation: BriefInterpretation | null,
): string[] {
  if (!interpretation || interpretation.uncertain) return [];
  const fields = [
    variation.headline,
    variation.body,
    variation.caption,
    variation.callToAction,
    ...(variation.slides ?? []).flatMap((slide) => [slide.headline, slide.body]),
  ].filter((value): value is string => typeof value === "string");
  return interpretation.instructionSpans.filter((span) => {
    const normalized = normalize(span);
    if (normalized.split(" ").length < 4) return false;
    if (!/\b(quero|preciso|gostaria|crie|criar|gere|gerar|faca|fazer|escreva|escrever|inclua|incluir|use|usar|coloque|colocar|evite|evitar|formato|tom)\b/.test(normalized)) return false;
    return fields.some((field) => normalize(field).includes(normalized));
  });
}
