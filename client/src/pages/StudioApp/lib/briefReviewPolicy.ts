export type StudioPostMode = "static" | "carousel";

/**
 * Post único segue direto para a preparação. A revisão existe apenas quando
 * há uma estrutura multi-slide que o usuário pode validar antes da geração.
 */
export function shouldReviewBriefBeforeGeneration(mode: StudioPostMode): boolean {
  return mode === "carousel";
}
