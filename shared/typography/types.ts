/**
 * Interface do medidor de texto.
 *
 * O contrato atende o medidor canônico e as verificações que comparam suas
 * medidas com o navegador.
 */

/** Eixos de fonte variável. Valores no domínio do próprio eixo (ex.: wght 100–900). */
export type FontAxes = Record<string, number>;

export interface TextStyle {
  /** Nome da família como declarado pela família criativa (ex.: "Fraunces"). */
  fontFamily: string;
  /** Corpo em px. */
  fontSize: number;
  /** Multiplicador de entrelinha (ex.: 1.2). Não é px. */
  lineHeight: number;
  /** Eixos de fonte variável, quando aplicável. */
  axes?: FontAxes;
  /** Transformação de caixa aplicada antes de medir. */
  textTransform?: "none" | "uppercase";
}

export interface WrapResult {
  /** Linhas após quebra. */
  lines: string[];
  /** Largura da linha mais larga, em px. */
  widestLine: number;
  /**
   * Palavras que sozinhas não cabem em `maxWidth` no corpo pedido.
   * Sinal de que reduzir a fonte é obrigatório, não opcional.
   */
  overflowingWords: string[];
}

export interface Measurer {
  /** Identificador para o relatório (ex.: "fontkit", "dom"). */
  readonly id: string;

  /**
   * Fontes que este medidor consegue medir. O harness aborta com mensagem
   * explícita se uma família pedida não estiver aqui — nunca mede com
   * substituto silencioso, porque isso produziria um relatório verde e falso.
   */
  supports(fontFamily: string): boolean;

  /** Largura de um trecho sem quebra, em px. */
  measureWidth(text: string, style: TextStyle): number;

  /** Quebra gulosa por palavra, respeitando `maxWidth` em px. */
  wrapText(text: string, style: TextStyle, maxWidth: number): WrapResult;

  /** Altura total de N linhas, em px. */
  linesHeight(lineCount: number, style: TextStyle): number;
}

/** Erro lançado quando falta uma fonte. Nunca degradar silenciosamente. */
export class MissingFontError extends Error {
  constructor(
    readonly fontFamily: string,
    readonly hint: string,
  ) {
    super(`Fonte ausente: "${fontFamily}". ${hint}`);
    this.name = "MissingFontError";
  }
}
