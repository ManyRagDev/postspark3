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
 * - Slide 1:, Slide 1 -, **Slide 1:**, **Slide 1**
 * - Lâmina 1:, Lamina 1:, Tela 1:, Página 1:
 * - 1. Gancho:, 2. Solução:, 1. Título:
 */
const SLIDE_HEADER_REGEX = /(?:^|\n)[ \t]*(?:\*{1,2})?(?:slide|l[aâ]mina|tela|p[aá]gina)\s+(\d+)[ \t]*(?:\*{1,2})?[ \t]*[:-]?[ \t]*/i;
const NUMBERED_TOPIC_REGEX = /(?:^|\n)[ \t]*(\d+)[\.\)][ \t]+(?:gancho|problema|solu[cç][aã]o|fechamento|cta|t[ií]tulo|texto)?[ \t]*[:-]?[ \t]*/i;

export function detectScriptStructure(text: string): ScriptDetectionResult {
  if (!text || text.trim().length < 30) {
    return {
      isScript: false,
      slideCount: 0,
      slides: [],
      hasExtraneousSections: false,
    };
  }

  const raw = text.normalize("NFC");

  // Verifica se há seções múltiplas (ex: "## Roteiro Reels" e "## Carrossel")
  const hasReels = /roteiro\s+reels|vídeo\s+reels|tiktok/i.test(raw);
  const hasCarouselHeading = /##\s*carrossel|#\s*carrossel|carrossel\s*:/i.test(raw);
  const hasCaption = /##\s*legenda|legenda\s*:/i.test(raw);
  const hasExtraneousSections = hasReels || hasCaption;

  let targetText = raw;

  // Se houver uma seção específica "## Carrossel", isola para análise prioritária
  if (hasCarouselHeading) {
    const match = raw.match(/(?:##|#)[ \t]*carrossel[\s\S]*?(?=(?:##|#)[ \t]*legenda|$)/i);
    if (match && match[0].length > 40) {
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
      slides: explicitSlides.slice(0, 10),
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
      slides: numberedSlides.slice(0, 10),
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
  const markerRegex = /(?:^|\n)[ \t]*(?:\*{1,2})?(?:slide|l[aâ]mina|tela|p[aá]gina)\s+(\d+)[ \t]*(?:\*{1,2})?[ \t]*[:-]?[ \t]*/gi;
  const matches = Array.from(text.matchAll(markerRegex));
  if (matches.length < 2) return [];

  const slides: ParsedScriptSlide[] = [];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const slideNumber = parseInt(match[1], 10);
    const startIdx = match.index! + match[0].length;
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
    } else if (currentBlock && line.trim().length > 0) {
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

function extractTitleAndBody(blockText: string): { title?: string; body?: string } {
  // Se contiver marcadores "Título:" e "Texto:" explícitos
  const titleMatch = blockText.match(/(?:t[ií]tulo|header|headline)[ \t]*[:-][ \t]*(.*?)(?:\n|$)/i);
  const textMatch = blockText.match(/(?:texto|corpo|body|descri[cç][aã]o)[ \t]*[:-][ \t]*([\s\S]*?)$/i);

  if (titleMatch && titleMatch[1].trim()) {
    const title = titleMatch[1].trim().replace(/^[*_]+|[*_]+$/g, "");
    let body = textMatch ? textMatch[1].trim() : undefined;
    if (body) {
      body = body.replace(/^[*_]+|[*_]+$/g, "");
    }
    return { title, body };
  }

  // Divisão heurística: primeira linha é título, demais são corpo
  const lines = blockText.split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return {};
  if (lines.length === 1) {
    return { title: lines[0].replace(/^[*_]+|[*_]+$/g, "") };
  }

  const title = lines[0].replace(/^[*_]+|[*_]+$/g, "");
  const body = lines.slice(1).join(" ").replace(/^[*_]+|[*_]+$/g, "");
  return { title, body };
}
