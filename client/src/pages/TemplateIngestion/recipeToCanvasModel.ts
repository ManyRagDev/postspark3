import type { RecreationRecipe } from "@shared/designRecreation";
import {
  INITIAL_POST,
  type AspectRatioType,
  type CanvasCustomImage,
  type CanvasCustomShape,
  type CanvasCustomText,
  type CanvasPostModel,
  type TextAlignType,
} from "../CanvasLab/components/types";

export interface RecipeToCanvasOptions {
  title?: string;
  originalImageUrl?: string;
  targetAspectRatio?: AspectRatioType;
}

export function detectAspectRatio(widthPx: number, heightPx: number): AspectRatioType {
  const ratio = heightPx / Math.max(1, widthPx);
  if (ratio >= 1.55) return "9:16";
  if (ratio >= 1.15) return "4:5";
  return "1:1";
}

/** Placeholder SVG para slots de mídia detectados */
export function buildMediaSlotPlaceholder(role?: string, label?: string): string {
  const text = label || (role === "logo" ? "Logotipo" : role === "hero" ? "Imagem Principal" : "Slot de Mídia");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
    <rect width="100%" height="100%" fill="#1a1d24" stroke="#00f0ff" stroke-width="2" stroke-dasharray="6 6"/>
    <g fill="#00f0ff" opacity="0.8">
      <circle cx="200" cy="130" r="32" fill="none" stroke="#00f0ff" stroke-width="3"/>
      <path d="M190 130 L210 130 M200 120 L200 140" stroke="#00f0ff" stroke-width="3" stroke-linecap="round"/>
      <text x="200" y="195" font-family="sans-serif" font-size="14" font-weight="600" text-anchor="middle" fill="#00f0ff">${text}</text>
    </g>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function recipeToCanvasModel(
  recipe: RecreationRecipe,
  options?: RecipeToCanvasOptions
): CanvasPostModel {
  const sourceWidth = recipe.scene?.source?.widthPx || 1080;
  const sourceHeight = recipe.scene?.source?.heightPx || 1080;
  const scale = 360 / sourceWidth;
  const baseHeight = (360 * sourceHeight) / sourceWidth;

  const aspectRatio = options?.targetAspectRatio || detectAspectRatio(sourceWidth, sourceHeight);

  // Separar camadas por tipo e papel
  const textLayers = (recipe.scene?.layers || []).filter(l => l.kind === "text" && l.text && l.text.trim());
  const shapeLayers = (recipe.scene?.layers || []).filter(l => l.kind === "rect" || l.kind === "polygon" || l.kind === "line");

  // Identificar Headline principal
  let headlineIndex = textLayers.findIndex(l => l.role === "headline");
  if (headlineIndex === -1 && textLayers.length > 0) {
    // Escolhe a camada com maior tamanho de fonte
    let maxFont = -1;
    textLayers.forEach((l, idx) => {
      const fs = l.fontSize || 0;
      if (fs > maxFont) {
        maxFont = fs;
        headlineIndex = idx;
      }
    });
  }

  const headlineLayer = headlineIndex !== -1 ? textLayers[headlineIndex] : undefined;

  // Identificar Subtext / Apoio
  let subtextIndex = textLayers.findIndex((l, idx) => idx !== headlineIndex && (l.role === "support" || l.role === "body" || l.role === "subtext"));
  if (subtextIndex === -1 && textLayers.length > 1) {
    subtextIndex = textLayers.findIndex((_, idx) => idx !== headlineIndex);
  }

  const subtextLayer = subtextIndex !== -1 ? textLayers[subtextIndex] : undefined;

  // Restante das camadas de texto viram extraTexts
  const extraTexts: CanvasCustomText[] = textLayers
    .filter((_, idx) => idx !== headlineIndex && idx !== subtextIndex)
    .map((l, i) => {
      const align: TextAlignType = l.align === "center" ? "center" : l.align === "right" ? "right" : "left";
      return {
        id: l.id || `ingested-text-${i + 1}`,
        text: l.text || "",
        x: Math.round(l.x * scale),
        y: Math.round(l.y * scale),
        width: Math.round(l.width * scale),
        fontSize: Math.round(Math.max(10, (l.fontSize || 24) * scale)),
        fontFamily: l.fontFamily || "Inter",
        fontWeight: l.fontWeight && l.fontWeight >= 600 ? "bold" : "normal",
        color: l.fill || "#FFFFFF",
        align,
        rotation: l.rotationDeg || 0,
        zIndex: 10 + i,
      };
    });

  // Camadas de formas / superfícies
  const extraShapes: CanvasCustomShape[] = shapeLayers.map((s, i) => ({
    id: s.id || `ingested-shape-${i + 1}`,
    x: Math.round(s.x * scale),
    y: Math.round(s.y * scale),
    width: Math.round(s.width * scale),
    height: Math.round(s.height * scale),
    color: s.fill || "#1E1E24",
  }));

  // Slots de mídia / missingElements
  const extraImages: CanvasCustomImage[] = (recipe.missingElements || [])
    .filter(m => m.box && m.role !== "texture" && !/textura|granulad/i.test(m.description || ""))
    .map((m, i) => {
      const box = m.box!;
      return {
        id: `ingested-media-${i + 1}`,
        url: buildMediaSlotPlaceholder(m.role, m.description),
        x: Math.round(box.x * 360),
        y: Math.round(box.y * baseHeight),
        width: Math.round(box.width * 360),
        height: Math.round(box.height * baseHeight),
        imagePrompt: m.description,
        opacity: 0.9,
        zIndex: 5 + i,
      };
    });

  const backgroundColor = recipe.scene?.artboard?.background || "#0D0E12";
  const headlineColor = headlineLayer?.fill || "#FFFFFF";
  const subtextColor = subtextLayer?.fill || "#E2E8F0";

  // Identificar cor de destaque (accent) a partir de botões/badges ou camadas secundárias
  const accentLayer = shapeLayers.find(s => s.fill && s.fill !== backgroundColor && s.fill !== "#000000" && s.fill !== "#FFFFFF")
    || textLayers.find(t => t.fill && t.fill !== backgroundColor && t.fill !== headlineColor);
  const accentColor = accentLayer?.fill || "#FF5C00";

  const headlineFont = headlineLayer?.fontFamily || recipe.scene?.fonts?.[0]?.family || "Inter";
  const subtextFont = subtextLayer?.fontFamily || "Inter";

  const headlineAlign: TextAlignType = headlineLayer?.align === "center" ? "center" : headlineLayer?.align === "right" ? "right" : "left";
  const bodyAlign: TextAlignType = subtextLayer?.align === "center" ? "center" : subtextLayer?.align === "right" ? "right" : "left";

  const headlineText = headlineLayer?.text || (textLayers.length === 0 ? "Título do Post" : "");
  const subtextText = subtextLayer?.text || "";

  const post: CanvasPostModel = {
    ...structuredClone(INITIAL_POST),
    id: `ingested-${recipe.id || crypto.randomUUID()}`,
    aspectRatio,
    familyId: "editorial-poster",
    familyName: options?.title || recipe.title || "Template Ingerido",
    fontFamily: headlineFont,
    subtextFontFamily: subtextFont,
    headline: headlineText,
    subtext: subtextText,
    headlineAlign,
    bodyAlign,
    palette: {
      background: backgroundColor,
      text: headlineColor,
      accent: accentColor,
      headlineColor,
      subtextColor,
    },
    overlayOpacity: 0,
    showBadge: false,
    showStep: false,
    isSnapEnabled: true,
    slides: [
      {
        id: `slide-1`,
        step: "",
        headline: headlineText,
        subtext: subtextText,
        headlinePos: headlineLayer ? { x: Math.round(headlineLayer.x * scale), y: Math.round(headlineLayer.y * scale) } : undefined,
        headlineWidth: headlineLayer ? Math.round(headlineLayer.width * scale) : undefined,
        subtextPos: subtextLayer ? { x: Math.round(subtextLayer.x * scale), y: Math.round(subtextLayer.y * scale) } : undefined,
        subtextWidth: subtextLayer ? Math.round(subtextLayer.width * scale) : undefined,
        extraTexts,
        extraShapes,
        extraImages,
      },
    ],
    currentSlideIndex: 0,
  };

  return post;
}
