import type { ContentStrategy } from "./contentStrategy";

export function buildStrategyGenerationContext(
  strategies: ContentStrategy[],
): string {
  if (strategies.length === 0) return "";

  return `CONTRATOS ESTRATEGICOS DAS VARIACOES:
${strategies
  .map(
    (strategy, index) => `${index + 1}. ${strategy.title}
   - Topico: ${strategy.topic}
   - Objetivo: ${strategy.objective}
   - Publico: ${strategy.audience}
   - Angulo: ${strategy.angle}
   - Gancho: ${strategy.hook}
   - Promessa: ${strategy.promise}
   - Evidencias permitidas: ${strategy.evidenceIds.join(", ") || "nenhuma afirmacao factual especifica"}`,
  )
  .join("\n")}

REGRAS:
- A variacao 1 deve executar a estrategia 1, e assim por diante.
- Nao misture os tres angulos em uma mesma variacao.
- Preserve o topico, objetivo, publico e limite factual de cada contrato.
- Escreva copy original; nao copie literalmente o texto de evidencia.`;
}
