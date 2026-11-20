/**
 * scriptDetector.ts
 *
 * Analisa o texto de entrada do usuário no /thevoid para identificar automaticamente
 * se o conteúdo já é um roteiro estruturado com lâminas/slides definidos.
 */

export interface ParsedScriptSlide {
  slideIndex: number;
  title?: string;
  body?: string;
  rawText: string;
}

export interface ScriptDetectionResult {
  /** Se o texto é classificado como roteiro pronto com lâminas */
  isScript: boolean;
  /** Quantidade de lâminas detectadas (entre 2 e 10) */
  slideCount: number;
  /** Lâminas individuais parseadas */
  slides: ParsedScriptSlide[];
  /** Se foram encontradas seções extras como Roteiro Reels ou Legenda além do Carrossel */
  hasExtraneousSections: boolean;
  /** Trecho específico da seção de Carrossel caso haja cabeçalhos como "## Carrossel" */
  carouselSectionText?: string;
}

/**
 * Padrões que indicam início de uma lâmina/slide:
 * - slide1, Slide 1:, ## Slide 01, **Slide 1:**, [Slide 1]
 * - Lâmina1:, Lamina 1:, Tela1:, Página 1:
 * - --- em uma linha separada
 * - 1. Gancho:, 2. Solução:, 1. Título:
 */
const SLIDE_MARKER_REGEX = new RegExp(
  String.raw`^[ \t]*(?:#{1,6}[ \t]+)?(\*{1,2}|_{1,2})?(?:\[[ \t]*)?(?:slide|l[aâ]mina|tela|p[aá]gina)[ \t]*#?[ \t]*(\d+)(?![\p{L}\p{N}_])(?:[ \t]*\])?[ \t]*`,
  "gimu"
);

