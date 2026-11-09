import type { DesignDna, PostIntent } from "@shared/designExtraction";
import {
  INITIAL_POST,
  isDarkColor,
  resolveLegibleTextColor,
  type AspectRatioType,
  type CanvasCustomShape,
  type CanvasCustomText,
  type CanvasPostModel,
} from "../CanvasLab/components/types";

/**
 * Compositor determinístico: transforma DNA + intenção em um CanvasPostModel editável.
 * Coordenadas canônicas do CanvasLab (360px de largura). A IA nunca desenha:
 * ela só decide estilo e copy; toda geometria sai daqui.
 */
const W = 360;
const M = 20;
const CW = W - M * 2;
const HEIGHTS: Record<AspectRatioType, number> = { "1:1": 360, "4:5": 450, "5:6": 432, "9:16": 640 };

export interface WrappedFit {
  fontSize: number;
  lines: number;
  height: number;
}

/** Estimativa de quebra de linha sem medir fonte: conservadora para evitar sobreposição. */
export function fitFont(
  text: string,
  width: number,
  maxHeight: number,
  maxFont: number,
  minFont: number,
  options: { charWidth?: number; lineHeight?: number } = {}
): WrappedFit {
  const charWidth = options.charWidth ?? 0.58;
  const lineHeight = options.lineHeight ?? 1.18;
  const words = text.trim().split(/\s+/).filter(Boolean);
  const measure = (fontSize: number) => {
    const limit = Math.max(1, Math.floor(width / (fontSize * charWidth)));
    let lines = 1;
    let current = 0;
    for (const word of words) {
      const len = Math.min(word.length, limit);
      if (current === 0) current = len;
      else if (current + 1 + len <= limit) current += 1 + len;
      else {
        lines += 1;
        current = len;
      }
      if (word.length > limit) lines += Math.ceil(word.length / limit) - 1;
    }
    return lines;
  };
  for (let fs = Math.floor(maxFont); fs >= minFont; fs--) {
    const lines = measure(fs);
    const height = lines * fs * lineHeight;
    if (height <= maxHeight) return { fontSize: fs, lines, height };
  }
  const lines = measure(minFont);
  return { fontSize: minFont, lines, height: lines * minFont * lineHeight };
}

function mix(a: string, b: string, t: number): string {
  const parse = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const to = (x: number) => Math.round(x).toString(16).padStart(2, "0");
  return `#${to(ar + (br - ar) * t)}${to(ag + (bg - ag) * t)}${to(ab + (bb - ab) * t)}`.toUpperCase();
}

class Scene {
  shapes: CanvasCustomShape[] = [];
  texts: CanvasCustomText[] = [];
  private seq = 0;
  readonly border: number;
  readonly shadow: number;

  constructor(private readonly dna: DesignDna) {
    const s = dna.surfaces;
    this.border = s.borderWidth > 0 ? Math.max(1.5, (s.borderWidth * W) / 1080) : 0;
    this.shadow = s.hardShadow ? Math.max(3, (s.shadowOffset * W) / 1080) : 0;
  }

  box(
    x: number,
    y: number,
    w: number,
    h: number,
    fill: string,
    options: { border?: boolean; shadow?: boolean; borderColor?: string } = {}
  ) {
    const borderColor = options.borderColor ?? this.dna.surfaces.borderColor;
    const useBorder = (options.border ?? true) && this.border > 0;
    const useShadow = (options.shadow ?? true) && this.shadow > 0;
    if (useShadow) this.shapes.push({ id: `shape-${this.seq++}`, x: x + this.shadow, y: y + this.shadow, width: w, height: h, color: borderColor });
    if (useBorder) {
      this.shapes.push({ id: `shape-${this.seq++}`, x, y, width: w, height: h, color: borderColor });
      this.shapes.push({ id: `shape-${this.seq++}`, x: x + this.border, y: y + this.border, width: w - this.border * 2, height: h - this.border * 2, color: fill });
    } else {
      this.shapes.push({ id: `shape-${this.seq++}`, x, y, width: w, height: h, color: fill });
    }
  }

  text(
    value: string,
    x: number,
    y: number,
    width: number,
    fontSize: number,
    font: string,
    weight: number,
    color: string,
    align: "left" | "center" | "right" = "left",
    opacity?: number
  ) {
    this.texts.push({
      id: `text-${this.seq++}`,
      text: value,
      x,
      y,
      width,
      fontSize,
      fontFamily: font,
      fontWeight: weight,
      color,
      align,
      ...(opacity !== undefined ? { opacity } : {}),
    });
  }
}

export interface IntentComposeOptions {
  aspectRatio?: AspectRatioType;
}

