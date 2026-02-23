// Editor Types — controles visuais avançados do Workbench

export type BlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten";

export type TextPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "center-left"
  | "center"
  | "center-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export type TextAlignment = "left" | "center" | "right";

// ── Image Settings ────────────────────────────────────────────────────────────

export interface ImageSettings {
  zoom: number;           // 0.5–3.0, default 1.0
  brightness: number;     // 0–2, default 1.0
  contrast: number;       // 0–2, default 1.0
  saturation: number;     // 0–2, default 1.0
  blur: number;           // 0–20px, default 0
  overlayOpacity: number; // 0–1, default 0.5
  overlayColor: string;   // hex, default '#000000'
  blendMode: BlendMode;   // default 'normal'
}

// ── Layout Settings ───────────────────────────────────────────────────────────

/** Posição livre em percentual dentro do card (quando snap está desligado) */
export interface FreePosition {
  x: number; // 0–100% (left)
  y: number; // 0–100% (top)
}

export interface LayoutPosition {
  position: TextPosition;
  textAlign: TextAlignment;
  /** Quando definido, ignora `position` e usa coordenadas livres em % */
  freePosition?: FreePosition;
  /** Largura do bloco de texto em % do card (0–100). Undefined = usa maxWidth padrão (76%) */
  width?: number;
}

export interface AdvancedLayoutSettings {
  headline: LayoutPosition;
  body: LayoutPosition;
  accentBar?: LayoutPosition;
  padding: number; // 0–80px, default 24
}

// ── Defaults ──────────────────────────────────────────────────────────────────

export const DEFAULT_IMAGE_SETTINGS: ImageSettings = {
  zoom: 1.0,
  brightness: 1.0,
  contrast: 1.0,
  saturation: 1.0,
  blur: 0,
  overlayOpacity: 0,    // 0 = sem overlay por padrão
  overlayColor: "#000000",
  blendMode: "normal",
};

export const DEFAULT_LAYOUT_SETTINGS: AdvancedLayoutSettings = {
  headline: { position: "bottom-left", textAlign: "left" },
  body: { position: "bottom-left", textAlign: "left" },
  accentBar: { position: "top-left", textAlign: "left", width: 15 },
  padding: 24,
};