export function detectScriptStructure(text: string): ScriptDetectionResult {
  if (!text?.trim()) {
    return {
      isScript: false,
      slideCount: 0,
      slides: [],
      hasExtraneousSections: false,
    };
  }

  const raw = text.replace(/\r\n?/g, "\n");

  // Verifica se há seções múltiplas (ex: "## Roteiro Reels" e "## Carrossel")
  const hasReels = /roteiro\s+reels|vídeo\s+reels|tiktok/i.test(raw);
  const hasCarouselHeading = /##\s*carrossel|#\s*carrossel|carrossel\s*:/i.test(
    raw
  );
  const hasCaption = /##\s*legenda|legenda\s*:/i.test(raw);
  const hasExtraneousSections = hasReels || hasCaption;

  let targetText = raw;

  // Se houver uma seção específica "## Carrossel", isola para análise prioritária
  if (hasCarouselHeading) {
    const match = raw.match(
      /(?:##|#)[ \t]*carrossel[\s\S]*?(?=(?:##|#)[ \t]*legenda|$)/i
    );
    if (match) {
      targetText = match[0];
    }
  }

  // Estratégia 1: Delimitadores explícitos "Slide X:" ou "Lâmina X:"
  const explicitSlides = parseExplicitSlides(targetText);
  if (explicitSlides.length >= 2) {
    const boundedCount = Math.min(Math.max(explicitSlides.length, 2), 10);
    return {
      isScript: true,
      slideCount: boundedCount,
      slides: explicitSlides,
      hasExtraneousSections,
      carouselSectionText: targetText !== raw ? targetText : undefined,
    };
  }

  // A dedicated separator avoids confusing normal paragraphs with slide boundaries.
  const separated = targetText
    .replace(/^(?:#{1,6}[ \t]+)carrossel[ \t]*\n/i, "")
    .split(/^[ \t]*---[ \t]*$/m);
  if (separated.length >= 2) {
    while (separated.length && !separated[0].trim()) separated.shift();
    while (separated.length && !separated[separated.length - 1].trim())
      separated.pop();
    if (separated.length >= 2)
      return {
        isScript: true,
        slideCount: Math.min(separated.length, 10),
        slides: separated.map((block, slideIndex) => {
          const rawText = block.trim();
          return { slideIndex, rawText, ...extractTitleAndBody(rawText) };
        }),
        hasExtraneousSections,
        carouselSectionText: targetText !== raw ? targetText : undefined,
      };
  }

  // Estratégia 2: Itens numerados ordenados (1. ..., 2. ..., 3. ..., 4. ...)
  const numberedSlides = parseNumberedSlides(targetText);
  if (numberedSlides.length >= 3) {
    const boundedCount = Math.min(Math.max(numberedSlides.length, 2), 10);
    return {
      isScript: true,
      slideCount: boundedCount,
      slides: numberedSlides,
      hasExtraneousSections,
      carouselSectionText: targetText !== raw ? targetText : undefined,
    };
  }

  return {
    isScript: false,
    slideCount: 0,
    slides: [],
    hasExtraneousSections,
  };
}

function parseExplicitSlides(text: string): ParsedScriptSlide[] {
  // Encontra todas as posições dos marcadores "Slide X"
  const matches = Array.from(text.matchAll(SLIDE_MARKER_REGEX));
  if (matches.length < 2) return [];

  const slides: ParsedScriptSlide[] = [];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const slideNumber = parseInt(match[2], 10);
    let startIdx = match.index! + match[0].length;
    const decoration = match[1];
    const skipSpaces = () => {
      while (/[ \t]/.test(text[startIdx] ?? "") && startIdx < text.length)
        startIdx++;
    };
    // Close only the decoration that opened the marker. Body emphasis stays intact.
    const closesBeforeDelimiter = Boolean(
      decoration && text.startsWith(decoration, startIdx)
    );
    if (closesBeforeDelimiter) {
      startIdx += decoration.length;
      skipSpaces();
    }
    if (/[:.\-–—]/.test(text[startIdx] ?? "")) startIdx++;
    skipSpaces();
    if (
      decoration &&
      !closesBeforeDelimiter &&
      text.startsWith(decoration, startIdx)
    )
      startIdx += decoration.length;
    const endIdx = i + 1 < matches.length ? matches[i + 1].index! : text.length;

    const blockText = text.slice(startIdx, endIdx).trim();
    const { title, body } = extractTitleAndBody(blockText);

    slides.push({
      slideIndex: slideNumber - 1,
      title,
      body,
      rawText: blockText,
    });
  }

  return slides;
}

function parseNumberedSlides(text: string): ParsedScriptSlide[] {
  // Procura sequência ordenada 1., 2., 3., 4. no início de linhas
  const lines = text.split("\n");
  const numberedBlocks: Array<{ num: number; lines: string[] }> = [];
  let currentBlock: { num: number; lines: string[] } | null = null;

  for (const line of lines) {
    const match = line.match(/^[ \t]*(\d+)[\.\)][ \t]+(.*)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      // Se segue a sequência 1, 2, 3...
      if (!currentBlock && num === 1) {
        currentBlock = { num: 1, lines: [match[2]] };
        numberedBlocks.push(currentBlock);
      } else if (currentBlock && num === currentBlock.num + 1) {
        currentBlock = { num, lines: [match[2]] };
        numberedBlocks.push(currentBlock);
      } else if (currentBlock) {
        currentBlock.lines.push(line);
      }
    } else if (currentBlock) {
      currentBlock.lines.push(line);
    }
  }

  if (numberedBlocks.length < 3) return [];

  return numberedBlocks.map((b, idx) => {
    const rawText = b.lines.join("\n").trim();
    const { title, body } = extractTitleAndBody(rawText);
    return {
      slideIndex: idx,
      title,
      body,
      rawText,
    };
  });
}

function extractTitleAndBody(blockText: string): {
  title?: string;
  body?: string;
} {
  // Se contiver marcadores "Título:" e "Texto:" explícitos
  const titleMatch = blockText.match(
    /(?:t[ií]tulo|header|headline)[ \t]*[:-][ \t]*(.*?)(?:\n|$)/i
  );
  const textMatch = blockText.match(
    /(?:texto|corpo|body|descri[cç][aã]o)[ \t]*[:-][ \t]*([\s\S]*?)$/i
  );

  if (titleMatch && titleMatch[1].trim()) {
    const title = titleMatch[1].trim().replace(/^[*_]+|[*_]+$/g, "");
    let body = textMatch ? textMatch[1].trim() : undefined;
    if (body) {
      body = body.replace(/^[*_]+|[*_]+$/g, "");
    }
    return { title, body };
  }
  if (textMatch)
    return { body: textMatch[1].trim().replace(/^[*_]+|[*_]+$/g, "") };

  // Divisão heurística: primeira linha é título, demais são corpo
  const lines = blockText
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return {};
  if (lines.length === 1) {
    return { title: lines[0].replace(/^[*_]+|[*_]+$/g, "") };
  }

  const title = lines[0].replace(/^[*_]+|[*_]+$/g, "");
  const body = lines
    .slice(1)
    .join(" ")
    .replace(/^[*_]+|[*_]+$/g, "");
  return { title, body };
}
