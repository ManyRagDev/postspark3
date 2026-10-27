export const AFFIRMATIVE_PLAYBOOK_VERSION = "instagram.affirmative.1" as const;

/** The eight simulation principles, generalized to the project's audience. */
const principles = [
  "Trate o assunto pedido sob a perspectiva da marca e das necessidades de seu público. Selecione os fatos que ajudam a responder à pergunta desta peça.",
  "Abra com uma situação concreta, dúvida ou contraste reconhecível pelo público. Escolha livremente a construção que melhor apresenta o assunto e dá motivo para continuar.",
  "Converse com o leitor usando vocabulário cotidiano e frases naturais. Apresente conceitos técnicos na medida em que ajudam a entender ou decidir, traduzindo o mecanismo em utilidade.",
  "Construa uma sequência em que cada página acrescenta uma contribuição própria. Relacione os apoios à ideia central de cada página e faça o fechamento responder à abertura.",
  "Dimensione o volume de texto pela informação necessária para compreender a página. Use ritmo de frases, hierarquia e espaço de leitura apropriados ao celular; reserve detalhes complementares para a legenda.",
  "Descreva capacidades concretas e benefícios qualificados pelas condições da fonte. Identifique o período observado quando a afirmação depender de acompanhamento histórico.",
  "Feche com uma ação pertinente ao conteúdo e ao contexto da marca. Escolha uma ação principal e torne claro seu propósito.",
  "Use estes princípios como referências de autoria. Adapte a estrutura, a extensão e a forma de abertura ao assunto, preservando liberdade de criação e a voz da marca.",
] as const;

export function affirmativeSocialPlaybook(platform?: string, format?: string) {
  if (platform !== "instagram") return null;
  const carousel = format === "carousel";
  return {
    version: AFFIRMATIVE_PLAYBOOK_VERSION,
    surface: carousel ? "Instagram / carrossel" : "Instagram / post único",
    principles: principles.map((p, index) =>
      !carousel && index === 3
        ? "Construa uma composição autossuficiente com uma ideia central e apoios em hierarquia. Faça o fechamento e a ação principal conviverem na mesma página quando pertinentes."
        : p
    ),
  };
}

export const affirmativeCopyInstructions = [
  "Você redige uma peça para redes sociais a partir de três entradas: dossiê do projeto, playbook da rede/formato e pedido da peça.",
  "O dossiê fornece identidade, fatos, condições, público e voz. O pedido define o assunto e as escolhas explícitas desta peça. O playbook orienta a apresentação. Escolhas explícitas da peça prevalecem sobre preferências padrão de linguagem e CTA.",
  "Use os dados fornecidos como referência. Sustente as afirmações nos fatos e nas condições disponíveis. Respeite as restrições expressas do projeto e preserve a grafia de seus nomes.",
  "Desenvolva a peça com autonomia editorial dentro dessas entradas. Resolva foco, progressão e extensão durante a redação. A direção selecionada identifica a abordagem desta proposta; desenvolva sua contribuição própria.",
  "Entregue diretamente os textos nos campos nativos, a legenda, as hashtags e os prompts de mídia contratados. Campos opcionais vazios são válidos quando a página já comunica sua contribuição. Capacidade disponível é limite físico, e a informação necessária determina o volume.",
  "Preserve o nível de intervenção: visual_only conserva literalmente o texto; light_optimize permite clareza e concisão leves; optimize_structure permite criar e reorganizar dentro dos fatos e requisitos. Obrigações art/caption/either mantêm seus destinos.",
  "Afirmações expressam o alcance demonstrado pela fonte. Estatísticas, comparações, prazos, garantias e resultados exigem suporte; exemplos hipotéticos ficam identificados como tais. Condições que tornam uma promessa verdadeira acompanham a afirmação usada.",
].join("\n");
