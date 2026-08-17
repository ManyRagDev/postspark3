import {
  type AdvancedLayoutSettings,
  type AspectRatio,
  type LayoutPosition,
  type PostVisualSnapshot,
  type TextElement,
  type VisualFitIssue,
  type VisualFitIssueType,
} from "./postspark";
import { layoutToAdvanced } from "./layoutToAdvanced";
import { safeAreaMarginsPercent } from "./creative/layoutArchetypes";

export type { VisualFitIssue, VisualFitIssueType };

const REFERENCE_CANVAS_WIDTH = 360;
const MIN_CARD_WIDTH = 72;
const MIN_STRUCTURED_CARD_WIDTH = 90;
const MIN_TEXT_GAP = 4;

export interface VisualFitResult {
  ok: boolean;
  issues: VisualFitIssue[];
  suggestedFallback?: "flow-layout" | "expand-card" | "drop-text-elements";
}

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function canvasHeight(aspectRatio: AspectRatio): number {
  const [w, h] = aspectRatio.split(":").map(Number);
  if (!w || !h) return REFERENCE_CANVAS_WIDTH;
  return (REFERENCE_CANVAS_WIDTH * h) / w;
}

export function textHeightPercent(
  text: string,
  widthPercent: number,
  aspectRatio: AspectRatio,
  kind: "headline" | "body",
): number {
  const fontPx = kind === "headline" ? 26 : 13;
  const lineHeight = kind === "headline" ? 1.15 : 1.55;
  const widthPx = (Math.max(10, Math.min(100, widthPercent)) / 100) * REFERENCE_CANVAS_WIDTH;
  const charsPerLine = Math.max(6, widthPx / (fontPx * 0.55));
  const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
  return Math.min(100, ((lines * fontPx * lineHeight) / canvasHeight(aspectRatio)) * 100 * 1.2);
}

function positionCenter(position: LayoutPosition["position"]): { x: number; y: number } {
  switch (position) {
    case "top-left":
      return { x: 25, y: 18 };
    case "top-center":
      return { x: 50, y: 18 };
    case "top-right":
      return { x: 75, y: 18 };
    case "center-left":
      return { x: 25, y: 50 };
    case "center":
      return { x: 50, y: 50 };
    case "center-right":
      return { x: 75, y: 50 };
    case "bottom-left":
      return { x: 25, y: 82 };
    case "bottom-center":
      return { x: 50, y: 82 };
    case "bottom-right":
      return { x: 75, y: 82 };
    default:
      return { x: 50, y: 50 };
  }
}

export function layoutRect(
  pos: LayoutPosition,
  text: string,
  aspectRatio: AspectRatio,
  kind: "headline" | "body",
): Rect {
  const width = pos.width ?? 80;
  const center = pos.freePosition ?? positionCenter(pos.position);
  // Quando a família declara altura explícita (freePosition+width+height, o
  // mesmo contrato que o resolvedor tipográfico usa), medimos a MESMA caixa —
  // senão a validação compara contra uma caixa diferente da que o resolvedor
  // preenche de fato (heurística de contagem de caractere), e nunca detecta
  // estouro real.
  const height = typeof pos.height === "number" ? pos.height : textHeightPercent(text, width, aspectRatio, kind);
  return {
    left: center.x - width / 2,
    right: center.x + width / 2,
    top: center.y - height / 2,
    bottom: center.y + height / 2,
  };
}

function textElementRect(element: TextElement, aspectRatio: AspectRatio): Rect {
  const widthPx = typeof element.width === "number" ? element.width : 120;
  const fontPx = Number.parseFloat(element.styles.fontSize || "16") || 16;
  const lineHeight = Number.parseFloat(element.styles.lineHeight || "1.2") || 1.2;
  const charsPerLine = Math.max(4, widthPx / (fontPx * 0.55));
  const lines = Math.max(1, Math.ceil(element.text.length / charsPerLine));
  const heightPx = typeof element.height === "number"
    ? element.height
    : lines * fontPx * lineHeight + 4;
  const height = canvasHeight(aspectRatio);
  return {
    left: (element.x / REFERENCE_CANVAS_WIDTH) * 100,
    right: ((element.x + widthPx) / REFERENCE_CANVAS_WIDTH) * 100,
    top: (element.y / height) * 100,
    bottom: ((element.y + heightPx) / height) * 100,
  };
}

