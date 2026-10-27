/**
 * Cápsulas de Linguagem Social Contemporânea.
 *
 * Módulo enxuto injetado no contexto editorial para combater dialeto de IA,
 * vícios de copywriting ultrapassados e garantir fluidez nativa para redes sociais.
 */

export interface SocialPlaybookGuidance {
  antiClichéRules: string[];
  relationshipRule: string;
  platformGuidance: Record<string, string>;
}

export const CONTEMPORARY_SOCIAL_PLAYBOOK: SocialPlaybookGuidance = {
  relationshipRule:
    "Relação Projeto vs. Prompt: O Dossiê do Projeto define QUEM fala (autoridade, postura, vocabulário e limites factuais). O Prompt do usuário define SOBRE O QUE falar hoje. Nunca transforme todo post em um panfleto genérico de vendas: trate o tema solicitado sob a ótica e maturidade da marca.",

  antiClichéRules: [
    "Corte o dialeto óbvio de IA: NUNCA inicie com 'No mundo acelerado de hoje', 'Você já parou para pensar', 'Em um cenário cada vez mais', 'Mergulhe fundo', 'Desbloqueie seu potencial' ou 'Mais do que um X, somos um Y'.",
    "Ataque direto no celular: O primeiro elemento textual deve quebrar o scroll imediatamente com uma afirmação concreta, pergunta desconfortável ou contraste claro, sem introdução vazia.",
    "Sem adjetivação oca: Substitua adjetivos inflamados ('revolucionário', 'incrível', 'perfeito') por fatos ou mecanismos claros fundamentados no projeto.",
    "Ritmo e cadência humana: Alterne frases curtas de impacto com explicações diretas. Evite parágrafos monolíticos.",
  ],

  platformGuidance: {
    instagram:
      "Instagram Feed/Carrossel: Foco em síntese visual e retenção de leitura. Cada slide deve conter no máximo uma ideia densa e clara. A legenda aprofunda a conversa ou direciona o próximo passo.",
    linkedin:
      "LinkedIn: Foco em maturidade profissional, decisões de negócio, aprendizados práticos e bastidores técnicos, sem formalismo burocrático excessivo.",
    twitter:
      "Twitter/X: Extrema concisão, punchline afiada e clareza instantânea de pensamento.",
  },
};

/**
 * Monta as instruções em texto limpo para inclusão direta no prompt editorial.
 */
export function buildContemporaryPlaybookInstructions(platform = "instagram"): string {
  const specific = CONTEMPORARY_SOCIAL_PLAYBOOK.platformGuidance[platform] || CONTEMPORARY_SOCIAL_PLAYBOOK.platformGuidance.instagram;
  return [
    "DIRETRIZES DE LINGUAGEM CONTEMPORÂNEA (ANTI-DIALETO DE IA):",
    CONTEMPORARY_SOCIAL_PLAYBOOK.relationshipRule,
    ...CONTEMPORARY_SOCIAL_PLAYBOOK.antiClichéRules.map((r) => `- ${r}`),
    `- ${specific}`,
  ].join("\n");
}
