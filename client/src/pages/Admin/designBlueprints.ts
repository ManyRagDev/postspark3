import type { DesignDnaAnalysis, DesignEntropyProfile, DesignFontCandidate } from "@shared/designDna";
import {
  INITIAL_POST,
  OFFICIAL_FAMILIES_META,
  type CanvasCustomText,
  type CanvasPostModel,
  type VisualFamilyId,
} from "@/pages/CanvasLab/components/types";
import { layoutRichText } from "@/pages/CanvasLab/lib/richTextLayout";

export type DesignBlueprintId =
  | "reference-derived"
  | "manual-editorial-tension"
  | "manual-anchored-media"
  | "manual-controlled-disruption";

export type DesignBlueprint = {
  id: DesignBlueprintId;
  name: string;
  description: string;
  familyId: VisualFamilyId;
  requiresImage: boolean;
};

export const DESIGN_BLUEPRINTS: DesignBlueprint[] = [
  {
    id: "reference-derived",
    name: "Estrutura decodificada",
    description: "Reconstrói caixas de texto e blocos cromáticos medidos na referência.",
    familyId: "editorial-poster",
    requiresImage: false,
  },
  {
    id: "manual-editorial-tension",
    name: "Tensão editorial",
    description: "Título dominante, respiro lateral e apoio curto.",
    familyId: "editorial-poster",
    requiresImage: false,
  },
  {
    id: "manual-anchored-media",
    name: "Mídia ancorada",
    description: "Área de mídia reservada e leitura concentrada na base; não reutiliza a referência.",
    familyId: "cinematic-depth",
    requiresImage: false,
  },
  {
    id: "manual-controlled-disruption",
    name: "Ruptura controlada",
    description: "Blocos fortes, sinais rotacionados e ritmo assimétrico.",
    familyId: "chromatic-block",
    requiresImage: false,
  },
];

export const ZERO_ENTROPY: DesignEntropyProfile = {
  overallScore: 0,
  asymmetry: 0,
  gridDeviation: 0,
  rotation: { degrees: 0, confidence: 1 },
  noise: { intensity: 0, scale: 0.4, kind: "none" },
  hardShadow: { intensity: 0, offsetX: 0, offsetY: 0, blur: 0 },
};

export type CompilerInput = {
  blueprintId: DesignBlueprintId;
  headline: string;
  subtext: string;
  entropy: DesignEntropyProfile;
  analysis?: DesignDnaAnalysis | null;
  referenceImage?: string | null;
  enabledPieceIds?: string[];
  fontCandidate?: DesignFontCandidate | null;
};

export type CompatibilityResult = {
  compatible: boolean;
  reasons: string[];
};

