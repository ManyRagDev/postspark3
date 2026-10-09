import { userMessageFor } from "@shared/generationFailure";

/** Motivo verificável, escrito para a pessoa sem expor copy ou detalhes do provider. */
export function userMessageForGenerationIssues(issues: Array<{ detail: string }>): string {
  const details = issues.map((issue) => issue.detail);
  const required = details.find((detail) => detail.startsWith("termo explicitamente obrigatório ausente: "));
  const forbidden = details.find((detail) => detail.startsWith("termo explicitamente proibido presente: "));
  const safeTerm = (detail: string) => detail.split(": ").slice(1).join(": ").replace(/[\x00-\x1f\x7f]/g, " ").trim().slice(0, 80);

  if (required) return `A IA não conseguiu incluir “${safeTerm(required)}”, exigido no briefing, em todas as opções. Tente novamente.`;
  if (forbidden) return `A IA incluiu “${safeTerm(forbidden)}”, proibido no briefing. Nenhum post foi aceito; tente novamente.`;
  if (details.some((detail) => detail.startsWith("instruction_leakage"))) {
    return "A IA colocou instruções do briefing no texto do post. Nenhum post foi aceito; tente novamente.";
  }
  if (details.some((detail) => /slides|must contain \d+ slides/.test(detail))) {
    return "A IA não entregou a quantidade necessária de slides em todas as opções. Tente novamente.";
  }
  if (details.some((detail) => /missing required copy|copy obrigatório incompleto|sections inválidas|must use no sections/.test(detail))) {
    return "A IA deixou campos obrigatórios do post incompletos. Tente novamente.";
  }
  if (details.some((detail) => /(?:^|:)cta_required_on_art$/.test(detail))) {
    return "A IA não colocou o convite solicitado no texto da arte em todas as opções. Tente novamente.";
  }
  if (details.some((detail) => /(?:^|:)body_required_on_art$/.test(detail))) {
    return "A IA não colocou o texto de apoio solicitado na arte em todas as opções. Tente novamente.";
  }
  if (details.some((detail) => detail.startsWith("visual diversity requires"))) {
    return "As composições visuais não ficaram suficientemente diferentes. Tente novamente.";
  }
  return userMessageFor("invalid_provider_response");
}