/**
 * Rect direto de geometria declarada, sem heurística de texto — usado para
 * seções (sectionGrid), que têm altura explícita fixa, não medida por
 * contagem de caracteres como headline/body.
 */
function explicitRect(pos: LayoutPosition | undefined): Rect | undefined {
  if (!pos?.freePosition || typeof pos.width !== "number" || typeof pos.height !== "number") return undefined;
  const { x, y } = pos.freePosition;
  return { left: x - pos.width / 2, right: x + pos.width / 2, top: y - pos.height / 2, bottom: y + pos.height / 2 };
}

function overlaps(a: Rect, b: Rect, gap = 0): boolean {
  return a.left < b.right + gap &&
    a.right > b.left - gap &&
    a.top < b.bottom + gap &&
    a.bottom > b.top - gap;
}

function outside(rect: Rect): boolean {
  return rect.left < 0 || rect.top < 0 || rect.right > 100 || rect.bottom > 100;
}

function isGeneratedDecoration(element: TextElement): boolean {
  return element.id.startsWith("cd-");
}

function flowLayout(snapshot: PostVisualSnapshot): AdvancedLayoutSettings {
  return layoutToAdvanced(snapshot.layout);
}

function hasStructuredSections(snapshot: PostVisualSnapshot): boolean {
  return (snapshot.template ?? "simple") !== "simple" && (snapshot.sections?.length ?? 0) > 0;
}

function estimatedWrappedLines(text: string, widthPercent: number, fontPx: number): number {
  if (!text.trim()) return 0;
  const widthPx = (Math.max(10, Math.min(100, widthPercent)) / 100) * REFERENCE_CANVAS_WIDTH;
  const charsPerLine = Math.max(4, Math.floor(widthPx / (fontPx * 0.55)));
  let lines = 1;
  let used = 0;
  for (const word of text.trim().split(/\s+/)) {
    const length = word.length;
    if (length > charsPerLine) {
      if (used > 0) lines += 1;
      lines += Math.ceil(length / charsPerLine) - 1;
      used = length % charsPerLine;
    } else if (used === 0) used = length;
    else if (used + 1 + length <= charsPerLine) used += 1 + length;
    else {
      lines += 1;
      used = length;
    }
  }
  return lines;
}

function clampedCopyIssues(snapshot: PostVisualSnapshot, structured: boolean): VisualFitIssue[] {
  if (snapshot.aspectRatio === "9:16") return [];
  const headline = snapshot.headline ?? "";
  const body = snapshot.body ?? "";
  const headlineLen = headline.length;
  const totalLen = headlineLen + body.length;
  const portrait = snapshot.aspectRatio === "5:6";
  const headlineRem = Math.max(
    portrait ? 1.05 : 1.1,
    (structured ? 1.38 : portrait ? 1.55 : 1.65) -
      Math.max(0, headlineLen - (portrait ? 35 : 40)) * 0.014,
  ) * (snapshot.headlineFontSize ?? 1);
  const bodyRem = Math.max(
    portrait ? 0.75 : 0.78,
    (structured ? 0.8 : portrait ? 0.9 : 0.95) -
      Math.max(0, totalLen - (portrait ? 110 : 120)) * (portrait ? 0.001 : 0.0008),
  ) * (snapshot.bodyFontSize ?? 1);
  const headlineClamp = headlineLen > 60 ? 3 : 2;
  const bodyClamp = portrait ? (totalLen > 140 ? 4 : 3) : 4;
  const headlineLines = estimatedWrappedLines(
    headline,
    snapshot.layoutSettings.headline.width ?? snapshot.layoutSettings.card.width ?? 80,
    headlineRem * 16,
  );
  const bodyLines = estimatedWrappedLines(
    body,
    snapshot.layoutSettings.body.width ?? snapshot.layoutSettings.card.width ?? 80,
    bodyRem * 16,
  );
  const issues: VisualFitIssue[] = [];
  if (headlineLines > headlineClamp) issues.push({
    type: "text_exceeds_visible_area",
    target: "headline",
    detail: `Headline needs about ${headlineLines} lines, but the renderer shows at most ${headlineClamp}.`,
  });
  if (body && bodyLines > bodyClamp) issues.push({
    type: "text_exceeds_visible_area",
    target: "body",
    detail: `Body needs about ${bodyLines} lines, but the renderer shows at most ${bodyClamp}.`,
  });
  return issues;
}

