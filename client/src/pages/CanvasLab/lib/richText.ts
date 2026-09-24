import { CanvasRichTextChunk } from "../components/types";

export interface RichTextFormatPatch {
  color?: string | null;
  sizeScale?: number;
  /** `null` remove o override; `false` força peso normal sobre uma base bold. */
  bold?: boolean | null;
  /** `null` remove o override; `false` força estilo normal sobre uma base itálica. */
  italic?: boolean | null;
  underline?: boolean | null;
}

export function applyRichTextFormat(
  fullText: string,
  existingChunks: CanvasRichTextChunk[] | undefined,
  format: RichTextFormatPatch,
  start: number,
  end: number
): CanvasRichTextChunk[] {
  // Passo 1: Construir o array de caracteres com formatação
  const charStyles = Array.from({ length: fullText.length }, (_, i) => ({
    text: fullText[i],
    color: undefined as string | undefined,
    sizeScale: undefined as number | undefined,
    bold: undefined as boolean | undefined,
    italic: undefined as boolean | undefined,
    underline: undefined as boolean | undefined,
  }));

  if (existingChunks && existingChunks.length > 0) {
    let globalIndex = 0;
    for (const chunk of existingChunks) {
      for (let i = 0; i < chunk.text.length; i++) {
        if (globalIndex < charStyles.length) {
          charStyles[globalIndex].color = chunk.color;
          charStyles[globalIndex].sizeScale = chunk.sizeScale;
          charStyles[globalIndex].bold = chunk.bold;
          charStyles[globalIndex].italic = chunk.italic;
          charStyles[globalIndex].underline = chunk.underline;
        }
        globalIndex++;
      }
    }
  }

  // Passo 2: Aplicar o formato no range
  for (let i = start; i < end; i++) {
    if (i >= 0 && i < charStyles.length) {
      if (format.color !== undefined) {
        charStyles[i].color =
          format.color === "" || format.color === null
            ? undefined
            : format.color;
      }
      if (format.sizeScale !== undefined)
        charStyles[i].sizeScale = format.sizeScale;
      if (format.bold !== undefined) {
        charStyles[i].bold = format.bold === null ? undefined : format.bold;
      }
      if (format.italic !== undefined) {
        charStyles[i].italic = format.italic === null ? undefined : format.italic;
      }
      if (format.underline !== undefined) {
        charStyles[i].underline = format.underline === null ? undefined : format.underline;
      }
    }
  }

  // Passo 3: Agrupar chars adjacentes em chunks
  const newChunks: CanvasRichTextChunk[] = [];
  if (charStyles.length === 0) return [];

  let currentChunk = {
    text: charStyles[0].text,
    color: charStyles[0].color,
    sizeScale: charStyles[0].sizeScale,
    bold: charStyles[0].bold,
    italic: charStyles[0].italic,
    underline: charStyles[0].underline,
  };

  for (let i = 1; i < charStyles.length; i++) {
    const char = charStyles[i];
    if (
      char.color === currentChunk.color &&
      char.sizeScale === currentChunk.sizeScale &&
      char.bold === currentChunk.bold &&
      char.italic === currentChunk.italic &&
      char.underline === currentChunk.underline
    ) {
      currentChunk.text += char.text;
    } else {
      // Limpa props vazias pra ficar menor no JSON
      const chunkToPush: any = { text: currentChunk.text };
      if (currentChunk.color) chunkToPush.color = currentChunk.color;
      if (currentChunk.sizeScale && currentChunk.sizeScale !== 1)
        chunkToPush.sizeScale = currentChunk.sizeScale;
      if (currentChunk.bold !== undefined) chunkToPush.bold = currentChunk.bold;
      if (currentChunk.italic !== undefined) chunkToPush.italic = currentChunk.italic;
      if (currentChunk.underline !== undefined) chunkToPush.underline = currentChunk.underline;

      newChunks.push(chunkToPush);

      currentChunk = {
        text: char.text,
        color: char.color,
        sizeScale: char.sizeScale,
        bold: char.bold,
        italic: char.italic,
        underline: char.underline,
      };
    }
  }

  const lastChunkToPush: any = { text: currentChunk.text };
  if (currentChunk.color) lastChunkToPush.color = currentChunk.color;
  if (currentChunk.sizeScale && currentChunk.sizeScale !== 1)
    lastChunkToPush.sizeScale = currentChunk.sizeScale;
  if (currentChunk.bold !== undefined) lastChunkToPush.bold = currentChunk.bold;
  if (currentChunk.italic !== undefined) lastChunkToPush.italic = currentChunk.italic;
  if (currentChunk.underline !== undefined) lastChunkToPush.underline = currentChunk.underline;
  newChunks.push(lastChunkToPush);

  return newChunks;
}