export function intentToCanvasModel(
  dna: DesignDna,
  intent: PostIntent,
  options: IntentComposeOptions = {}
): CanvasPostModel {
  const aspectRatio = options.aspectRatio ?? "4:5";
  const H = HEIGHTS[aspectRatio];
  const pal = dna.palette;
  const ty = dna.typography;
  const heading = ty.headingFont;
  const bodyFont = ty.bodyFont;
  const labelFont = ty.labelFont;
  const label = (s: string) => (ty.uppercaseLabels ? s.toUpperCase() : s);
  const accents = [pal.accent, pal.accent2, pal.accent3];
  const scene = new Scene(dna);
  const onFill = (fill: string, preferred?: string) => resolveLegibleTextColor(fill, preferred ?? pal.text);

  const hasFooter = Boolean(intent.footerNote.trim());
  const ctaH = 38;
  const ctaTop = H - M - (hasFooter ? 16 : 0) - ctaH;
  let y = M;

  if (dna.brandName) {
    scene.text(dna.brandName, M, y, CW * 0.7, 11, heading, 700, pal.text);
    y += 22;
  } else {
    y += 4;
  }

  const eyebrow = label(intent.eyebrow);
  const eyebrowW = Math.min(CW, eyebrow.length * 8 * 0.72 + 22);
  scene.box(M, y, eyebrowW, 18, pal.accent3);
  scene.text(eyebrow, M, y + 5, eyebrowW, 8, labelFont, 700, onFill(pal.accent3), "center");
  y += 18 + 14;

  const headlineBudget = Math.min((ctaTop - y) * 0.4, aspectRatio === "1:1" ? 90 : 150);
  const maxHeadlineFont = aspectRatio === "9:16" ? 36 : 30;
  const isQuote = intent.kind === "quote";

  if (isQuote) {
    const pad = 14;
    const fit = fitFont(intent.headline, CW - pad * 2, headlineBudget, maxHeadlineFont - 6, 13);
    const cardH = fit.height + pad * 2 + 20;
    scene.box(M, y, CW, cardH, pal.surface);
    scene.text("“", M + pad, y + 2, 40, 40, heading, 800, pal.accent);
    scene.text(intent.headline, M + pad, y + pad + 20, CW - pad * 2, fit.fontSize, heading, ty.headingWeight, onFill(pal.surface), "left");
    y += cardH + 12;
  } else {
    const fit = fitFont(intent.headline, CW, headlineBudget, maxHeadlineFont, 14);
    scene.text(intent.headline, M, y, CW, fit.fontSize, heading, ty.headingWeight, onFill(pal.background), "left");
    y += fit.height + 10;
  }

  if (intent.highlight && intent.highlight.trim()) {
    const hl = label(intent.highlight);
    const hlW = Math.min(CW, hl.length * 15 * 0.62 + 26);
    scene.box(M, y, hlW, 26, pal.accent2);
    scene.text(hl, M, y + 6, hlW, 15, heading, 800, onFill(pal.accent2), "center");
    y += 26 + 14;
  }

  const top = y;
  const avail = Math.max(0, ctaTop - 14 - top);
  const items = intent.items.filter(item => item.title.trim() || item.text.trim());

  if (avail >= 48 && items.length > 0) {
    switch (intent.kind) {
      case "value-pillars": {
        const list = items.slice(0, 3);
        const gap = 10;
        const cardW = (CW - gap * (list.length - 1)) / list.length;
        const cardH = Math.min(avail - 4, 150);
        list.forEach((item, i) => {
          const x = M + i * (cardW + gap);
          scene.box(x, top, cardW, cardH, pal.surface);
          scene.box(x + 8, top + 8, 20, 20, accents[i % 3], { shadow: false });
          scene.text(String(i + 1), x + 8, top + 13, 20, 10, labelFont, 800, onFill(accents[i % 3]), "center");
          const inner = cardW - 16;
          const t = fitFont(item.title, inner, 40, 12, 9);
          scene.text(item.title, x + 8, top + 36, inner, t.fontSize, heading, 700, onFill(pal.surface));
          const room = cardH - 36 - t.height - 14;
          if (room > 10 && item.text) {
            const b = fitFont(item.text, inner, room, 9, 7);
            scene.text(item.text, x + 8, top + 36 + t.height + 6, inner, b.fontSize, bodyFont, 500, onFill(pal.surface), "left", 0.8);
          }
        });
        break;
      }
      case "steps": {
        const list = items.slice(0, avail >= 170 ? 3 : 2);
        const gap = 10;
        const rowH = Math.min(70, (avail - gap * (list.length - 1)) / list.length);
        list.forEach((item, i) => {
          const rowY = top + i * (rowH + gap);
          scene.box(M, rowY, CW, rowH, pal.surface);
          const numW = Math.min(40, rowH - 16);
          scene.box(M + 8, rowY + 8, numW, numW, accents[i % 3], { shadow: false });
          scene.text(String(i + 1).padStart(2, "0"), M + 8, rowY + 8 + numW / 2 - 7, numW, 14, labelFont, 800, onFill(accents[i % 3]), "center");
          const tx = M + 8 + numW + 12;
          const tw = CW - (tx - M) - 8;
          const t = fitFont(item.title, tw, rowH * 0.4, 12, 9);
          scene.text(item.title, tx, rowY + 8, tw, t.fontSize, heading, 700, onFill(pal.surface));
          const room = rowH - 16 - t.height - 2;
          if (room > 9 && item.text) {
            const b = fitFont(item.text, tw, room, 9, 7);
            scene.text(item.text, tx, rowY + 8 + t.height + 2, tw, b.fontSize, bodyFont, 500, onFill(pal.surface), "left", 0.8);
          }
        });
        break;
      }
      case "versus": {
        const gap = 12;
        const colW = (CW - gap) / 2;
        const cardH = Math.min(avail - 4, 230);
        const columns = [
          { side: "left" as const, x: M, title: intent.leftLabel ?? "Antes", head: mix(pal.surface, pal.text, 0.18), border: mix(dna.surfaces.borderColor, "#888888", 0.6), shadow: false, mark: "×" },
          { side: "right" as const, x: M + colW + gap, title: intent.rightLabel ?? "Depois", head: pal.accent3, border: dna.surfaces.borderColor, shadow: true, mark: "+" },
        ];
        for (const col of columns) {
          scene.box(col.x, top, colW, cardH, col.side === "left" ? mix(pal.surface, pal.background, 0.5) : pal.surface, { borderColor: col.border, shadow: col.shadow });
          scene.box(col.x + 8, top + 8, colW - 16, 20, col.head, { shadow: false, borderColor: col.border });
          scene.text(label(col.title), col.x + 8, top + 14, colW - 16, 8, labelFont, 800, onFill(col.head), "center");
          const bullets = items.filter(i => i.side === col.side).slice(0, 5);
          if (bullets.length === 0) continue;
          const per = (cardH - 44) / bullets.length;
          bullets.forEach((b, i) => {
            const fit = fitFont(b.text || b.title, colW - 32, per - 4, 10, 7);
            const by = top + 38 + i * per;
            scene.text(col.mark, col.x + 8, by, 14, fit.fontSize, labelFont, 800, col.side === "left" ? mix(pal.text, pal.background, 0.4) : pal.accent);
            scene.text(b.text || b.title, col.x + 24, by, colW - 32, fit.fontSize, bodyFont, col.side === "left" ? 500 : 700, onFill(pal.surface));
          });
        }
        break;
      }
      case "quote": {
        const item = items[0];
        const cardH = Math.min(avail - 4, 110);
        scene.box(M, top, CW, cardH, pal.accent2);
        const fill = pal.accent2;
        scene.text(label(item.title || "Solução"), M + 12, top + 10, CW - 24, 8, labelFont, 800, onFill(fill));
        const b = fitFont(item.text || item.title, CW - 24, cardH - 34, 14, 8);
        scene.text(item.text || item.title, M + 12, top + 26, CW - 24, b.fontSize, heading, 700, onFill(fill));
        break;
      }
      case "proof": {
        const list = items.slice(0, 3);
        const panelFill = isDarkColor(pal.text) ? pal.text : pal.surface;
        const panelText = resolveLegibleTextColor(panelFill, pal.background);
        const cardH = Math.min(avail - 4, 220);
        scene.box(M, top, CW, cardH, panelFill);
        const per = (cardH - 20) / list.length;
        list.forEach((item, i) => {
          const iy = top + 12 + i * per;
          scene.text(label(item.title), M + 14, iy, CW - 28, 8, labelFont, 800, pal.accent3);
          const b = fitFont(item.text || item.title, CW - 28, per - 24, 12, 8);
          scene.text(item.text || item.title, M + 14, iy + 14, CW - 28, b.fontSize, bodyFont, 600, panelText);
        });
        break;
      }
    }
  }

  scene.box(M, ctaTop, CW, ctaH, pal.accent);
  const cta = label(intent.ctaLabel);
  const ctaFit = fitFont(cta, CW - 20, ctaH - 10, 13, 8, { charWidth: 0.66 });
  scene.text(cta, M + 10, ctaTop + (ctaH - ctaFit.height) / 2, CW - 20, ctaFit.fontSize, heading, 800, onFill(pal.accent), "center");
  if (hasFooter) {
    scene.text(intent.footerNote, M, ctaTop + ctaH + 8, CW, 8, bodyFont, 500, pal.text, "center", 0.7);
  }

  const slideId = "slide-1";
  return {
    ...structuredClone(INITIAL_POST),
    id: `extracted-${intent.kind}-${crypto.randomUUID()}`,
    aspectRatio,
    familyId: "minimal-air",
    familyName: dna.styleName,
    fontFamily: heading,
    subtextFontFamily: bodyFont,
    headline: "",
    subtext: "",
    caption: intent.caption,
    headlineAlign: "left",
    bodyAlign: "left",
    palette: {
      background: pal.background,
      text: pal.text,
      accent: pal.accent,
      surface: pal.surface,
      headlineColor: pal.text,
      subtextColor: pal.text,
    },
    overlayOpacity: 0,
    showBadge: false,
    showStep: false,
    isSnapEnabled: true,
    currentSlideIndex: 0,
    slides: [
      {
        id: slideId,
        step: "",
        headline: "",
        subtext: "",
        suppressFamilyDecorations: true,
        extraShapes: scene.shapes,
        extraTexts: scene.texts,
      },
    ],
  };
}