export type CompilerResult = {
  post: CanvasPostModel;
  requestedBlueprintId: DesignBlueprintId;
  effectiveBlueprintId: DesignBlueprintId;
  fallbackLevel: "preferred" | "safe" | "adapted" | "warning";
  warnings: string[];
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function validateCompatibility(input: CompilerInput, blueprint: DesignBlueprint): CompatibilityResult {
  const reasons: string[] = [];
  if (blueprint.id === "reference-derived" && !input.analysis) reasons.push("Analise uma referência antes de reconstruir sua estrutura.");
  if (!input.headline.trim()) reasons.push("O blueprint precisa de um título.");
  if (blueprint.requiresImage && !input.referenceImage) reasons.push("Este blueprint precisa de uma imagem de referência.");
  if (input.headline.trim().length > 180) reasons.push("O título excede 180 caracteres.");
  if (input.subtext.trim().length > 360) reasons.push("O texto de apoio excede 360 caracteres.");
  if (input.analysis) {
    const knownIds = new Set(input.analysis.pieces.map(piece => piece.id));
    const enabledIds = new Set(input.enabledPieceIds ?? input.analysis.pieces.map(piece => piece.id));
    for (const piece of input.analysis.pieces) {
      if (!enabledIds.has(piece.id)) continue;
      const missing = piece.constraints.requires.filter(required => knownIds.has(required) && !enabledIds.has(required));
      const conflicts = piece.constraints.conflictsWith.filter(conflict => enabledIds.has(conflict));
      if (missing.length) reasons.push(`${piece.name} requer ${missing.join(", ")}.`);
      if (conflicts.length) reasons.push(`${piece.name} conflita com ${conflicts.join(", ")}.`);
    }
  }
  return { compatible: reasons.length === 0, reasons };
}

function fontSizeForFamily(familyId: VisualFamilyId): number {
  if (familyId === "cinematic-depth") return 34;
  if (familyId === "chromatic-block") return 32;
  return 23;
}

function fitTextScale(input: {
  text: string;
  width: number;
  maxHeight: number;
  familyId: VisualFamilyId;
  fontFamily: string;
  fontStyle?: string;
  maxScale?: number;
  minScale?: number;
}): { scale: number; overflow: boolean } {
  const baseSize = fontSizeForFamily(input.familyId);
  const minScale = input.minScale ?? 0.6;
  for (let scale = input.maxScale ?? 1.3; scale >= minScale; scale -= 0.05) {
    const layout = layoutRichText({
      text: input.text,
      width: input.width,
      fontSize: baseSize * scale,
      fontFamily: input.fontFamily,
      fontStyle: input.fontStyle ?? "bold",
      fill: "#FFFFFF",
      lineHeight: input.familyId === "chromatic-block" ? 1.1 : 1.25,
      letterSpacing: input.familyId === "chromatic-block" ? 0.5 : -0.2,
    });
    if (layout.height <= input.maxHeight) return { scale: Number(scale.toFixed(2)), overflow: false };
  }
  return { scale: minScale, overflow: true };
}

function entropyMarks(entropy: DesignEntropyProfile, accent: string): CanvasCustomText[] {
  const count = Math.round(clamp(entropy.noise.intensity, 0, 1) * 7);
  const marks = ["✦", "///", "•", "+", "··", "—", "×"];
  return Array.from({ length: count }, (_, index) => ({
    id: `entropy-mark-${index}`,
    text: marks[index % marks.length],
    x: 24 + ((index * 47 + Math.round(entropy.gridDeviation * 31)) % 292),
    y: 18 + ((index * 71 + Math.round(entropy.asymmetry * 43)) % 310),
    width: 56,
    fontSize: 8 + Math.round(entropy.noise.scale * 8),
    fontFamily: "Space Mono",
    fontWeight: "bold" as const,
    color: accent,
    rotation: clamp(entropy.rotation.degrees * (index % 2 === 0 ? 1 : -0.55), -20, 20),
    opacity: 0.2 + entropy.noise.intensity * 0.45,
    zIndex: index,
  }));
}

function compileWithBlueprint(input: CompilerInput, blueprint: DesignBlueprint): CompilerResult {
  if (blueprint.id === "reference-derived" && input.analysis) return compileReferenceDerived(input);
  const analysis = input.analysis;
  const entropy = input.entropy;
  const family = OFFICIAL_FAMILIES_META[blueprint.familyId];
  const resolvedFontFamily = input.fontCandidate?.family ?? family.defaultFont;
  const palette = analysis?.palette ?? family.defaultPalette;
  const horizontalShift = Math.round((entropy.asymmetry - 0.5) * 30);
  const verticalShift = Math.round((entropy.gridDeviation - 0.5) * 24);
  const warnings: string[] = [];

  const geometry = blueprint.id === "manual-anchored-media"
    ? { headlineX: 28, headlineY: 220, headlineWidth: 304, headlineHeight: 82, subtextX: 28, subtextY: 310, subtextWidth: 276 }
    : blueprint.id === "manual-controlled-disruption"
      ? { headlineX: 18, headlineY: 72, headlineWidth: 316, headlineHeight: 150, subtextX: 78, subtextY: 244, subtextWidth: 250 }
      : { headlineX: 34, headlineY: 72, headlineWidth: 286, headlineHeight: 146, subtextX: 62, subtextY: 248, subtextWidth: 252 };

  const headlineX = clamp(geometry.headlineX + horizontalShift, 12, 340 - geometry.headlineWidth);
  const headlineY = clamp(geometry.headlineY + verticalShift, 16, 320);
  const subtextX = clamp(geometry.subtextX - Math.round(horizontalShift * 0.45), 12, 340 - geometry.subtextWidth);
  const subtextY = clamp(geometry.subtextY - Math.round(verticalShift * 0.35), headlineY + 56, 332);
  const fitted = fitTextScale({
    text: input.headline,
    width: geometry.headlineWidth,
    maxHeight: geometry.headlineHeight,
    familyId: blueprint.familyId,
    fontFamily: resolvedFontFamily,
  });
  if (fitted.scale < 1) warnings.push("O título foi adaptado pelo medidor do CanvasLab para caber na área disponível.");
  if (fitted.overflow) warnings.push("O título ainda pode exceder a área segura no menor tamanho permitido.");

  const slide = {
    id: "design-dna-preview-slide",
    step: "PRÉVIA INTERNA",
    headline: input.headline,
    subtext: input.subtext,
    headlinePos: { x: headlineX, y: headlineY },
    subtextPos: { x: subtextX, y: subtextY },
    headlineWidth: geometry.headlineWidth,
    subtextWidth: geometry.subtextWidth,
    headlineScale: 1,
    subtextScale: 1,
    extraTexts: entropyMarks(entropy, palette.accent),
    ...(blueprint.id === "manual-anchored-media" ? { extraShapes: [{ id: "manual-media-placeholder", x: 18, y: 18, width: 324, height: 188, color: palette.accent }] } : {}),
  };

  const post: CanvasPostModel = {
    ...structuredClone(INITIAL_POST),
    id: `design-dna-preview-${blueprint.id}`,
    familyId: blueprint.familyId,
    familyName: family.name,
    headline: input.headline,
    subtext: input.subtext,
    caption: "Prévia interna do compilador de DNA de composição.",
    fontFamily: resolvedFontFamily,
    customFontUrl: input.fontCandidate?.cssUrl,
    headlineAlign: analysis?.geometry.alignment ?? "left",
    bodyAlign: analysis?.geometry.alignment ?? "left",
    headlineSizeScale: fitted.scale,
    subtextSizeScale: 1,
    headlineEffect: entropy.hardShadow.intensity > 0.55 ? "box-brutal" : entropy.hardShadow.intensity > 0.18 ? "shadow" : "none",
    headlineEffectColor: entropy.hardShadow.intensity > 0.18 ? palette.accent : undefined,
    palette: { ...palette, surface: palette.accent },
    overlayOpacity: 0,
    overlayMode: "gradient-bottom",
    slides: [slide],
    currentSlideIndex: 0,
    extraTexts: slide.extraTexts,
  };

  return {
    post,
    requestedBlueprintId: input.blueprintId,
    effectiveBlueprintId: blueprint.id,
    fallbackLevel: fitted.overflow ? "warning" : fitted.scale < 1 ? "adapted" : "preferred",
    warnings,
  };
}

function compileReferenceDerived(input: CompilerInput): CompilerResult {
  const analysis = input.analysis!;
  const family = OFFICIAL_FAMILIES_META["editorial-poster"];
  const sourceRatio = analysis.metadata.sourceWidth / analysis.metadata.sourceHeight;
  const ratios = [
    { id: "1:1" as const, value: 1, height: 360 },
    { id: "4:5" as const, value: 4 / 5, height: 450 },
    { id: "9:16" as const, value: 9 / 16, height: 640 },
  ];
  const aspect = ratios.reduce((best, next) => Math.abs(next.value - sourceRatio) < Math.abs(best.value - sourceRatio) ? next : best);
  const measured = analysis.geometry;
  const toX = (value: number) => Math.round(value * 360);
  const toY = (value: number) => Math.round(value * aspect.height);
  const deltaX = Math.round((input.entropy.asymmetry - analysis.entropy.asymmetry) * 20);
  const deltaY = Math.round((input.entropy.gridDeviation - analysis.entropy.gridDeviation) * 18);
  const headlineWidth = Math.max(40, toX(measured.headline.width));
  const subtextWidth = measured.support ? Math.max(40, toX(measured.support.width)) : headlineWidth;
  const fontFamily = input.fontCandidate?.family ?? (analysis.typography.headlineClass === "serif" ? "Playfair Display" : analysis.typography.headlineClass === "mono" ? "Space Mono" : analysis.typography.headlineClass === "display" ? "Anton" : "Inter");
  const headlineFit = fitTextScale({
    text: input.headline,
    width: headlineWidth,
    maxHeight: Math.max(20, toY(measured.headline.height)),
    familyId: "editorial-poster",
    fontFamily,
    fontStyle: String(analysis.typography.traits.weight),
    maxScale: 3,
    minScale: 0.35,
  });
  let supportScale = 1.6;
  const supportFont = analysis.typography.supportClass === "serif" ? "Playfair Display" : analysis.typography.supportClass === "mono" ? "Space Mono" : analysis.typography.supportClass === "display" ? "Anton" : "Inter";
  if (measured.support) {
    for (; supportScale >= 0.35; supportScale -= 0.05) {
      const layout = layoutRichText({ text: input.subtext, width: subtextWidth, fontSize: 12 * supportScale, fontFamily: supportFont, fontStyle: String(analysis.typography.supportWeight ?? 400), fill: analysis.typography.supportColor ?? analysis.palette.text, align: measured.supportAlignment ?? measured.alignment, lineHeight: 1.45 });
      if (layout.height <= Math.max(16, toY(measured.support.height))) break;
    }
  }
  supportScale = clamp(Number(supportScale.toFixed(2)), 0.35, 1.6);
  const warnings: string[] = [];
  if (Math.abs(sourceRatio - aspect.value) > 0.03) warnings.push(`Formato ${analysis.metadata.sourceWidth}×${analysis.metadata.sourceHeight} aproximado para ${aspect.id}; a geometria pode variar.`);
  if (!input.fontCandidate) warnings.push("Fonte ainda não confirmada: a prévia usa uma fonte provisória da mesma classe.");
  if (measured.media) warnings.push("Há uma região de mídia na referência. O conteúdo fotográfico/ilustrado não foi decodificado; somente sua posição pode ser avaliada.");
  if (headlineFit.overflow) warnings.push("O título excede a caixa medida mesmo no menor tamanho de prova.");
  if (!analysis.referenceText?.headline) warnings.push("Texto do título não foi transcrito automaticamente; confira a referência.");
  if (input.entropy.noise.intensity > 0) warnings.push("Textura de ruído ainda não é reconstruída no CanvasLab.");
  if (Math.abs(input.entropy.rotation.degrees) > 0.1) warnings.push("Rotação é aplicada apenas aos textos adicionais; título e superfícies ainda não a reproduzem.");
  const additionalTexts: CanvasCustomText[] = (analysis.additionalTexts ?? []).map((item, index) => {
    const width = Math.max(20, toX(item.box.width));
    const maxHeight = Math.max(10, toY(item.box.height));
    const itemFont = item.fontClass === "serif" ? "Playfair Display" : item.fontClass === "mono" ? "Space Mono" : item.fontClass === "display" ? "Anton" : "Inter";
    let fontSize = Math.min(64, Math.max(7, maxHeight * 0.8));
    for (; fontSize >= 6; fontSize -= 1) {
      const layout = layoutRichText({ text: item.text, width, fontSize, fontFamily: itemFont, fontStyle: String(item.weight), fill: item.color, lineHeight: 1.3 });
      if (layout.height <= maxHeight) break;
    }
    return {
      id: `design-dna-additional-${index}`,
      text: item.text,
      x: toX(item.box.x),
      y: toY(item.box.y),
      width,
      fontSize: Math.max(6, fontSize),
      fontFamily: itemFont,
      fontWeight: item.weight,
      color: item.color,
      rotation: clamp(item.rotation + input.entropy.rotation.degrees - analysis.entropy.rotation.degrees, -20, 20),
    };
  });
  const slide = {
    id: "design-dna-reference-preview",
    step: "",
    headline: input.headline,
    subtext: measured.support ? input.subtext : "",
    headlinePos: { x: clamp(toX(measured.headline.x) + deltaX, 0, 360 - headlineWidth), y: clamp(toY(measured.headline.y) + deltaY, 0, aspect.height - 20) },
    subtextPos: measured.support
      ? { x: clamp(toX(measured.support.x) + deltaX, 0, 360 - subtextWidth), y: clamp(toY(measured.support.y) + deltaY, 0, aspect.height - 16) }
      : { x: toX(measured.headline.x), y: toY(measured.headline.y + measured.headline.height) },
    headlineWidth,
    subtextWidth,
    headlineScale: 1,
    subtextScale: 1,
    suppressFamilyDecorations: true,
    extraTexts: additionalTexts,
    extraShapes: (measured.surfaces ?? []).map((surface, index) => ({
      id: `design-dna-surface-${index}`,
      x: toX(surface.box.x),
      y: toY(surface.box.y),
      width: toX(surface.box.width),
      height: toY(surface.box.height),
      color: surface.color,
    })),
  };
  const post: CanvasPostModel = {
    ...structuredClone(INITIAL_POST),
    id: "design-dna-reference-diagnostic",
    aspectRatio: aspect.id,
    familyId: "editorial-poster",
    familyName: family.name,
    headline: input.headline,
    subtext: measured.support ? input.subtext : "",
    caption: "Prévia efêmera de reconstrução da estrutura; não é um post da biblioteca.",
    fontFamily,
    subtextFontFamily: supportFont,
    headlineFontWeight: analysis.typography.traits.weight,
    subtextFontWeight: analysis.typography.supportWeight ?? 400,
    customFontUrl: input.fontCandidate?.cssUrl,
    headlineAlign: measured.headlineAlignment ?? measured.alignment,
    bodyAlign: measured.supportAlignment ?? measured.alignment,
    headlineSizeScale: headlineFit.scale,
    subtextSizeScale: supportScale,
    headlineEffect: input.entropy.hardShadow.intensity > 0.35 ? "shadow" : "none",
    palette: { ...analysis.palette, headlineColor: analysis.typography.headlineColor ?? analysis.palette.text, subtextColor: analysis.typography.supportColor ?? analysis.palette.text, surface: analysis.palette.accent },
    overlayOpacity: 0,
    isSnapEnabled: false,
    slides: [slide],
    currentSlideIndex: 0,
  };
  return {
    post,
    requestedBlueprintId: input.blueprintId,
    effectiveBlueprintId: "reference-derived",
    fallbackLevel: warnings.length ? "warning" : "preferred",
    warnings,
  };
}

export function compileAdminPreview(input: CompilerInput): CompilerResult {
  const preferred = DESIGN_BLUEPRINTS.find(item => item.id === input.blueprintId) ?? DESIGN_BLUEPRINTS[0];
  const compatibility = validateCompatibility(input, preferred);
  if (compatibility.compatible) return compileWithBlueprint(input, preferred);

  const safe = DESIGN_BLUEPRINTS.find(item => item.id === "manual-editorial-tension")!;
  const safeCompatibility = validateCompatibility(input, safe);
  if (safeCompatibility.compatible) {
    const result = compileWithBlueprint(input, safe);
    return {
      ...result,
      requestedBlueprintId: input.blueprintId,
      fallbackLevel: "safe",
      warnings: [...compatibility.reasons, "A combinação segura foi usada para manter a composição válida.", ...result.warnings],
    };
  }

  const adaptedInput = {
    ...input,
    headline: input.headline.trim().slice(0, 180) || "Uma ideia forte começa com uma hierarquia clara",
    subtext: input.subtext.trim().slice(0, 360),
  };
  const result = compileWithBlueprint(adaptedInput, safe);
  return {
    ...result,
    requestedBlueprintId: input.blueprintId,
    fallbackLevel: "warning",
    warnings: [...compatibility.reasons, ...safeCompatibility.reasons, "O conteúdo foi adaptado para produzir uma prévia de diagnóstico.", ...result.warnings],
  };
}
