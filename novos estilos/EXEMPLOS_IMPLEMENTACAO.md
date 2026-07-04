# Exemplos Práticos de Implementação

Este arquivo contém código pronto para usar das novas receitas e paletas.

---

## 🎨 1. Implementação das 10 Paletas

```typescript
// client/src/lib/palettes.ts

import type { DesignTokens } from "@shared/postspark";

export interface PalettePreset {
  id: string;
  name: string;
  description: string;
  colors: {
    primary: string;   // Cor de destaque
    secondary: string; // Cor de fundo/superfície
  };
  typography: {
    display: string;   // Fonte para títulos
    body: string;      // Fonte para corpo
  };
  category: "high-contrast" | "warm" | "cool" | "neutral" | "cyber";
  temperature: "warm" | "cool" | "neutral";
  wcagLevel: "AA" | "AAA" | "FAIL";
}

export const PALETTE_PRESETS: PalettePreset[] = [
  // 1. Tiffany + Dark Gray
  {
    id: "tiffany-dark",
    name: "Tiffany Dark",
    description: "Mint vibrante sobre cinza escuro",
    colors: { primary: "#21F1A8", secondary: "#171717" },
    typography: { display: "Anton", body: "Inter" },
    category: "high-contrast",
    temperature: "cool",
    wcagLevel: "AAA"
  },

  // 2. True Pink + Chill White
  {
    id: "pink-blush",
    name: "Pink Blush",
    description: "Pink vibrante sobre branco rosado",
    colors: { primary: "#FD1843", secondary: "#FFF9FA" },
    typography: { display: "Bebas Neue", body: "Inter" },
    category: "warm",
    temperature: "warm",
    wcagLevel: "AA"
  },

  // 3. Charcoal Violet + Cyber Lime
  {
    id: "cyber-lavender",
    name: "Cyber Lavender",
    description: "Roxo carvão com limão neon",
    colors: { primary: "#B6FF00", secondary: "#3C1A47" },
    typography: { display: "Space Grotesk", body: "Inter" },
    category: "cyber",
    temperature: "cool",
    wcagLevel: "AA"
  },

  // 4. Cyprus + Sand
  {
    id: "mediterranean",
    name: "Mediterranean",
    description: "Turquesa profundo com areia quente",
    colors: { primary: "#004741", secondary: "#F0EDE4" },
    typography: { display: "Playfair Display", body: "Inter" },
    category: "cool",
    temperature: "cool",
    wcagLevel: "AAA"
  },

  // 5. Lime Sprout + Fresh Canopy
  {
    id: "forest-bloom",
    name: "Forest Bloom",
    description: "Lime broto com verde floresta",
    colors: { primary: "#E4FD97", secondary: "#2D3E2C" },
    typography: { display: "Outfit", body: "Inter" },
    category: "neutral",
    temperature: "cool",
    wcagLevel: "AA"
  },

  // 6. Milky + Mantis
  {
    id: "cream-mint",
    name: "Cream Mint",
    description: "Branco cremoso com verde mantega",
    colors: { primary: "#59C749", secondary: "#FFFDF1" },
    typography: { display: "Quicksand", body: "Inter" },
    category: "cool",
    temperature: "cool",
    wcagLevel: "AAA"
  },

  // 7. Turmeric + Malt
  {
    id: "golden-hour",
    name: "Golden Hour",
    description: "Açafrão vibrante com malte escuro",
    colors: { primary: "#FFBE0B", secondary: "#2A2312" },
    typography: { display: "Anton", body: "Inter" },
    category: "warm",
    temperature: "warm",
    wcagLevel: "AAA"
  },

  // 8. Silver + Luminous Moss
  {
    id: "moss-silver",
    name: "Moss Silver",
    description: "Prata com verde neon",
    colors: { primary: "#28EE34", secondary: "#141414" },
    typography: { display: "Space Mono", body: "Inter" },
    category: "high-contrast",
    temperature: "cool",
    wcagLevel: "AAA"
  },

  // 9. Vulcanico + Noturno
  {
    id: "volcano-night",
    name: "Volcano Night",
    description: "Laranja vulcânico sobre azul noturno",
    colors: { primary: "#FF4103", secondary: "#001621" },
    typography: { display: "Bebas Neue", body: "Inter" },
    category: "high-contrast",
    temperature: "warm",
    wcagLevel: "AAA"
  },

  // 10. Skin Tone + Bridal
  {
    id: "blush-wine",
    name: "Blush Wine",
    description: "Pele rosada com vinho bordô",
    colors: { primary: "#FFC6A8", secondary: "#741A2F" },
    typography: { display: "Playfair Display", body: "Inter" },
    category: "warm",
    temperature: "warm",
    wcagLevel: "AA"
  }
];

/**
 * Converte uma paleta para DesignTokens
 */
export function paletteToDesignTokens(palette: PalettePreset): DesignTokens {
  // Determina qual cor é fundo e qual é destaque
  const isDarkBg = isColorDark(palette.colors.secondary);
  const background = palette.colors.secondary;
  const text = isDarkBg ? "#FFFFFF" : "#000000";
  const primary = palette.colors.primary;
  const card = isDarkBg ? lightenColor(palette.colors.secondary, 10) : darkenColor(palette.colors.secondary, 5);

  return {
    colors: {
      background,
      primary,
      secondary: palette.colors.primary, // Alternate accent
      text,
      card
    },
    typography: {
      fontFamily: palette.typography.display,
      customFontUrl: "",
      originalFont: "",
      textTransform: "none",
      textAlign: "left"
    },
    structure: {
      borderRadius: "16px",
      boxShadow: "none",
      border: "none"
    },
    decorations: palette.category === "cyber" ? "playful" : "minimal"
  };
}

// Helpers
function isColorDark(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.5;
}

function lightenColor(hex: string, percent: number): string {
  // Implementação simplificada
  return hex; // TODO: implementar
}

function darkenColor(hex: string, percent: number): string {
  // Implementação simplificada
  return hex; // TODO: implementar
}
```