/**
 * Resolve o estado visual efetivo do negrito no intervalo selecionado.
 * Seleções mistas são consideradas desativadas; o próximo clique uniformiza
 * todo o intervalo em bold e o clique seguinte volta para peso normal.
 */
export function isRichTextRangeBold(
  existingChunks: CanvasRichTextChunk[] | undefined,
  start: number,
  end: number,
  baseBold = false
): boolean {
  return isRichTextRangeStyleActive(existingChunks, start, end, "bold", baseBold);
}

export function isRichTextRangeItalic(
  existingChunks: CanvasRichTextChunk[] | undefined,
  start: number,
  end: number,
  baseItalic = false
): boolean {
  return isRichTextRangeStyleActive(existingChunks, start, end, "italic", baseItalic);
}

export function isRichTextRangeUnderline(
  existingChunks: CanvasRichTextChunk[] | undefined,
  start: number,
  end: number
): boolean {
  return isRichTextRangeStyleActive(existingChunks, start, end, "underline", false);
}

function isRichTextRangeStyleActive(
  existingChunks: CanvasRichTextChunk[] | undefined,
  start: number,
  end: number,
  key: "bold" | "italic" | "underline",
  baseValue: boolean
): boolean {
  if (end <= start) return baseValue;

  let offset = 0;
  let chunkIndex = 0;
  for (let index = start; index < end; index += 1) {
    while (
      chunkIndex < (existingChunks?.length || 0) &&
      index >= offset + existingChunks![chunkIndex].text.length
    ) {
      offset += existingChunks![chunkIndex].text.length;
      chunkIndex += 1;
    }
    const explicitValue = existingChunks?.[chunkIndex]?.[key];
    if ((explicitValue ?? baseValue) === false) return false;
  }
  return true;
}

/**
 * Mantém os estilos alinhados quando o input invisível insere ou remove texto.
 * O trecho inserido herda o estilo do caractere imediatamente anterior (ou do
 * próximo, quando a inserção ocorre no início), reproduzindo editores nativos.
 */
export function reconcileRichTextChange(
  previousText: string,
  nextText: string,
  existingChunks: CanvasRichTextChunk[] | undefined
): CanvasRichTextChunk[] {
  let prefix = 0;
  while (
    prefix < previousText.length &&
    prefix < nextText.length &&
    previousText[prefix] === nextText[prefix]
  ) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix < previousText.length - prefix &&
    suffix < nextText.length - prefix &&
    previousText[previousText.length - 1 - suffix] === nextText[nextText.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const styles = Array.from({ length: previousText.length }, () => ({
    color: undefined as string | undefined,
    sizeScale: undefined as number | undefined,
    bold: undefined as boolean | undefined,
    italic: undefined as boolean | undefined,
    underline: undefined as boolean | undefined,
  }));
  let offset = 0;
  for (const chunk of existingChunks || []) {
    for (let index = 0; index < chunk.text.length && offset < styles.length; index += 1, offset += 1) {
      styles[offset] = {
        color: chunk.color,
        sizeScale: chunk.sizeScale,
        bold: chunk.bold,
        italic: chunk.italic,
        underline: chunk.underline,
      };
    }
  }

  const insertedLength = nextText.length - prefix - suffix;
  const inherited = styles[Math.max(0, prefix - 1)] || styles[prefix] || {};
  const nextStyles = [
    ...styles.slice(0, prefix),
    ...Array.from({ length: Math.max(0, insertedLength) }, () => ({ ...inherited })),
    ...styles.slice(previousText.length - suffix),
  ];

  const chunks: CanvasRichTextChunk[] = [];
  for (let index = 0; index < nextText.length; index += 1) {
    const style = nextStyles[index] || {};
    const previous = chunks[chunks.length - 1];
    const sameStyle = previous &&
      previous.color === style.color &&
      previous.sizeScale === style.sizeScale &&
      previous.bold === style.bold &&
      previous.italic === style.italic &&
      previous.underline === style.underline;
    if (sameStyle) {
      previous.text += nextText[index];
    } else {
      chunks.push({
        text: nextText[index],
        ...(style.color ? { color: style.color } : {}),
        ...(style.sizeScale && style.sizeScale !== 1 ? { sizeScale: style.sizeScale } : {}),
        ...(style.bold !== undefined ? { bold: style.bold } : {}),
        ...(style.italic !== undefined ? { italic: style.italic } : {}),
        ...(style.underline !== undefined ? { underline: style.underline } : {}),
      });
    }
  }
  return chunks;
}
