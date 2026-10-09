import type { DesignDnaAnalysis, NormalizedDesignBox } from "@shared/designDna";
import {
  REFERENCE_DECODER_VERSION,
  REFERENCE_RENDERER_VERSION,
  emptyReferenceLayer,
  type ReferenceReconstructionSpecV2,
  type ReferenceSceneLayer,
} from "@shared/referenceReconstruction";
import { INITIAL_POST, type CanvasPostModel } from "@/pages/CanvasLab/components/types";

export function materializeReferenceDiagnostic(scene: ReferenceReconstructionSpecV2): CanvasPostModel {
  const post = structuredClone(INITIAL_POST);
  const fontFamily = scene.fonts[0]?.family ?? scene.layers.find(layer => layer.fontFamily)?.fontFamily ?? "Arial";
  return {
    ...post,
    id: "design-dna-reference-diagnostic",
    familyId: "editorial-poster",
    familyName: "Reconstrução diagnóstica",
    aspectRatio: "1:1", // A dimensão real vem de diagnosticScene no CanvasPostStage.
    headline: "",
    subtext: "",
    caption: "Prévia administrativa gerada de uma receita visual; não é post da biblioteca.",
    fontFamily,
    palette: { ...post.palette, background: scene.artboard.background, text: "#111111", accent: "#F6BD32" },
    bgImage: undefined,
    overlayOpacity: 0,
    showBadge: false,
    showStep: false,
    isSnapEnabled: false,
    slides: [{ id: "diagnostic-scene", step: "", headline: "", subtext: "", suppressFamilyDecorations: true }],
    currentSlideIndex: 0,
  };
}

function boxToPixels(box: NormalizedDesignBox, width: number, height: number) {
  return { x: box.x * width, y: box.y * height, width: box.width * width, height: box.height * height };
}

/** Migração parcial para revisão humana: não inventa as camadas perdidas pela análise V1. */
export function legacyAnalysisToReferenceScene(analysis: DesignDnaAnalysis): ReferenceReconstructionSpecV2 {
  const width = analysis.metadata.sourceWidth;
  const height = analysis.metadata.sourceHeight;
  const layers: ReferenceSceneLayer[] = [];
  analysis.geometry.surfaces.forEach((surface, index) => {
    layers.push({ ...emptyReferenceLayer("rect", `legacy-surface-${index}`), ...boxToPixels(surface.box, width, height),
      role: "surface", zIndex: index, fill: surface.color, confidenceScore: surface.box.confidence,
      provenance: "multimodal", support: "unknown", uncertainty: "Análise V1: a forma pode não ser um retângulo." });
  });
  if (analysis.referenceText.headline) {
    layers.push({ ...emptyReferenceLayer("text", "legacy-headline"), ...boxToPixels(analysis.geometry.headline, width, height),
      role: "headline", zIndex: 30, text: analysis.referenceText.headline,
      fill: analysis.typography.headlineColor, fontWeight: analysis.typography.traits.weight,
      fontSize: Math.max(10, analysis.geometry.headline.height * height / 2),
      align: analysis.geometry.headlineAlignment, confidenceScore: analysis.geometry.headline.confidence,
      provenance: "multimodal", support: "unknown", uncertainty: "Análise V1 perdeu linhas, cores e efeitos individuais." });
  }
  if (analysis.geometry.support && analysis.referenceText.support) {
    layers.push({ ...emptyReferenceLayer("text", "legacy-support"), ...boxToPixels(analysis.geometry.support, width, height),
      role: "support", zIndex: 31, text: analysis.referenceText.support,
      fill: analysis.typography.supportColor, fontWeight: analysis.typography.supportWeight,
      fontSize: Math.max(8, analysis.geometry.support.height * height / 5),
      align: analysis.geometry.supportAlignment, confidenceScore: analysis.geometry.support.confidence,
      provenance: "multimodal", support: "unknown", uncertainty: "Análise V1 não separa rodapé e citações." });
  }
  analysis.additionalTexts.forEach((item, index) => {
    layers.push({ ...emptyReferenceLayer("text", `legacy-extra-${index}`), ...boxToPixels(item.box, width, height),
      role: "annotation", zIndex: 40 + index, text: item.text, fill: item.color, fontWeight: item.weight,
      fontSize: Math.max(8, item.box.height * height * 0.65), rotationDeg: item.rotation,
      confidenceScore: item.box.confidence, provenance: "multimodal", support: "unknown",
      uncertainty: "Análise V1 limita rotação e não representa texto em arco." });
  });
  return {
    schemaVersion: 2,
    source: { widthPx: width, heightPx: height, mimeType: "image/jpeg", preparedHash: null, originalHash: null },
    artboard: { background: analysis.palette.background },
    layers, fonts: [], warnings: ["Cena derivada da análise V1; exige revisão completa antes de aprovação."],
    decoderVersion: `${REFERENCE_DECODER_VERSION}-legacy`, rendererVersion: REFERENCE_RENDERER_VERSION,
  };
}

export function sceneFromAnalysis(analysis: DesignDnaAnalysis): ReferenceReconstructionSpecV2 {
  return analysis.reconstructionScene ? structuredClone(analysis.reconstructionScene) : legacyAnalysisToReferenceScene(analysis);
}
