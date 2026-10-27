/** Materialized before copy/render, never an editor-only decoration override. */
export const carouselVisualInstructions =
  "A capa conserva a composição original da família. Os slides de desenvolvimento usam uma variante de leitura com menos decoração, título contínuo e espaço para explicação. O encerramento usa uma variante da mesma identidade com espaço destacado para síntese e CTA pertinente. Cores, fontes e todas as mídias contratadas pertencem à família escolhida. Os campos/capacidades efetivos de cada variante são apresentados ao redator após a hidratação; as capacidades do cartão original descrevem a capa. Não invente CTA em visual_only ou contra instrução explícita.";

export function carouselVisualContract(count: number, instructions = "") {
  const normalized = instructions
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  // A request to retain identical layouts takes precedence over the default rhythm.
  const identical =
    /mesm[oa] (?:layout|composicao|design)[\s\S]{0,60}(?:todos os|todas as) slides/.test(
      normalized
    );
  if (count < 2 || identical) return null;
  return { version: 1 as const, instructions: carouselVisualInstructions };
}
