/** Editorial guidance, independent of authored geometry and word-count quotas. */
export function narrativeSlideRole(index: number, count: number) {
  return count === 1
    ? "static"
    : index === 0
      ? "cover"
      : index === count - 1
        ? "closing"
        : "development";
}

export const carouselStoryInstructions = [
  "Conte uma história editorial única, fiel ao briefing: uma pergunta, tensão ou promessa fundamentada abre a sequência; os fatos explicam essa abertura; o fechamento resolve a ideia e indica um próximo passo pertinente. História não autoriza inventar personagens, experiências, depoimentos ou fatos.",
  "Capa/cover: gancho específico, compreensível e curto, com no máximo um apoio breve quando necessário. Não antecipe toda a explicação, lista de benefícios ou conclusão. Reserve o desenvolvimento para depois; o espaço do layout não é uma meta de preenchimento.",
  "Meio/development: avance uma ideia por slide, explicando mecanismo, evidência, exemplo ou consequência fornecidos. Retome o referente do slide anterior com clareza e mantenha o mesmo fio condutor; não produza posts independentes nem slogans repetidos. Use conectivos quando ajudarem, sem fórmulas artificiais.",
  "Último/closing: resolva a pergunta/promessa da capa, sintetize o aprendizado e proponha um CTA coerente com o objetivo, usando o CTA explícito quando houver. Não invente link, endereço, oferta ou disponibilidade. O próximo passo pode ser aplicar uma orientação, salvar ou refletir; não force venda.",
  "Coesão: preserve nomes, pessoa verbal, tom e referentes. Cada readerTakeaway descreve o que o leitor compreende de novo; bridgeFromPrevious explica como a ideia decorre da anterior. Não distribua palavras igualmente nem repita a mesma informação para ocupar caixas.",
  "Em dois slides, o fechamento também desenvolve/responde ao gancho: não sacrifique os fatos para reservar uma página só ao CTA. Em sequências maiores, não invente informação para completar a quantidade.",
  "Estas são regras padrão: instruções explícitas do usuário sobre conteúdo, ordem, capa ou CTA prevalecem. Respeite o nível de intervenção: light_optimize permite somente ajustes leves e não autoriza substituir a estrutura explicitamente fornecida. Texto obrigatório e preservação factual prevalecem sobre concisão. Campos opcionais podem ficar vazios conforme o contrato nativo; campos obrigatórios devem ser atendidos sem criar texto de enchimento. Não altere a geometria para cumprir a narrativa.",
].join("\n");

export function carouselNarrativeContract(
  count: number,
  interventionLevel?: string
) {
  if (count < 2 || interventionLevel === "visual_only") return null;
  return {
    version: 1,
    instructions: carouselStoryInstructions,
    slides: Array.from({ length: count }, (_, slideIndex) => ({
      slideIndex,
      role: narrativeSlideRole(slideIndex, count),
      density:
        slideIndex === 0
          ? "gancho e apoio breve"
          : slideIndex === count - 1
            ? count === 2
              ? "desenvolvimento, resposta e próximo passo"
              : "síntese e próximo passo"
            : "explicação de uma ideia com avanço informativo",
    })),
  };
}
