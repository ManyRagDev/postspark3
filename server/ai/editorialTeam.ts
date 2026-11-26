import type { EditorialWriter, GenerationModelConfig } from "@shared/generationModel";
import type { OrchestratedGenerationInput } from "@shared/generationRequest";

export type EditorialBrief = Partial<Pick<OrchestratedGenerationInput, "content" | "tone" | "executionBrief">>;
type Team = NonNullable<GenerationModelConfig["editorialTeam"]>;

export function chooseEditorialWriter(input: EditorialBrief): EditorialWriter {
  const brief = input.executionBrief;
  if (brief?.interventionLevel === "visual_only") return "google/gemini-3.8-flash";
  const direction = [input.content, brief?.rawInput, brief?.notes, input.tone, brief?.tone]
    .filter(Boolean).join("\n").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const requestedStyle = direction.replace(/\b(?:sem|evite|nunca use|nao (?:use|quero|usar))\s+(?:(?:tom|estilo)\s+(?:de\s+)?)?(?:humor(?:istico)?|comedia|satira|storytelling|microconto|piadas?|cronica|conto)\b/g, "");
  if (/\b(humor|humoristico|comedia|satira|storytelling|microconto|microcronica|enredo|piadas?|cronica|conto)\b/.test(requestedStyle))
    return "qwen/qwen4-max";
  if (brief?.format === "ad" || brief?.objective === "sell" || brief?.objective === "lead" ||
      /\b(campanha comercial|campanha de lancamento|campanha de vendas|copy de vendas|anuncio|black friday|captar leads|vender|conversao|promocao de vendas)\b/.test(direction))
    return "openai/gpt-6.2-sol";
  if (/\b(comunicado|aviso de funcionamento|aviso de feriado|horarios de atendimento|tabela de precos|cardapio da semana)\b/.test(direction))
    return "google/gemini-3.8-flash";
  return "z-ai/glm-5.3";
}

export function proposalWriter(team?: Team, rewriteForRecovery?: boolean) {
  if (!team) return undefined;
  return rewriteForRecovery && team.writer === "openai/gpt-6.2-sol" ? team.commercialAdaptation : team.writer;
}

export function editorialModelOptions(model: EditorialWriter | Team["sourceReader"]) {
  const sol = model === "openai/gpt-6.2-sol";
  return {
    pinnedModel: model,
    reasoningEffort: model === "qwen/qwen4-max" ? "none" as const : "low" as const,
    forceTextSchema: model === "google/gemini-3.8-flash",
    ...(sol ? {} : { temperature: model === "z-ai/glm-5.3" || model === "qwen/qwen4-max" ? 0.75 : 0.2 }),
    disableFallback: true as const,
    disableStructuredRepair: true as const,
    maxTransportAttempts: 1,
    transportTimeoutMs: 90_000,
  };
}
