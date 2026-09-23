import type { ContentStrategy, EditorialMeaningPlan } from "./contentStrategy";

export function buildStrategyGenerationContext(
  strategies: ContentStrategy[],
  meaningPlan?: EditorialMeaningPlan,
): string {
  if (strategies.length === 0) return "";

  const requiredFacts = meaningPlan?.sourceFacts.filter((fact) => fact.required) ?? [];

  return `PLANO INTERNO DE SIGNIFICADO:
${strategies
  .map(
    (strategy, index) => `${index + 1}. Opção visual ${index + 1}
   - Proposição: ${strategy.literalClaim ?? strategy.hook}
   - ID da proposição: ${strategy.propositionId ?? strategy.id}
   - Objetivo: ${strategy.objective}
   - Público: ${strategy.audience}
   - Ganho para o leitor: ${strategy.readerPayoff ?? strategy.promise}
   - Suportes: ${(strategy.supportIds ?? strategy.evidenceIds).join(", ") || "somente o insumo fornecido"}`,
  )
  .join("\n")}

REGRAS:
- Primeiro compreenda a proposição literal; depois escreva uma realização editorial natural.
- As opções podem compartilhar a mesma proposição. A diversidade principal é visual; não invente três teses.
- Preserve sujeito, ação, condição e consequência necessários para recuperar o significado na primeira leitura.
- Ambiguidade ou metáfora só é válida quando o texto visível resolve o referente e completa o nexo.
- Não atribua opinião a especialista, veterano, mestre ou profissional sem uma fonte expressa no insumo.
- Fatos obrigatórios: ${requiredFacts.map((fact) => `${fact.id}: ${fact.text}`).join(" | ") || "nenhum fato marcado como obrigatório"}.
- Fonte de autoridade autorizada: ${meaningPlan?.authoritySource || "nenhuma"}.
- Escreva copy original sem transformar o plano interno em texto visível.`;
}