export function validateVisualFit(snapshot: PostVisualSnapshot): VisualFitResult {
  const issues: VisualFitIssue[] = [];
  const structured = hasStructuredSections(snapshot);
  const { layoutSettings } = snapshot;
  const headlineRect = layoutRect(layoutSettings.headline, snapshot.headline ?? "", snapshot.aspectRatio, "headline");
  const bodyRect = snapshot.body
    ? layoutRect(layoutSettings.body, snapshot.body, snapshot.aspectRatio, "body")
    : undefined;

  // CR-003/CR-008: o HEADLINE posicionado é legítimo em templates estruturados
  // (versus, mosaic-grid, data-punch declaram o slot do título no topo e as
  // seções fluem abaixo) — a proibição de `freePosition` vale para BODY e
  // CARD, que precisam continuar em fluxo. Sem isso, toda geração real dessas
  // famílias caía em flow-layout e perdia a resolução tipográfica.
  if (
    structured &&
    (layoutSettings.body.freePosition || layoutSettings.card.freePosition)
  ) {
    issues.push({
      type: "structured_absolute_layout",
      target: "layoutSettings",
      detail: "Structured templates must render body and card in flow; only the headline may be absolutely positioned.",
    });
  }

  // Colisão headline vs seções: só se aplica quando o headline tem geometria
  // explícita (famílias que declaram sectionGrid, ex.: versus, mosaic-grid).
  // Rects de seção são construídos direto da geometria declarada (sem
  // heurística de texto) — ver `explicitRect`.
  if (structured && layoutSettings.headline.freePosition) {
    const sections = snapshot.sections ?? [];
    const sectionRects: Rect[] = [];
    let missingGeometry = false;
    sections.forEach((section, index) => {
      const id = section.id ?? `section-${index + 1}`;
      const rect = explicitRect(layoutSettings.sectionLayouts?.[id]);
      if (!rect) {
        missingGeometry = true;
        return;
      }
      sectionRects.push(rect);
    });

    if (missingGeometry) {
      issues.push({
        type: "section_missing_geometry",
        target: "sectionLayouts",
        detail: "Template estruturado com headline em freePosition exige geometria explícita para cada seção.",
      });
    }

    const collides = sectionRects.some(
      (rect) =>
        overlaps(rect, headlineRect, MIN_TEXT_GAP) ||
        (bodyRect && layoutSettings.body.freePosition && overlaps(rect, bodyRect, MIN_TEXT_GAP)) ||
        sectionRects.some((other) => other !== rect && overlaps(rect, other, 0)),
    );
    if (collides) {
      issues.push({
        type: "section_overlap",
        target: "sectionLayouts",
        detail: "Estimated section box overlaps headline, body, or another section.",
      });
    }
  }

  // SPEC-002 passo 6: safe area absorvida do resolvedor do Next (adaptada
  // para % do canvas). Só para geometria explícita (freePosition) de
  // snapshots v4 — posição simbólica legada (v1-v3) nunca declarou intenção
  // de safe area, então não há o que violar.
  if (snapshot.snapshotVersion === 4) {
    const margins = safeAreaMarginsPercent(snapshot.aspectRatio);
    const outsideSafeArea = (rect: Rect, target: string) =>
      rect.left < margins.left ||
      rect.top < margins.top ||
      rect.right > 100 - margins.right ||
      rect.bottom > 100 - margins.bottom;

    if (layoutSettings.headline.freePosition && outsideSafeArea(headlineRect, "headline")) {
      issues.push({
        type: "outside_safe_area",
        target: "headline",
        detail: `Headline box extends past the safe area margins for ${snapshot.aspectRatio} (top ${margins.top}%, bottom ${margins.bottom}%, sides ${margins.left}%).`,
      });
    }
    if (bodyRect && layoutSettings.body.freePosition && outsideSafeArea(bodyRect, "body")) {
      issues.push({
        type: "outside_safe_area",
        target: "body",
        detail: `Body box extends past the safe area margins for ${snapshot.aspectRatio} (top ${margins.top}%, bottom ${margins.bottom}%, sides ${margins.left}%).`,
      });
    }
  }

  if (bodyRect && overlaps(headlineRect, bodyRect, MIN_TEXT_GAP)) {
    issues.push({
      type: "headline_body_overlap",
      target: "headline/body",
      detail: "Estimated headline and body boxes overlap.",
    });
  }

  const cardWidth = layoutSettings.card.width ?? 100;
  const requiredCardWidth = structured ? MIN_STRUCTURED_CARD_WIDTH : MIN_CARD_WIDTH;
  if (cardWidth < requiredCardWidth) {
    issues.push({
      type: "card_too_narrow",
      target: "card",
      detail: `Card width ${cardWidth}% is below required ${requiredCardWidth}%.`,
    });
  }

  for (const element of snapshot.textElements ?? []) {
    if (!isGeneratedDecoration(element)) continue;
    const rect = textElementRect(element, snapshot.aspectRatio);
    if (outside(rect)) {
      issues.push({
        type: "text_element_outside_canvas",
        target: element.id,
        detail: "Generated decorative text element is outside the canvas.",
      });
      continue;
    }
    if (overlaps(rect, headlineRect, 2) || (bodyRect && overlaps(rect, bodyRect, 2))) {
      issues.push({
        type: "text_element_overlaps_copy",
        target: element.id,
        detail: "Generated decorative text element overlaps primary copy.",
      });
    }
  }

  // Model the renderer's font decay, text-box width and line-clamp. A plain
  // character limit misses short copy placed in a narrow text box.
  issues.push(...clampedCopyIssues(snapshot, structured));

  return {
    ok: issues.length === 0,
    issues,
    suggestedFallback: issues.some((issue) => issue.type.startsWith("text_element"))
      ? "drop-text-elements"
      : issues.some((issue) => issue.type === "card_too_narrow")
        ? "expand-card"
        : issues.length > 0
          ? "flow-layout"
          : undefined,
  };
}

