export type ExpectedFact = {
  label: string;
  anyOf: string[];
};

export type EditorialBenchmarkCase = {
  id: string;
  brief: string;
  expectedFacts: ExpectedFact[];
};

/**
 * Corpus sintético e versionado. Não contém conteúdo de usuários.
 * Os casos cobrem insumo raso, factual, promocional e sensível a inferências.
 */
export const EDITORIAL_BENCHMARK_CORPUS: EditorialBenchmarkCase[] = [
  {
    id: "promocao-dia-das-maes",
    brief: "Quero um post para anunciar desconto de 20% no Dia das Mães na clínica de estética.",
    expectedFacts: [
      { label: "20%", anyOf: ["20%", "20 %"] },
      { label: "Dia das Mães", anyOf: ["dia das mães", "dia das maes"] },
    ],
  },
  {
    id: "clinica-confirmacao-factual",
    brief:
      "Uma clínica de fisioterapia perdia 18% das consultas porque a confirmação dependia de mensagens manuais. A equipe criou uma janela automática de reagendamento de 2 horas e reduziu horários ociosos. Crie um post para gestores de clínicas explicando o mecanismo operacional, sem inventar métricas além dessas.",
    expectedFacts: [
      { label: "18%", anyOf: ["18%", "18 %"] },
      { label: "2 horas", anyOf: ["2 horas", "duas horas"] },
    ],
  },
  {
    id: "home-office-vago",
    brief: "Faça um post para Instagram sobre produtividade no home office.",
    expectedFacts: [],
  },
  {
    id: "comparacao-de-precos",
    brief:
      "Crie um post para um comparador de preços. O serviço reúne preço atual, histórico de preço e avaliações de diferentes lojas para ajudar o consumidor a decidir com menos abas abertas.",
    expectedFacts: [
      { label: "histórico de preço", anyOf: ["histórico de preço", "historico de preco"] },
      { label: "avaliações", anyOf: ["avaliações", "avaliacoes"] },
    ],
  },
  {
    id: "restaurante-menu-executivo",
    brief:
      "Anuncie o novo menu executivo de um restaurante, disponível de segunda a sexta no almoço por R$ 49. Não sabemos quais pratos estarão disponíveis em cada dia.",
    expectedFacts: [
      { label: "R$ 49", anyOf: ["r$ 49", "r$49"] },
      { label: "segunda a sexta", anyOf: ["segunda a sexta", "segunda à sexta"] },
    ],
  },
  {
    id: "personal-vagas",
    brief:
      "Uma personal trainer abriu quatro vagas para acompanhamento individual no próximo mês. O atendimento pode ser presencial ou online. Crie um post de captação sem prometer resultado físico.",
    expectedFacts: [
      { label: "quatro vagas", anyOf: ["quatro vagas", "4 vagas"] },
      { label: "presencial ou online", anyOf: ["presencial ou online", "online ou presencial"] },
    ],
  },
  {
    id: "saas-atendimento",
    brief:
      "Crie um post para um software que centraliza mensagens de WhatsApp, Instagram e chat do site em uma única caixa de entrada. Não há dados de economia de tempo ou aumento de vendas.",
    expectedFacts: [
      { label: "WhatsApp", anyOf: ["whatsapp"] },
      { label: "Instagram", anyOf: ["instagram"] },
      { label: "chat do site", anyOf: ["chat do site", "chat no site"] },
    ],
  },
  {
    id: "curso-data-confirmada",
    brief:
      "Anuncie uma aula online gratuita sobre organização financeira para autônomos no dia 22 de outubro, às 19h. As inscrições são limitadas, mas não foi informado o número de vagas.",
    expectedFacts: [
      { label: "22 de outubro", anyOf: ["22 de outubro"] },
      { label: "19h", anyOf: ["19h", "19 h", "19:00"] },
    ],
  },
  {
    id: "arquitetura-reforma",
    brief:
      "Um escritório de arquitetura quer explicar que, antes de desenhar uma reforma, faz um levantamento da rotina da família, da iluminação e da circulação da casa. Crie um post claro e sofisticado.",
    expectedFacts: [
      { label: "rotina", anyOf: ["rotina"] },
      { label: "iluminação", anyOf: ["iluminação", "iluminacao"] },
      { label: "circulação", anyOf: ["circulação", "circulacao"] },
    ],
  },
  {
    id: "produto-sem-detalhes",
    brief:
      "Uma marca de cosméticos vai lançar um sérum facial chamado Aurora. Ainda não temos composição, benefícios comprovados, preço nem data de lançamento. Crie um teaser responsável.",
    expectedFacts: [
      { label: "Aurora", anyOf: ["aurora"] },
      { label: "sérum facial", anyOf: ["sérum facial", "serum facial"] },
    ],
  },
];