---

## 🧩 2. Implementação das Receitas de Composição

```typescript
// client/src/lib/compositionRecipes.ts

import type { CompositionRecipe, TextElement, ImageElement, BackgroundValue, BgOverlaySettings } from "@shared/postspark";

export interface CompositionRecipe {
  id: string;
  name: string;
  description: string;
  category: "editorial" | "typography" | "modern" | "experimental";
  difficulty: "easy" | "medium" | "advanced";
  template?: "simple" | "feature-grid" | "numbered-list" | "step-by-step";
  textElements?: Partial<TextElement>[];
  imageElements?: Partial<ImageElement>[];
  bgValue?: BackgroundValue;
  bgOverlay?: Partial<BgOverlaySettings>;
  layoutSettings?: {
    headline?: { position: string; textAlign: string; x?: number; y?: number };
    body?: { position: string; textAlign: string; x?: number; y?: number };
  };
}

export const COMPOSITION_RECIPES: CompositionRecipe[] = [
  // 1. Editorial Poster
  {
    id: "editorial-poster",
    name: "Editorial Poster",
    description: "Título gigante, hierarquia forte, microtexto decorativo",
    category: "editorial",
    difficulty: "easy",
    template: "simple",
    layoutSettings: {
      headline: { position: "center", textAlign: "center", x: 50, y: 35 },
      body: { position: "center", textAlign: "center", x: 50, y: 65 }
    }
  },

  // 2. Layered Typography (Aproximado)
  {
    id: "layered-typography",
    name: "Layered Typography",
    description: "Texto em camadas com sobreposição e opacidade",
    category: "typography",
    difficulty: "medium",
    textElements: [
      {
        id: "bg-text",
        text: "IMPACTO",
        x: 50, y: 45,
        width: "auto",
        height: "auto",
        rotation: 0,
        styles: {
          fontSize: "64px",
          fontFamily: "Anton",
          color: "rgba(255,255,255,0.2)",
          fontWeight: "bold",
          fontStyle: "normal",
          textDecoration: "none",
          textAlign: "center",
          lineHeight: "1",
          opacity: "0.3"
        }
      },
      {
        id: "fg-text",
        text: "IMPACTO",
        x: 50, y: 50,
        width: "auto",
        height: "auto",
        rotation: -2,
        styles: {
          fontSize: "56px",
          fontFamily: "Anton",
          color: "#FF0000",
          fontWeight: "bold",
          fontStyle: "normal",
          textDecoration: "none",
          textAlign: "center",
          lineHeight: "1",
          opacity: "1"
        }
      }
    ]
  },

  // 3. Glitch Aproximado
  {
    id: "glitch-text",
    name: "Glitch Effect",
    description: "Efeito glitch com duplicação de texto e deslocamento",
    category: "experimental",
    difficulty: "medium",
    textElements: [
      {
        id: "glitch-cyan",
        text: "GLITCH",
        x: 52, y: 52,
        width: "auto",
        height: "auto",
        rotation: 0,
        styles: {
          fontSize: "48px",
          fontFamily: "Space Mono",
          color: "#00FFFF",
          fontWeight: "bold",
          textAlign: "center",
          opacity: "0.8"
        }
      },
      {
        id: "glitch-magenta",
        text: "GLITCH",
        x: 48, y: 48,
        width: "auto",
        height: "auto",
        rotation: 0,
        styles: {
          fontSize: "48px",
          fontFamily: "Space Mono",
          color: "#FF00FF",
          fontWeight: "bold",
          textAlign: "center",
          opacity: "0.8"
        }
      },
      {
        id: "glitch-main",
        text: "GLITCH",
        x: 50, y: 50,
        width: "auto",
        height: "auto",
        rotation: 0,
        styles: {
          fontSize: "48px",
          fontFamily: "Space Mono",
          color: "#FFFFFF",
          fontWeight: "bold",
          textAlign: "center",
          opacity: "1"
        }
      }
    ]
  },

  // 4. Mosaic Collage
  {
    id: "mosaic-collage",
    name: "Mosaic Collage",
    description: "Grid assimétrico de imagens com texto intercalado",
    category: "modern",
    difficulty: "medium",
    template: "feature-grid",
    imageElements: [
      {
        id: "mosaic-1",
        x: 5, y: 5,
        width: 40, height: 40,
        rotation: 0,
        url: "" // User preenche
      },
      {
        id: "mosaic-2",
        x: 55, y: 5,
        width: 40, height: 40,
        rotation: 0,
        url: "" // User preenche
      },
      {
        id: "mosaic-3",
        x: 5, y: 55,
        width: 40, height: 40,
        rotation: 0,
        url: "" // User preenche
      }
    ]
  },

  // 5. Kinetic Typography
  {
    id: "kinetic-type",
    name: "Kinetic Typography",
    description: "Texto em movimento com rotações e escalas",
    category: "typography",
    difficulty: "easy",
    textElements: [
      {
        id: "title-rotated",
        text: "TRANSFORMAÇÃO",
        x: 50, y: 40,
        width: "auto",
        height: "auto",
        rotation: -12,
        styles: {
          fontSize: "52px",
          fontFamily: "Anton",
          color: "#000000",
          fontWeight: "bold",
          textAlign: "center",
          opacity: "1"
        }
      },
      {
        id: "subtitle-scaled",
        text: "Acontece Agora",
        x: 50, y: 65,
        width: "auto",
        height: "auto",
        rotation: 0,
        styles: {
          fontSize: "24px",
          fontFamily: "Inter",
          color: "#666666",
          fontWeight: "normal",
          textAlign: "center",
          opacity: "0.8"
        }
      }
    ]
  },

  // 6. Brutal Split
  {
    id: "brutal-split",
    name: "Brutal Split",
    description: "Divisão diagonal brutalista",
    category: "modern",
    difficulty: "medium",
    bgValue: {
      type: "solid",
      color: "#FF0000"
    },
    imageElements: [
      {
        id: "diagonal-shape",
        x: 0, y: 0,
        width: 150, height: 150,
        rotation: 45,
        url: "data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='100' height='100' fill='%23000000'/%3E%3C/svg%3E"
      }
    ]
  },

  // 7. Glass Morphism (Aproximado)
  {
    id: "glass-morphism",
    name: "Glass Morphism",
    description: "Card translúcido com blur",
    category: "modern",
    difficulty: "medium",
    bgValue: {
      type: "gallery",
      url: "" // User preenche
    },
    bgOverlay: {
      opacity: 0.3,
      color: "#000000",
      position: { x: 50, y: 50 }
    },
    imageElements: [
      {
        id: "glass-card",
        x: 25, y: 35,
        width: 50, height: 30,
        rotation: 0,
        url: "data:image/svg+xml,%3Csvg width='400' height='300' xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='400' height='300' fill='rgba(255,255,255,0.2)' rx='20'/%3E%3C/svg%3E"
      }
    ],
    textElements: [
      {
        id: "glass-title",
        text: "Glass Effect",
        x: 50, y: 50,
        width: "auto",
        height: "auto",
        rotation: 0,
        styles: {
          fontSize: "32px",
          fontFamily: "Inter",
          color: "#FFFFFF",
          fontWeight: "bold",
          textAlign: "center",
          opacity: "1"
        }
      }
    ]
  }
];

/**
 * Aplica uma receita a uma variação
 */
export function applyCompositionRecipe(
  variation: any,
  recipe: CompositionRecipe
): any {
  const result = { ...variation };

  // Aplicar textElements
  if (recipe.textElements) {
    result.textElements = recipe.textElements;
  }

  // Aplicar imageElements
  if (recipe.imageElements) {
    result.imageElements = recipe.imageElements;
  }

  // Aplicar background
  if (recipe.bgValue) {
    result.bgValue = recipe.bgValue;
  }

  // Aplicar overlay
  if (recipe.bgOverlay) {
    result.bgOverlay = { ...result.bgOverlay, ...recipe.bgOverlay };
  }

  // Aplicar layout settings
  if (recipe.layoutSettings) {
    result.layoutSettings = {
      ...result.layoutSettings,
      ...recipe.layoutSettings
    };
  }

  // Aplicar template
  if (recipe.template) {
    result.template = recipe.template;
  }

  return result;
}
```

