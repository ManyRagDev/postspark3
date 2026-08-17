import { CreativeFamily } from "./types";
import { isDark, darken, lighten, mix } from "./color";
import { splitHeadline } from "./utils";
import { TextElement } from "../postspark";
import { aspectOf, centeredStack, flX, posterBottom, sectionGrid, stack } from "./layoutArchetypes";

/**
 * CR-003 — Calibração de encaixe por proporção.
 *
 * Os blocos de headline/body têm altura EXPLÍCITA por formato para que o
 * TEXTO QUEBRADO no piso de legibilidade caiba na caixa declarada — o
 * resolvedor nunca corta; se a caixa for pequena demais, a resolução falha
 * estruturalmente e o orçamento de 5% do harness (palavras irrecuperáveis)
 * vira falso vermelho. Valores derivados do corpus do harness (pior caso por
 * família/fonte/largura) com margem de segurança.
 */
const HEADLINE_HEIGHT_PCT: Record<string, Record<string, number>> = {
  // 4 linhas no piso (fontes compactas, largura ~84%)
  compact: { "1:1": 33, "5:6": 28, "9:16": 19 },
  // 5 linhas no piso (fontes display largas / larguras menores)
  display: { "1:1": 41, "5:6": 34, "9:16": 23 },
  // 6 linhas no piso (mono/estreitas)
  mono: { "1:1": 49, "5:6": 41, "9:16": 28 },
};
const BODY_HEIGHT_PCT: Record<string, Record<string, number>> = {
  standard: { "1:1": 24, "5:6": 20, "9:16": 14 },
};
// Folga REAL acima de MIN_TEXT_GAP (shared/visualFit.ts = 4), mesma razão do
// default de `stack()` em layoutArchetypes.ts. Usado tanto entre headline/body
// quanto entre headline/sectionLayouts (versus, mosaic-grid).
const GAP_PCT = 6;
/**
 * Centro vertical do headline ancorado no topo (versus, mosaic-grid), por
 * proporção — precisa deixar o TOPO da caixa declarada (yCenter -
 * HEADLINE_HEIGHT_PCT.display[ar]/2) dentro da safe area
 * (safeAreaMarginsPercent, layoutArchetypes.ts: top 5% em 1:1/5:6, 6% em
 * 9:16). Ex.: 1:1 tem height=41 → topo = yCenter - 20.5; precisa yCenter >= 25.5.
 */
const HEADLINE_TOP_ANCHOR: Record<string, number> = { "1:1": 26, "5:6": 23, "9:16": 20 };
/** Margem inferior da âncora de rodapé (≥ safe area; 9:16 usa a zona de UI). */
const BOTTOM_MARGIN_PCT: Record<string, number> = { "1:1": 6, "5:6": 6, "9:16": 13 };

/**
 * Overrides parciais aceitos por `createTextElement`: `styles` é
 * deep-partial (só os campos que a família quer sobrescrever), diferente de
 * `Partial<TextElement>` que exigiria o objeto `styles` completo. Isso
 * elimina o `as any` que cada chamada com `styles` parcial precisava antes
 * (SPEC-002, docs/reforma/SPEC-002 passo 3).
 */
type TextElementOverrides = Partial<Omit<TextElement, "styles">> & {
  styles?: Partial<TextElement["styles"]>;
};

