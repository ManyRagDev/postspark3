import { CreativeFamily } from "./types";
import { isDark, darken, lighten, mix } from "./color";
import { splitHeadline } from "./utils";
import { TextElement } from "../postspark";

/** Helper to create a base TextElement with default styles */
function createTextElement(id: string, text: string, x: number, y: number, width: number, overrides?: Partial<TextElement>): TextElement {
  const baseStyles = {
    fontSize: "16px",
    fontFamily: "Inter",
    color: "#ffffff",
    fontWeight: "400",
    fontStyle: "normal",
    textDecoration: "none",
    textAlign: "left" as const,
    lineHeight: "1.2",
    opacity: "1",
  };
  return {
    id,
    text,
    x,
    y,
    width,
    height: "auto",
    rotation: 0,
    ...overrides,
    styles: { ...baseStyles, ...(overrides?.styles || {}) }
  };
}

export const FAMILIES: CreativeFamily[] = [
  {
    id: "editorial-poster",
    label: "Editorial Poster",
    description: "Capa de revista; hierarquia de poster cinematográfico.",
    axes: { composition: "poster", typography: "editorial-serif", color: "monochrome", ornaments: "minimal", texture: "clean", vibe: "editorial" },
    moods: ["editorial", "premium", "sereno"],
    fit: { maxHeadlineChars: 70 },
    carousel: "title-emphasis",
    compose: (ctx) => {
      const { variation, tokens, pxX, pxY, rand } = ctx;
      const { background, secondary } = tokens.colors;
      
      const stickerText = variation.creativeDirection?.hiddenOrnaments?.stickerText || "EDITORIAL";
      const hasImage = !!variation.imageUrl || !!variation.bgValue?.url;

      return {
        layout: "left-aligned",
        headlineFontSize: 1.8,
        headlineFontFamily: "Playfair Display",
        bodyFontFamily: "Inter",
        layoutSettings: {
          headline: { position: "bottom-left", textAlign: "left", freePosition: { x: 8, y: 62 + rand() * 6 }, width: 84 },
          badge: { position: "top-left", textAlign: "left", width: 12 },
          accentBar: { position: "top-left", textAlign: "left", freePosition: { x: 8, y: 56 }, width: 12 },
        },
        ornaments: { badge: "keep", sticker: "hide", accentBar: "keep" },
        cardMode: "full-bleed",
        textElements: [
          createTextElement("cd-kicker", stickerText.toUpperCase(), pxX(8), pxY(8), pxX(84), {
            styles: { fontSize: "11px", fontFamily: "Space Mono", color: secondary, fontWeight: "600" } as any
          })
        ],
        bgOverlay: hasImage ? { color: darken(background, 20), opacity: 0.45 } : undefined
      };
    }
  },

  {
    id: "chromatic-block",
    label: "Chromatic Block",
    description: "A cor É o design. Minimalismo brutal.",
    axes: { composition: "centered-minimal", typography: "display-brutal", color: "monochrome", ornaments: "minimal", texture: "clean", vibe: "tech" },
    moods: ["tech", "cru", "divertido", "urgente"],
    fit: { maxHeadlineChars: 45 },
    carousel: "uniform",
    compose: (ctx) => {
      const { variation, rand, pxX, pxY } = ctx;
      const stickerText = variation.creativeDirection?.hiddenOrnaments?.stickerText || "NOVO";
      
      return {
        layout: "centered",
        headlineFontFamily: "Anton",
        headlineFontSize: 1.6 + rand() * 0.4,
        typography: { textTransform: "uppercase" },
        structure: { borderRadius: "0px" },
        layoutSettings: {
          padding: 32,
          headline: { position: "center", textAlign: "center", width: 84 },
          body: { position: "center", textAlign: "center", width: 84 },
        },
        ornaments: { badge: "hide", sticker: "keep", accentBar: "hide" },
        cardMode: "full-bleed",
        textElements: [
          createTextElement("cd-sticker-rot", stickerText.toUpperCase(), pxX(70), pxY(15), pxX(25), {
            rotation: -6 + rand() * 12,
            styles: { fontSize: "14px", fontFamily: "Anton", color: ctx.tokens.colors.primary, textAlign: "center" } as any
          })
        ]
      };
    }
  },

  {
    id: "brutal-split",
    label: "Brutal Split",
    description: "Declaração agressiva, neobrutalismo.",
    axes: { composition: "split", typography: "display-brutal", color: "vibrant", ornaments: "minimal", texture: "clean", vibe: "urgente" },
    moods: ["urgente", "cru", "tech"],
    fit: { maxHeadlineChars: 40 },
    carousel: "uniform",
    compose: (ctx) => {
      const { tokens, rand } = ctx;
      const { background, primary } = tokens.colors;
      const borderCol = isDark(background) ? "#ffffff" : "#000000";

      return {
        layout: "split",
        splitImagePosition: rand() < 0.5 ? "top" : "bottom",
        headlineFontFamily: "Archivo Black",
        typography: { textTransform: "uppercase" },
        structure: {
          border: `3px solid ${borderCol}`,
          boxShadow: `6px 6px 0px ${darken(primary, 30)}`,
          borderRadius: "0px"
        },
        // We simulate the background color on the headline block via structure if possible,
        // or we just rely on standard layout. The spec says `layoutSettings.headline.backgroundColor: primary`
        // Note: AdvancedLayoutSettings doesn't have backgroundColor in LayoutPosition in the provided schema, 
        // we'll set what we can.
        layoutSettings: {
          headline: { position: "center", textAlign: "center", width: 90 },
          badge: { position: "top-left", textAlign: "left", width: 12 },
        },
        ornaments: { badge: "keep", sticker: "keep", accentBar: "hide" },
        cardMode: "card"
      };
    }
  },

  {
    id: "glitch-signal",
    label: "Glitch Signal",
    description: "Ruído digital e estética tech.",
    axes: { composition: "freeform", typography: "mono-tech", color: "desaturated", ornaments: "minimal", texture: "clean", vibe: "tech" },
    moods: ["tech", "cru"],
    fit: { maxHeadlineChars: 30 },
    carousel: "title-emphasis",
    compose: (ctx) => {
      const { variation, tokens, pxX, pxY, rand } = ctx;
      const { background, primary, secondary } = tokens.colors;
      const badgeText = variation.creativeDirection?.hiddenOrnaments?.badge || "SYS";

      // Calculate glitch offsets (approx 1-2% of width)
      const off1x = 1 + rand() * 1.5;
      const off1y = 1 + rand() * 1.5;
      const off2x = -(1 + rand() * 1.5);
      const off2y = -(1 + rand() * 1.5);

      // In a real implementation we would know the exact position of the headline to duplicate it, 
      // but here we just place the glitches around a fixed center where we assume the headline is.
      // We'll place them near the center.
      return {
        headlineFontFamily: "Space Mono",
        layoutSettings: {
          headline: { position: "center", textAlign: "center", freePosition: { x: 10, y: 45 }, width: 80 }
        },
        ornaments: { badge: "hide", sticker: "hide", accentBar: "hide" },
        cardMode: "full-bleed",
        bgOverlay: { color: darken(background, 8), opacity: 1 },
        textElements: [
          createTextElement("cd-glitch-1", variation.headline, pxX(10 + off1x), pxY(45 + off1y), pxX(80), {
            styles: { fontSize: "32px", fontFamily: "Space Mono", color: primary, opacity: "0.65", fontWeight: "700" } as any
          }),
          createTextElement("cd-glitch-2", variation.headline, pxX(10 + off2x), pxY(45 + off2y), pxX(80), {
            styles: { fontSize: "32px", fontFamily: "Space Mono", color: secondary, opacity: "0.65", fontWeight: "700" } as any
          }),
          createTextElement("cd-scanline-tag", `//${badgeText.toUpperCase()}`, pxX(10), pxY(90), pxX(80), {
            styles: { fontSize: "12px", fontFamily: "Space Mono", color: secondary, opacity: "0.8" } as any
          })
        ]
      };
    }
  },

  {
    id: "glass-veil",
    label: "Glass Veil",
    description: "Premium etéreo sobre foto.",
    axes: { composition: "centered-minimal", typography: "clean-sans", color: "vibrant", ornaments: "minimal", texture: "clean", vibe: "premium" },
    moods: ["premium", "sereno"],
    fit: { needsImage: true },
    carousel: "uniform",
    compose: (ctx) => {
      const { tokens } = ctx;
      const { background, primary } = tokens.colors;

      return {
        layout: "centered",
        bgOverlay: { color: lighten(background, 12), opacity: 0.25 },
        imageSettings: { blur: 2, brightness: 1.05 },
        layoutSettings: {
          card: { position: "center", textAlign: "center", width: 78 }
        },
        structure: {
          border: `1px solid ${primary}40`,
          borderRadius: "24px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.18)"
        },
        ornaments: { badge: "keep", sticker: "hide", accentBar: "hide" },
        cardMode: "card" // using card to show the transluscent background
      };
    }
  },

  {
    id: "kinetic-type",
    label: "Kinetic Type",
    description: "Energia, coreografia tipográfica.",
    axes: { composition: "freeform", typography: "display-brutal", color: "chromatic-block", ornaments: "badges-stickers", texture: "grain", vibe: "divertido" },
    moods: ["urgente", "divertido", "tech", "cru"],
    fit: { maxHeadlineChars: 999 }, // No strict max, actually requires long headline
    carousel: "title-emphasis",
    compose: (ctx) => {
      const { variation, tokens, pxX, pxY, rand } = ctx;
      const { text, primary } = tokens.colors;
      
      const segments = splitHeadline(variation.headline, rand);
      const total = segments.length;
      
      const textElements: TextElement[] = [];
      
      // All but the last segment become textElements
      for (let i = 0; i < total - 1; i++) {
        const segText = segments[i];
        const rot = -4 + rand() * 8;
        const size = i % 2 === 0 ? "48px" : "34px"; // scaled for 360 space: 16px/12px approx
        const realSize = i % 2 === 0 ? "16px" : "12px"; 
        const col = i % 2 === 0 ? text : primary;
        
        textElements.push(
          createTextElement(`cd-kin-${i}`, segText, pxX(10), pxY(18 + i * 16), pxX(80), {
            rotation: rot,
            styles: { fontSize: realSize, fontFamily: "Anton", color: col, textTransform: "uppercase", lineHeight: "1" } as any
          })
        );
      }
      
      // The native headline is positioned as the last segment
      const lastY = 18 + (total - 1) * 16;
      
      return {
        headlineFontFamily: "Anton",
        typography: { textTransform: "uppercase" },
        layoutSettings: {
          headline: { position: "top-left", textAlign: "left", freePosition: { x: 10, y: lastY }, width: 80 }
        },
        ornaments: { badge: "hide", sticker: "keep", accentBar: "hide" },
        cardMode: "full-bleed",
        textElements
      };
    }
  },

  {
    id: "data-punch",
    label: "Data Punch",
    description: "Autoridade numérica; estatística em destaque.",
    axes: { composition: "poster", typography: "clean-sans", color: "desaturated", ornaments: "minimal", texture: "clean", vibe: "sereno" },
    moods: ["editorial", "premium", "tech"],
    fit: { needsNumber: true },
    carousel: "title-emphasis",
    compose: (ctx) => {
      const { variation, tokens, pxX, pxY } = ctx;
      
      // Extract number
      const content = `${variation.headline} ${variation.body}`;
      const match = content.match(/\d+([.,]\d+)?%?/);
      const stat = match ? match[0] : "100%";
      
      return {
        headlineFontSize: 0.8,
        layoutSettings: {
          headline: { position: "top-left", textAlign: "left", freePosition: { x: 8, y: 58 }, width: 84 },
          accentBar: { position: "top-left", textAlign: "left", freePosition: { x: 8, y: 50 }, width: 12 },
        },
        ornaments: { badge: "keep", sticker: "hide", accentBar: "keep" },
        cardMode: "full-bleed",
        textElements: [
          createTextElement("cd-stat", stat, pxX(8), pxY(22), pxX(84), {
            styles: { fontSize: "32px", fontWeight: "800", color: tokens.colors.primary, fontFamily: "Inter", lineHeight: "1" } as any
          })
        ]
      };
    }
  },

  {
    id: "versus",
    label: "Versus / Mito vs Verdade",
    description: "Contraste binário, grade clara.",
    axes: { composition: "grid", typography: "display-brutal", color: "vibrant", ornaments: "minimal", texture: "halftone", vibe: "cru" },
    moods: ["cru", "divertido", "urgente"],
    fit: { needsSections: true },
    carousel: "uniform",
    compose: (ctx) => {
      const { tokens } = ctx;
      // We rely on sectionLayouts rendering logic in the renderer.
      return {
        template: "feature-grid",
        typography: { textTransform: "uppercase" },
        ornaments: { badge: "keep", sticker: "hide", accentBar: "hide" },
        cardMode: "card",
        // sectionLayouts logic is not strictly typed to hold backgroundColor in LayoutPosition in the public interface,
        // but we can set the structure if needed. The blueprint relies on `injectContent` and `sectionLayouts`.
      };
    }
  },

  {
    id: "quote-authority",
    label: "Quote Authority",
    description: "Citação com peso institucional.",
    axes: { composition: "centered-minimal", typography: "editorial-serif", color: "monochrome", ornaments: "minimal", texture: "clean", vibe: "editorial" },
    moods: ["editorial", "premium", "sereno"],
    fit: { maxHeadlineChars: 90 },
    carousel: "uniform",
    compose: (ctx) => {
      const { variation, tokens, pxX, pxY } = ctx;
      const attribution = variation.creativeDirection?.hiddenOrnaments?.badge || "AUTORIDADE";
      
      return {
        headlineFontFamily: "Lora",
        headlineFontSize: 1.3,
        layoutSettings: {
          headline: { position: "center", textAlign: "center", width: 70 },
          body: { position: "center", textAlign: "center", width: 70 }
        },
        ornaments: { badge: "hide", sticker: "hide", accentBar: "hide" },
        cardMode: "full-bleed",
        textElements: [
          createTextElement("cd-quote-open", '"', pxX(6), pxY(6), pxX(15), {
            styles: { fontSize: "40px", color: tokens.colors.primary, opacity: "0.35", fontFamily: "Lora", lineHeight: "1" } as any
          }),
          createTextElement("cd-quote-close", '"', pxX(82), pxY(70), pxX(15), {
            styles: { fontSize: "40px", color: tokens.colors.primary, opacity: "0.35", fontFamily: "Lora", lineHeight: "1" } as any
          }),
          createTextElement("cd-attribution", attribution.toUpperCase(), pxX(10), pxY(86), pxX(80), {
            styles: { fontSize: "13px", color: tokens.colors.secondary, fontFamily: "Inter", textAlign: "center", fontWeight: "500" } as any
          })
        ]
      };
    }
  },

  {
    id: "minimal-air",
    label: "Minimal Air",
    description: "Silêncio premium; muito whitespace.",
    axes: { composition: "centered-minimal", typography: "clean-sans", color: "monochrome", ornaments: "minimal", texture: "clean", vibe: "premium" },
    moods: ["premium", "sereno", "editorial"],
    fit: { maxHeadlineChars: 50 },
    carousel: "uniform",
    compose: (ctx) => {
      return {
        layout: "centered",
        headlineFontSize: 0.9,
        bodyFontSize: 0.85,
        layoutSettings: {
          padding: 48,
          accentBar: { position: "top-center", textAlign: "center", width: 8 },
          headline: { position: "center", textAlign: "center", width: 80 },
          body: { position: "center", textAlign: "center", width: 80 }
        },
        ornaments: { badge: "keep", sticker: "hide", accentBar: "keep" },
        cardMode: "full-bleed"
      };
    }
  },

  {
    id: "mosaic-grid",
    label: "Mosaic Grid",
    description: "Conteúdo denso em blocos assimétricos.",
    axes: { composition: "grid", typography: "clean-sans", color: "desaturated", ornaments: "minimal", texture: "grain", vibe: "cru" },
    moods: ["tech", "divertido", "urgente"],
    fit: { needsSections: true },
    carousel: "uniform",
    compose: (ctx) => {
      return {
        template: "feature-grid",
        decorations: "playful",
        ornaments: { badge: "keep", sticker: "keep", accentBar: "hide" },
        cardMode: "card"
      };
    }
  },

  {
    id: "duotone-wash",
    label: "Duotone Wash",
    description: "Foto banhada na cor da marca.",
    axes: { composition: "poster", typography: "display-brutal", color: "duotone", ornaments: "minimal", texture: "halftone", vibe: "tech" },
    moods: ["tech", "cru", "urgente", "divertido"],
    fit: { needsImage: true },
    carousel: "uniform",
    compose: (ctx) => {
      const { tokens } = ctx;
      const { primary } = tokens.colors;
      
      const referenceBg = mix(primary, "#000000", 0.55);
      const headlineCol = isDark(referenceBg) ? "#ffffff" : "#111111";

      return {
        imageSettings: { saturation: 0.1, contrast: 1.15, blendMode: "multiply" },
        bgOverlay: { color: primary, opacity: 0.55 },
        headlineColor: headlineCol,
        bodyColor: headlineCol,
        ornaments: { badge: "hide", sticker: "keep", accentBar: "keep" },
        cardMode: "full-bleed"
      };
    }
  }
];