---

## 🎨 3. UI Component: StyleSelector

```typescript
// client/src/components/StyleSelector.tsx

import React, { useState } from "react";
import { PALETTE_PRESETS, paletteToDesignTokens } from "@/lib/palettes";
import { COMPOSITION_RECIPES, applyCompositionRecipe } from "@/lib/compositionRecipes";
import { useEditorStore } from "@/store/editorStore";
import type { PalettePreset, CompositionRecipe } from "@/types";

export function StyleSelector() {
  const { visualSnapshot, setWithSnapshot } = useEditorStore();
  const [activeTab, setActiveTab] = useState<"palettes" | "recipes">("palettes");
  const [selectedPalette, setSelectedPalette] = useState<string | null>(null);
  const [selectedRecipe, setSelectedRecipe] = useState<string | null>(null);

  const handleApplyPalette = (palette: PalettePreset) => {
    const tokens = paletteToDesignTokens(palette);
    const updated = {
      ...visualSnapshot,
      designTokens: tokens,
      backgroundColor: tokens.colors.background,
      textColor: tokens.colors.text,
      accentColor: tokens.colors.primary
    };
    setWithSnapshot(updated, "current");
    setSelectedPalette(palette.id);
  };

  const handleApplyRecipe = (recipe: CompositionRecipe) => {
    const updated = applyCompositionRecipe(visualSnapshot, recipe);
    setWithSnapshot(updated, "current");
    setSelectedRecipe(recipe.id);
  };

  return (
    <div className="flex flex-col gap-4 p-4 bg-white rounded-lg shadow-lg">
      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setActiveTab("palettes")}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === "palettes"
              ? "border-b-2 border-purple-500 text-purple-500"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Paletas ({PALETTE_PRESETS.length})
        </button>
        <button
          onClick={() => setActiveTab("recipes")}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === "recipes"
              ? "border-b-2 border-purple-500 text-purple-500"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Receitas ({COMPOSITION_RECIPES.length})
        </button>
      </div>

      {/* Content */}
      {activeTab === "palettes" && (
        <div className="grid grid-cols-2 gap-3 max-h-96 overflow-y-auto">
          {PALETTE_PRESETS.map((palette) => (
            <button
              key={palette.id}
              onClick={() => handleApplyPalette(palette)}
              className={`p-3 rounded-lg border-2 transition-all ${
                selectedPalette === palette.id
                  ? "border-purple-500 ring-2 ring-purple-200"
                  : "border-gray-200 hover:border-purple-300"
              }`}
              style={{
                background: `linear-gradient(135deg, ${palette.colors.secondary} 0%, ${palette.colors.primary} 100%)`
              }}
            >
              <div className="text-sm font-bold text-white drop-shadow-md">
                {palette.name}
              </div>
              <div className="text-xs text-white/80 drop-shadow-sm">
                {palette.description}
              </div>
              <div className="mt-2 flex gap-1">
                <span className="text-xs bg-white/20 px-2 py-0.5 rounded text-white">
                  {palette.category}
                </span>
                <span className="text-xs bg-white/20 px-2 py-0.5 rounded text-white">
                  {palette.wcagLevel}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {activeTab === "recipes" && (
        <div className="grid grid-cols-1 gap-3 max-h-96 overflow-y-auto">
          {COMPOSITION_RECIPES.map((recipe) => (
            <button
              key={recipe.id}
              onClick={() => handleApplyRecipe(recipe)}
              className={`p-4 rounded-lg border-2 text-left transition-all ${
                selectedRecipe === recipe.id
                  ? "border-purple-500 ring-2 ring-purple-200"
                  : "border-gray-200 hover:border-purple-300"
              }`}
            >
              <div className="font-bold text-gray-800">{recipe.name}</div>
              <div className="text-sm text-gray-600">{recipe.description}</div>
              <div className="mt-2 flex gap-2">
                <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                  {recipe.category}
                </span>
                <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                  {recipe.difficulty}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

## 🧪 4. Testes para Novas Features

```typescript
// client/src/lib/palettes.test.ts