/** Helper to create a base TextElement with default styles */
function createTextElement(id: string, text: string, x: number, y: number, width: number, overrides?: TextElementOverrides): TextElement {
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
      const { variation, tokens, pxX, pxY } = ctx;
      const { background, secondary } = tokens.colors;
      
      const stickerText = variation.creativeDirection?.hiddenOrnaments?.stickerText || "EDITORIAL";
      const hasImage = !!variation.imageUrl || !!variation.bgValue?.url;
      const ar = aspectOf(ctx.aspectRatio);

      // CR-003: caixa do rodapé dimensionada para o pior headline do corpus
      // (4 linhas no piso) com a âncora respeitando a safe area por formato.
      const posterSlots = stack({
        xCenterPercent: flX(8, 84),
        headlineWidthPercent: 84,
        headlineHeightPercent: HEADLINE_HEIGHT_PCT.compact[ar],
        bodyHeightPercent: BODY_HEIGHT_PCT.standard[ar],
        gapPercent: GAP_PCT,
        topPercent: 100 - BOTTOM_MARGIN_PCT[ar] - (HEADLINE_HEIGHT_PCT.compact[ar] + GAP_PCT + BODY_HEIGHT_PCT.standard[ar]),
        textAlign: "left",
        position: "bottom-left",
      });

      return {
        layout: "left-aligned",
        headlineFontSize: 1.8,
        headlineFontFamily: "Playfair Display",
        bodyFontFamily: "Inter",
        layoutSettings: {
          headline: posterSlots.headline,
          body: posterSlots.body,
          badge: { position: "top-left", textAlign: "left", width: 12 },
          accentBar: { position: "top-left", textAlign: "left", freePosition: { x: flX(8, 12), y: 56 }, width: 12 },
        },
        ornaments: { badge: "keep", sticker: "hide", accentBar: "keep" },
        cardMode: "full-bleed",
        textElements: [
          createTextElement("cd-kicker", stickerText.toUpperCase(), pxX(8), pxY(8), pxX(84), {
            styles: { fontSize: "11px", fontFamily: "Space Mono", color: secondary, fontWeight: "600" }
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
      const ar = aspectOf(ctx.aspectRatio);
      
      const chromaticSlots = centeredStack({
        headlineWidthPercent: 84,
        headlineHeightPercent: HEADLINE_HEIGHT_PCT.compact[ar],
        bodyHeightPercent: BODY_HEIGHT_PCT.standard[ar],
        textAlign: "center",
        position: "center",
      });

      return {
        layout: "centered",
        headlineFontFamily: "Anton",
        headlineFontSize: 1.6 + rand() * 0.4,
        typography: { textTransform: "uppercase" },
        structure: { borderRadius: "0px" },
        layoutSettings: {
          padding: 32,
          headline: chromaticSlots.headline,
          body: chromaticSlots.body!,
        },
        ornaments: { badge: "hide", sticker: "keep", accentBar: "hide" },
        cardMode: "full-bleed",
        textElements: [
          createTextElement("cd-sticker-rot", stickerText.toUpperCase(), pxX(70), pxY(15), pxX(25), {
            rotation: -6 + rand() * 12,
            styles: { fontSize: "14px", fontFamily: "Anton", color: ctx.tokens.colors.primary, textAlign: "center" }
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
      const splitImagePosition = rand() < 0.5 ? "top" : "bottom";
      const ar = aspectOf(ctx.aspectRatio);

      // Imagem ocupa a metade vertical indicada por `splitImagePosition`; o
      // headline centra na metade oposta (yCenter 28 quando a imagem é a
      // metade de baixo, 72 quando a imagem é a de cima). CR-003: caixa
      // dimensionada para 5 linhas no piso (fonte display larga).
      const brutalSlots = centeredStack({
        // 88, não 90: centrado, sobra (100-88)/2=6% de cada lado — cabe na
        // safe area mais apertada (9:16, margem lateral 6%, safeAreaMarginsPercent
        // em layoutArchetypes.ts). 90 cabia em 1:1/5:6 (margem 5%) mas estourava em 9:16.
        headlineWidthPercent: 88,
        headlineHeightPercent: HEADLINE_HEIGHT_PCT.display[ar],
        textAlign: "center",
        position: "center",
        yCenterPercent: splitImagePosition === "top" ? 72 : 28,
      });

      return {
        layout: "split",
        splitImagePosition,
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
          headline: brutalSlots.headline,
          badge: { position: "top-left", textAlign: "left", width: 12 },
        },
        ornaments: { badge: "keep", sticker: "keep", accentBar: "hide", body: "hide" },
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
      const ar = aspectOf(ctx.aspectRatio);

      // In a real implementation we would know the exact position of the headline to duplicate it, 
      // but here we just place the glitches around a fixed center where we assume the headline is.
      // We'll place them near the center.
      const glitchSlots = centeredStack({
        xCenterPercent: flX(10, 80),
        headlineWidthPercent: 80,
        headlineHeightPercent: HEADLINE_HEIGHT_PCT.mono[ar],
        bodyHeightPercent: BODY_HEIGHT_PCT.standard[ar],
        textAlign: "center",
        position: "center",
        yCenterPercent: 45,
      });

      return {
        headlineFontFamily: "Space Mono",
        layoutSettings: {
          headline: glitchSlots.headline,
          body: glitchSlots.body!
        },
        ornaments: { badge: "hide", sticker: "hide", accentBar: "hide" },
        cardMode: "full-bleed",
        // CR-003: overlay SUBDOMINANTE (8% de escurecimento é quase invisível) —
        // com opacidade dominante, o fundo efetivo do texto mudaria e derrubaria
        // o contraste do texto em paletas claras.
        bgOverlay: { color: darken(background, 8), opacity: 0.4 },
        textElements: [
          createTextElement("cd-glitch-1", variation.headline, pxX(10 + off1x), pxY(45 + off1y), pxX(80), {
            styles: { fontSize: "32px", fontFamily: "Space Mono", color: primary, opacity: "0.65", fontWeight: "700" }
          }),
          createTextElement("cd-glitch-2", variation.headline, pxX(10 + off2x), pxY(45 + off2y), pxX(80), {
            styles: { fontSize: "32px", fontFamily: "Space Mono", color: secondary, opacity: "0.65", fontWeight: "700" }
          }),
          createTextElement("cd-scanline-tag", `//${badgeText.toUpperCase()}`, pxX(10), pxY(90), pxX(80), {
            styles: { fontSize: "12px", fontFamily: "Space Mono", color: secondary, opacity: "0.8" }
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
      const ar = aspectOf(ctx.aspectRatio);

      const glassSlots = centeredStack({
        headlineWidthPercent: 78,
        headlineHeightPercent: HEADLINE_HEIGHT_PCT.display[ar],
        bodyHeightPercent: BODY_HEIGHT_PCT.standard[ar],
        textAlign: "center",
        position: "center",
      });

      return {
        layout: "centered",
        bgOverlay: { color: lighten(background, 12), opacity: 0.25 },
        imageSettings: { blur: 2, brightness: 1.05 },
        layoutSettings: {
          card: { position: "center", textAlign: "center", width: 78 },
          headline: glassSlots.headline,
          body: glassSlots.body!,
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
            styles: { fontSize: realSize, fontFamily: "Anton", color: col, textTransform: "uppercase", lineHeight: "1" }
          })
        );
      }
      
      // The native headline is positioned as the last segment — CR-003: o
      // SLOT declarado precisa acomodar o texto inteiro no piso; a caixa
      // declarada fica centralizada e os segmentos decorativos mantêm o
      // desenho original.
      const ar = aspectOf(ctx.aspectRatio);
      const kineticSlots = centeredStack({
        xCenterPercent: flX(10, 80),
        headlineWidthPercent: 80,
        headlineHeightPercent: HEADLINE_HEIGHT_PCT.display[ar],
        bodyHeightPercent: BODY_HEIGHT_PCT.standard[ar],
        position: "center",
        yCenterPercent: 45,
      });

      return {
        headlineFontFamily: "Anton",
        typography: { textTransform: "uppercase" },
        layoutSettings: {
          headline: kineticSlots.headline,
          body: kineticSlots.body!
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
      const ar = aspectOf(ctx.aspectRatio);
      
      const dataPunchSlots = stack({
        xCenterPercent: flX(8, 84),
        headlineWidthPercent: 84,
        headlineHeightPercent: HEADLINE_HEIGHT_PCT.display[ar],
        topPercent: 49,
        textAlign: "left",
        position: "top-left",
      });

      return {
        headlineFontSize: 0.8,
        layoutSettings: {
          headline: dataPunchSlots.headline,
          accentBar: { position: "top-left", textAlign: "left", freePosition: { x: flX(8, 12), y: 50 }, width: 12 },
        },
        ornaments: { badge: "keep", sticker: "hide", accentBar: "keep", body: "hide" },
        cardMode: "full-bleed",
        textElements: [
          createTextElement("cd-stat", stat, pxX(8), pxY(22), pxX(84), {
            styles: { fontSize: "32px", fontWeight: "800", color: tokens.colors.primary, fontFamily: "Inter", lineHeight: "1" }
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
      // CR-003: contrato mensurável — a família agora DECLARA o slot de
      // headline (topo do canvas, tamanho do pior caso do corpus) para que o
      // harness e o resolvedor canônico consigam provar encaixe. O template
      // continua `feature-grid`; as seções também têm geometria explícita
      // (sectionGrid, abaixo do headline) para que validateVisualFit consiga
      // provar não-colisão entre headline e a grade.
      const ar = aspectOf(ctx.aspectRatio);
      const versusSlots = centeredStack({
        headlineWidthPercent: 84,
        headlineHeightPercent: HEADLINE_HEIGHT_PCT.display[ar],
        position: "top-left",
        yCenterPercent: HEADLINE_TOP_ANCHOR[ar],
      });
      const sectionsTop = versusSlots.headline.freePosition!.y + versusSlots.headline.height! / 2 + GAP_PCT;
      const sections = sectionGrid({
        topPercent: sectionsTop,
        rowHeightPercent: BODY_HEIGHT_PCT.standard[ar],
      });

      return {
        template: "feature-grid",
        typography: { textTransform: "uppercase" },
        ornaments: { badge: "keep", sticker: "hide", accentBar: "hide", body: "hide" },
        cardMode: "card",
        layoutSettings: {
          headline: versusSlots.headline,
          sectionLayouts: sections,
        },
        layout: "left-aligned",
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
      const ar = aspectOf(ctx.aspectRatio);
      
      const quoteSlots = centeredStack({
        headlineWidthPercent: 70,
        headlineHeightPercent: HEADLINE_HEIGHT_PCT.display[ar],
        bodyHeightPercent: BODY_HEIGHT_PCT.standard[ar],
        textAlign: "center",
        position: "center",
      });

      return {
        headlineFontFamily: "Lora",
        headlineFontSize: 1.3,
        layoutSettings: {
          headline: quoteSlots.headline,
          body: quoteSlots.body!
        },
        ornaments: { badge: "hide", sticker: "hide", accentBar: "hide" },
        cardMode: "full-bleed",
        textElements: [
          createTextElement("cd-quote-open", '"', pxX(6), pxY(6), pxX(15), {
            styles: { fontSize: "40px", color: tokens.colors.primary, opacity: "0.35", fontFamily: "Lora", lineHeight: "1" }
          }),
          createTextElement("cd-quote-close", '"', pxX(82), pxY(70), pxX(15), {
            styles: { fontSize: "40px", color: tokens.colors.primary, opacity: "0.35", fontFamily: "Lora", lineHeight: "1" }
          }),
          createTextElement("cd-attribution", attribution.toUpperCase(), pxX(10), pxY(86), pxX(80), {
            styles: { fontSize: "13px", color: tokens.colors.secondary, fontFamily: "Inter", textAlign: "center", fontWeight: "500" }
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
      const ar = aspectOf(ctx.aspectRatio);
      const minimalSlots = centeredStack({
        headlineWidthPercent: 80,
        headlineHeightPercent: HEADLINE_HEIGHT_PCT.display[ar],
        bodyHeightPercent: BODY_HEIGHT_PCT.standard[ar],
        textAlign: "center",
        position: "center",
      });

      return {
        layout: "centered",
        headlineFontSize: 0.9,
        bodyFontSize: 0.85,
        layoutSettings: {
          padding: 48,
          accentBar: { position: "top-center", textAlign: "center", width: 8 },
          headline: minimalSlots.headline,
          body: minimalSlots.body!
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
      // CR-003: mesmo contrato mensurável de "versus" — headline explícito
      // no topo, seções também com geometria explícita (sectionGrid) abaixo
      // dele em feature-grid, para provar não-colisão.
      const ar = aspectOf(ctx.aspectRatio);
      const mosaicSlots = centeredStack({
        headlineWidthPercent: 84,
        headlineHeightPercent: HEADLINE_HEIGHT_PCT.display[ar],
        position: "top-left",
        yCenterPercent: HEADLINE_TOP_ANCHOR[ar],
      });
      const sectionsTop = mosaicSlots.headline.freePosition!.y + mosaicSlots.headline.height! / 2 + GAP_PCT;
      const sections = sectionGrid({
        topPercent: sectionsTop,
        rowHeightPercent: BODY_HEIGHT_PCT.standard[ar],
      });

      return {
        template: "feature-grid",
        decorations: "playful",
        ornaments: { badge: "keep", sticker: "keep", accentBar: "hide", body: "hide" },
        cardMode: "card",
        layoutSettings: {
          headline: mosaicSlots.headline,
          sectionLayouts: sections,
        },
        layout: "left-aligned",
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
      const ar = aspectOf(ctx.aspectRatio);
      
      const referenceBg = mix(primary, "#000000", 0.55);
      const headlineCol = isDark(referenceBg) ? "#ffffff" : "#111111";
      const duotoneSlots = posterBottom({
        headlineWidthPercent: 84,
        headlineHeightPercent: HEADLINE_HEIGHT_PCT.display[ar],
        bodyHeightPercent: BODY_HEIGHT_PCT.standard[ar],
        gapPercent: GAP_PCT,
        bottomMarginPercent: BOTTOM_MARGIN_PCT[ar],
        textAlign: "left",
        position: "bottom-left",
      });

      return {
        imageSettings: { saturation: 0.1, contrast: 1.15, blendMode: "multiply" },
        // CR-003: o wash duotone é ESCURO por construção (`primary⊕preto`),
        // com opacidade alta — o fundo efetivo do texto independe da paleta
        // base (clara ou escura) e o texto branco sempre atinge AA. Um wash
        // de 55% de cor brilhante vira tom médio e quebra o contraste.
        bgOverlay: { color: referenceBg, opacity: 0.85 },
        headlineColor: headlineCol,
        bodyColor: headlineCol,
        textColor: headlineCol,
        layoutSettings: {
          headline: duotoneSlots.headline,
          body: duotoneSlots.body!,
        },
        ornaments: { badge: "hide", sticker: "keep", accentBar: "keep" },
        cardMode: "full-bleed"
      };
    }
  }
];
