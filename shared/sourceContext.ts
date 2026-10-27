/** Never silently remove source facts to meet a context budget. */
export const GENERATION_CONTEXT_MAX_CHARS = 24_000;

export class SourceContextLimitError extends Error {
  constructor() {
    super(
      "O conteúdo da fonte excede o limite de leitura integral. Envie um trecho menor com as informações essenciais para o post."
    );
    this.name = "SourceContextLimitError";
  }
}

export function completeSourceContext(text: string): string {
  if (text.length > GENERATION_CONTEXT_MAX_CHARS)
    throw new SourceContextLimitError();
  return text;
}