import { describe, it, expect } from "vitest";
import { PALETTE_PRESETS, paletteToDesignTokens } from "./palettes";

describe("Palette Presets", () => {
  it("deve ter 10 paletas definidas", () => {
    expect(PALETTE_PRESETS).toHaveLength(10);
  });

  it("cada paleta deve ter cores hexadecimais válidas", () => {
    PALETTE_PRESETS.forEach((palette) => {
      expect(palette.colors.primary).toMatch(/^#[0-9A-F]{6}$/i);
      expect(palette.colors.secondary).toMatch(/^#[0-9A-F]{6}$/i);
    });
  });

  it("paletteToDesignTokens deve converter corretamente", () => {
    const palette = PALETTE_PRESETS[0];
    const tokens = paletteToDesignTokens(palette);

    expect(tokens.colors.background).toBeDefined();
    expect(tokens.colors.primary).toBeDefined();
    expect(tokens.typography.fontFamily).toBeDefined();
  });
});
```

---

## 📚 5. Documentação de Uso

```markdown
# Como Usar Novos Estilos

## Aplicar uma Paleta

1. No HoloDeck ou Workbench, clique em "Estilos"
2. Selecione a aba "Paletas"
3. Clique na paleta desejada
4. A paleta é aplicada instantaneamente

## Aplicar uma Receita

1. No Workbench, clique em "Composição"
2. Selecione a aba "Receitas"
3. Clique na receita desejada
4. Os elementos são adicionados ao post

## Dicas

- **Paletas** mudam cores e fontes globalmente
- **Receitas** adicionam elementos e layouts
- Combine ambos para resultados únicos
- Use "Undo" para voltar atrás
```

---

**Arquivo criado:** 2026-07-01  
**Versão:** 1.0  
**Status:** Pronto para implementação
