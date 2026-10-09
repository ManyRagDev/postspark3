import type { ReferenceReconstructionSpecV2 } from "./referenceReconstruction";

export type DesignPieceKind =
  | "layout"
  | "typography"
  | "palette"
  | "rhythm"
  | "entropy"
  | "decoration";

export type DesignEntropyProfile = {
  overallScore: number;
  asymmetry: number;
  gridDeviation: number;
  rotation: {
    degrees: number;
    confidence: number;
  };
  noise: {
    intensity: number;
    scale: number;
    kind: "none" | "grain" | "speckle" | "scanline";
  };
  hardShadow: {
    intensity: number;
    offsetX: number;
    offsetY: number;
    blur: number;
  };
};

export type NormalizedDesignBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
};

export type DesignPieceCandidate = {
  id: string;
  kind: DesignPieceKind;
  name: string;
  description: string;
  confidenceScore: number;
  constraints: {
    requires: string[];
    conflictsWith: string[];
  };
  parameter: {
    key: "asymmetry" | "gridDeviation" | "rotation" | "noise" | "hardShadow" | "density";
    value: number;
    unit: "ratio" | "degrees";
  };
};

export type DesignFontCandidate = {
  id: string;
  family: string;
  category: "sans-serif" | "serif" | "display" | "monospace" | "handwriting";
  /** Origem da candidatura; não representa semelhança visual medida. */
  matchBasis: "identified-family" | "model-suggestion" | "catalog-search";
  rationale: string;
  weights: number[];
  styles: string[];
  variable: boolean;
  source: "fontsource-google";
  cssUrl: string;
  license: "open-source";
};

export type DesignDnaAnalysis = {
  /** Hipótese de cena V2; registros antigos podem não contê-la. */
  reconstructionScene?: ReferenceReconstructionSpecV2;
  sceneValidation?: {
    status: "plausible" | "needs_review" | "invalid";
    issues: string[];
    uncoveredForegroundRatio: number;
    backgroundDelta: number;
  };
  ocr?: {
    status: "completed" | "unavailable";
    engine: "tesseract.js";
    languages: string[];
    lines: Array<{ text: string; confidence: number; box: { x: number; y: number; width: number; height: number } }>;
    warning: string | null;
  };
  summary: {
    aesthetic: string;
    readingIntent: string;
    density: "low" | "medium" | "high";
  };
  palette: {
    background: string;
    text: string;
    accent: string;
  };
  geometry: {
    headline: NormalizedDesignBox;
    support: NormalizedDesignBox | null;
    media: NormalizedDesignBox | null;
    alignment: "left" | "center" | "right";
    headlineAlignment: "left" | "center" | "right";
    supportAlignment: "left" | "center" | "right";
    surfaces: Array<{
      box: NormalizedDesignBox;
      color: string;
    }>;
  };
  referenceText: {
    headline: string | null;
    support: string | null;
  };
  additionalTexts: Array<{
    text: string;
    box: NormalizedDesignBox;
    fontClass: "sans" | "serif" | "display" | "mono";
    weight: number;
    color: string;
    rotation: number;
  }>;
  typography: {
    headlineClass: "sans" | "serif" | "display" | "mono";
    supportClass: "sans" | "serif" | "display" | "mono";
    headlineToSupportRatio: number;
    supportWeight: number;
    headlineColor: string;
    supportColor: string;
    identification: {
      guessedFamily: string | null;
      confidence: number;
      evidence: string[];
    };
    traits: {
      category: "sans-serif" | "serif" | "display" | "monospace" | "handwriting";
      width: "condensed" | "normal" | "expanded";
      contrast: "low" | "medium" | "high";
      xHeight: "low" | "medium" | "high";
      weight: number;
      mood: string[];
    };
    suggestedFamilies: Array<{
      family: string;
      rationale: string;
      similarityScore: number;
    }>;
  };
  fontCandidates: DesignFontCandidate[];
  fontCatalogStatus: "resolved" | "unavailable" | "no_match";
  entropy: DesignEntropyProfile;
  pieces: DesignPieceCandidate[];
  unknowns: string[];
  warnings: string[];
  validation: {
    status: "valid" | "valid_with_warnings" | "invalid";
    issues: string[];
  };
  metadata: {
    model: string;
    provider?: string;
    analyzedAt: string;
    promptTokens: number;
    completionTokens: number;
    sourceWidth: number;
    sourceHeight: number;
  };
};
