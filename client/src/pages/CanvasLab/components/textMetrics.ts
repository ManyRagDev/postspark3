/**
 * Módulo Canônico de Métricas Tipográficas para Konva (SPEC / CanvasLab)
 *
 * Elimina adivinhações heurísticas e garante que efeitos de fundo (strip-line,
 * box-card, etc.), alças de seleção (Transformer) e guardiões de sobreposição
 * usem EXATAMENTE a mesma medição de linhas e alturas do motor gráfico do Konva/Canvas.
 */

import Konva from "konva";

export interface TextMetricsConfig {
  text: string;
  width: number;
  fontSize: number;
  fontFamily: string;
  fontStyle?: string;
  letterSpacing?: number;
  lineHeight?: number;
}

export interface TextMetricsResult {
  lines: Array<{ text: string; width: number }>;
  height: number;
  lineCount: number;
}

/**
 * Mede as quebras de linha e a altura real de um bloco de texto no Konva.
 *
 * No browser: instancia um nó `Konva.Text` síncrono que executa o cálculo exato
 * de wrapping de palavras usando o canvas 2D nativo do Konva.
 *
 * No Node / SSR (ex.: Vitest): utiliza um fallback determinístico para não quebrar
 * o ambiente de testes sem DOM completo.
 */
export function getKonvaTextMetrics(config: TextMetricsConfig): TextMetricsResult {
  const {
    text,
    width,
    fontSize,
    fontFamily,
    fontStyle = "normal",
    letterSpacing = 0,
    lineHeight = 1.25,
  } = config;

  if (!text || text.trim().length === 0) {
    return {
      lines: [],
      height: 0,
      lineCount: 0,
    };
  }

  const effectiveWidth = Math.max(20, width);
  const effectiveLineHeightPx = fontSize * lineHeight;

  // 1. Ambiente de Navegador Real (Konva Nativo com Canvas 2D)
  if (typeof window !== "undefined" && typeof document !== "undefined") {
    try {
      const dummy = new Konva.Text({
        text,
        width: effectiveWidth,
        fontSize,
        fontFamily,
        fontStyle,
        letterSpacing,
        lineHeight,
        wrap: "word",
      });

      const lines = (dummy.textArr || []).map((l: any) => ({
        text: (l.text as string) || "",
        width: Number(l.width || 0),
      }));

      const computedHeight = dummy.height();
      dummy.destroy();

      if (lines.length > 0) {
        return {
          lines,
          height: Math.max(computedHeight, lines.length * effectiveLineHeightPx),
          lineCount: lines.length,
        };
      }
    } catch {
      // Se falhar por algum motivo no Konva, continua para o fallback de Canvas 2D
    }

    // Fallback Canvas 2D nativo
    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.font = `${fontStyle} ${fontSize}px "${fontFamily}", sans-serif`;
        const words = text.split(" ");
        const lines: Array<{ text: string; width: number }> = [];
        let curLine = "";

        for (const w of words) {
          const testLine = curLine ? `${curLine} ${w}` : w;
          const testW = ctx.measureText(testLine).width + letterSpacing * testLine.length;
          if (testW > effectiveWidth && curLine) {
            const lineW = ctx.measureText(curLine).width + letterSpacing * curLine.length;
            lines.push({ text: curLine, width: lineW });
            curLine = w;
          } else {
            curLine = testLine;
          }
        }
        if (curLine) {
          const lineW = ctx.measureText(curLine).width + letterSpacing * curLine.length;
          lines.push({ text: curLine, width: lineW });
        }

        const validLines = lines.length > 0 ? lines : [{ text, width: effectiveWidth }];
        return {
          lines: validLines,
          height: validLines.length * effectiveLineHeightPx,
          lineCount: validLines.length,
        };
      }
    } catch {
      // Segue para fallback matemático se Canvas 2D falhar
    }
  }

  // 2. Fallback Seguro para Node / SSR / Testes
  // Para fontes densas/condensadas, estima largura média de 0.45 * fontSize
  const avgCharWidth = fontSize * 0.45;
  const maxCharsPerLine = Math.max(6, Math.floor(effectiveWidth / avgCharWidth));
  const paragraphs = text.split("\n");
  const fallbackLines: Array<{ text: string; width: number }> = [];

  for (const para of paragraphs) {
    const words = para.split(" ");
    let curLine = "";
    for (const w of words) {
      const candidate = curLine ? `${curLine} ${w}` : w;
      if (candidate.length <= maxCharsPerLine) {
        curLine = candidate;
      } else {
        if (curLine) {
          fallbackLines.push({
            text: curLine,
            width: Math.min(effectiveWidth, curLine.length * avgCharWidth),
          });
        }
        curLine = w;
      }
    }
    if (curLine) {
      fallbackLines.push({
        text: curLine,
        width: Math.min(effectiveWidth, curLine.length * avgCharWidth),
      });
    }
  }

  const finalLines = fallbackLines.length > 0 ? fallbackLines : [{ text, width: effectiveWidth }];
  return {
    lines: finalLines,
    height: finalLines.length * effectiveLineHeightPx,
    lineCount: finalLines.length,
  };
}