/**
 * SPEC-001 (docs/reforma/SPEC-001): esta função só decide GEOMETRIA (posição,
 * largura de card, remoção de elemento decorativo colidente) — nunca tamanho
 * de fonte. `createPostVisualSnapshot` chama isto ANTES do resolvedor
 * tipográfico canônico (`shared/typography/resolve.ts`), então quando o
 * fallback troca `layoutSettings.headline/body` para flow-layout (sem
 * `freePosition`), o resolvedor reporta `typographyResolutionError:
 * "missing-geometry"` em vez de inventar uma decisão — não é uma segunda
 * autoridade tipográfica, é o mesmo `layoutSettings` que o resolvedor lê.
 * `validateVisualFit`/`clampedCopyIssues` ainda estimam overlap por contagem
 * de caracteres (heurística antiga); um snapshot v4 com geometria explícita
 * correta normalmente não aciona esse ramo.
 */
export interface VisualFitFallbackOptions {
  /** True quando o resolvedor tipográfico canônico já encaixou esta geometria.
   *  Nesse caso as heurísticas legadas (contagem de caractere) não podem desfazê-la. */
  geometryResolved?: boolean;
}

export function applyVisualFitFallback(
  snapshot: PostVisualSnapshot,
  options: VisualFitFallbackOptions = {},
): PostVisualSnapshot {
  const result = validateVisualFit(snapshot);
  if (result.ok) return snapshot;

  const structured = hasStructuredSections(snapshot);
  const flow = flowLayout(snapshot);
  let layoutSettings: AdvancedLayoutSettings = snapshot.layoutSettings;

  // CR-003/CR-008: snapshot v4 com geometria EXPLÍCITA (freePosition) tem o
  // resolvedor canônico como autoridade de encaixe (prova no harness) — as
  // heurísticas legadas de contagem de caracteres (`layoutRect`/
  // `clampedCopyIssues`) NÃO podem desfazer essa geometria. O fallback de
  // overlap/flow continua para v1-v3 (sem geometria própria) e para
  // elementos decorativos (reais, não heurísticos).
  const hasExplicitGeometry = Boolean(
    layoutSettings.headline.freePosition ||
      layoutSettings.body.freePosition ||
      layoutSettings.card.freePosition,
  );
  const geometryIsAuthoritative =
    snapshot.snapshotVersion === 4 && hasExplicitGeometry && options.geometryResolved === true;

  // headline_body_overlap: overlap real entre headline e body — converte para
  // flow e remove freePosition explicitamente (layoutToAdvanced não inclui a
  // chave, então o spread não sobrescreve o freePosition herdado do LLM).
  // Quando structured_absolute_layout também está presente, o usuário arrastou
  // deliberadamente num template estruturado — preservamos o freePosition.
  if (
    !geometryIsAuthoritative &&
    !structured &&
    result.issues.some((issue) => issue.type === "headline_body_overlap") &&
    !result.issues.some((issue) => issue.type === "structured_absolute_layout")
  ) {
    layoutSettings = {
      ...layoutSettings,
      headline: {
        ...layoutSettings.headline,
        ...flow.headline,
        freePosition: undefined,
        backgroundColor: layoutSettings.headline.backgroundColor,
        borderRadius: layoutSettings.headline.borderRadius,
      },
      body: {
        ...layoutSettings.body,
        ...flow.body,
        freePosition: undefined,
        backgroundColor: layoutSettings.body.backgroundColor,
        borderRadius: layoutSettings.body.borderRadius,
      },
      sectionLayouts: {},
    };
  }

  // structured_absolute_layout: template estruturado com freePosition em
  // headline/body/card. NÃO removemos o freePosition aqui — o usuário pode ter
  // posicionado livremente via drag no Workbench (legítimo). Só limpamos
  // sectionLayouts (sections em template estruturado devem fluir). O juiz
  // (layoutIntegrity) penaliza via issue, mas o fallback não destrói a
  // posição escolhida pelo usuário.
  if (
    result.issues.some((issue) => issue.type === "structured_absolute_layout")
  ) {
    layoutSettings = {
      ...layoutSettings,
      sectionLayouts: {},
    };
  }

  if (
    !geometryIsAuthoritative &&
    result.issues.some((issue) => issue.type === "card_too_narrow" || issue.type === "structured_absolute_layout")
  ) {
    layoutSettings = {
      ...layoutSettings,
      card: {
        ...layoutSettings.card,
        ...flow.card,
        width: structured ? 100 : Math.max(layoutSettings.card.width ?? 100, MIN_CARD_WIDTH),
        backgroundColor: layoutSettings.card.backgroundColor,
        borderRadius: layoutSettings.card.borderRadius,
      },
    };
  }

  const blockedGeneratedTextIds = new Set(
    result.issues
      .filter((issue) => issue.type === "text_element_outside_canvas" || issue.type === "text_element_overlaps_copy")
      .map((issue) => issue.target),
  );
  const textElements = snapshot.textElements?.filter(
    (element) => !blockedGeneratedTextIds.has(element.id),
  );
  const removedTextElementIds = Array.from(blockedGeneratedTextIds);

  return {
    ...snapshot,
    layoutSettings,
    textElements,
    // SPEC-002 (docs/reforma/SPEC-002 passo 7): o fallback corrigia geometria
    // e apagava elementos sem deixar rastro observável no snapshot — a
    // correção acontecia, mas nada além de um log efêmero registrava o quê
    // e por quê. `visualFitIssues` é o diagnóstico que motivou a correção;
    // `removedTextElementIds` é exatamente o que foi descartado, para que
    // testes/telemetria/UI consigam mostrar isso em vez de só herdar um
    // resultado silenciosamente diferente do que a família pediu.
    visualFitIssues: result.issues,
    removedTextElementIds: removedTextElementIds.length > 0 ? removedTextElementIds : undefined,
  };
}
