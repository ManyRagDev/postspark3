/**
 * Restaura o briefing original removendo prefixos de regeneração ("Crie 3 novos ganchos...")
 * e blocos legados de direção de arte inseridos no final do prompt (\n\n[DIREÇÃO DE ARTE..., \n\n[INSTRUÇÃO DE DIREÇÃO..., \n\nPreferência visual:...).
 * Não trunca prompts com múltiplos parágrafos.
 */
export function restorePromptFromContent(content: string): string {
  if (!content) return "";
  const withoutPrefix = content.replace(
    /^Crie 3 novos ganchos criativos e direções de arte alternativas sobre:\s*/i,
    ""
  );

  return withoutPrefix
    .replace(
      /\n\n\[(?:DIREÇÃO DE ARTE DO PROJETO ATIVA — OBRIGATÓRIA|INSTRUÇÃO DE DIREÇÃO DE ARTE — OBRIGATÓRIA|INSTRUÇÃO DE DIREÇÃO DE ARTE)[\s\S]*$/,
      ""
    )
    .replace(
      /\n\nPreferência visual:\s+[^\n]+(?:\n[^\n]+)*$/,
      ""
    );
}
