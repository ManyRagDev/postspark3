import { z } from "zod";

/**
 * Contrato da extração de DNA de design + intenções de post.
 *
 * A IA só decide direção (estética, tokens, intenções e copy curada). A composição
 * 2D é feita de forma determinística pelo motor (CanvasPostModel).
 * Todos os campos são obrigatórios (nullable quando opcionais) para funcionar
 * com `json_schema` estrito.
 */
export const DESIGN_EXTRACTION_VERSION = 1 as const;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const postIntentKinds = ["value-pillars", "versus", "steps", "quote", "proof"] as const;
export const postIntentKindSchema = z.enum(postIntentKinds);
export type PostIntentKind = z.infer<typeof postIntentKindSchema>;

export const designMovementSchema = z.enum([
  "neubrutalism",
  "brutalist",
  "minimal",
  "editorial",
  "glass",
  "playful",
  "corporate",
  "dark-tech",
  "retro",
  "other",
]);

export const designDnaSchema = z
  .object({
    styleName: z.string().min(1).max(80),
    movement: designMovementSchema,
    summary: z.string().min(1).max(300),
    brandName: z.string().max(40).nullable(),
    palette: z
      .object({
        background: hex,
        surface: hex,
        text: hex,
        accent: hex,
        accent2: hex,
        accent3: hex,
      })
      .strict(),
    typography: z
      .object({
        headingFont: z.string().min(1).max(80),
        bodyFont: z.string().min(1).max(80),
        labelFont: z.string().min(1).max(80),
        headingWeight: z.number().int().min(300).max(900),
        uppercaseLabels: z.boolean(),
        tracking: z.enum(["tight", "normal", "wide"]),
      })
      .strict(),
    surfaces: z
      .object({
        borderWidth: z.number().min(0).max(8),
        borderColor: hex,
        hardShadow: z.boolean(),
        shadowOffset: z.number().min(0).max(16),
        corners: z.enum(["square", "rounded", "pill"]),
        texture: z.enum(["none", "dots", "grid", "grain"]),
      })
      .strict(),
  })
  .strict();
export type DesignDna = z.infer<typeof designDnaSchema>;

export const intentItemSchema = z
  .object({
    title: z.string().max(32),
    text: z.string().max(96),
    side: z.enum(["left", "right", "none"]),
  })
  .strict();
export type IntentItem = z.infer<typeof intentItemSchema>;

export const postIntentSchema = z
  .object({
    kind: postIntentKindSchema,
    name: z.string().min(1).max(60),
    rationale: z.string().min(1).max(220),
    eyebrow: z.string().min(1).max(40),
    headline: z.string().min(1).max(90),
    highlight: z.string().max(32).nullable(),
    leftLabel: z.string().max(28).nullable(),
    rightLabel: z.string().max(28).nullable(),
    items: z.array(intentItemSchema).max(6),
    ctaLabel: z.string().min(1).max(40),
    footerNote: z.string().max(100),
    caption: z.string().max(900),
  })
  .strict();
export type PostIntent = z.infer<typeof postIntentSchema>;

export const designExtractionSchema = z
  .object({
    dna: designDnaSchema,
    intents: z.array(postIntentSchema).min(3).max(5),
  })
  .strict();
export type DesignExtraction = z.infer<typeof designExtractionSchema>;

/** Evidência determinística lida do HTML/CSS, enviada à IA e usada como guarda. */
export interface PageTokenEvidence {
  fonts: string[];
  colors: string[];
  siteName?: string;
  title?: string;
  description?: string;
}

/**
 * Guarda determinística: se a página declara fontes reais, o DNA nunca inventa
 * outras para título/corpo/rótulo.
 */
export function reconcileDnaWithTokens(dna: DesignDna, evidence: PageTokenEvidence): DesignDna {
  const fonts = evidence.fonts.filter(Boolean);
  if (fonts.length === 0) return dna;
  const known = new Set(fonts.map(f => f.toLowerCase()));
  const pick = (value: string, fallback: string) => (known.has(value.toLowerCase()) ? value : fallback);
  const heading = pick(dna.typography.headingFont, fonts[0]);
  const body = pick(dna.typography.bodyFont, fonts[1] ?? heading);
  const label = pick(dna.typography.labelFont, fonts.find(f => /mono/i.test(f)) ?? body);
  return { ...dna, typography: { ...dna.typography, headingFont: heading, bodyFont: body, labelFont: label } };
}

/**
 * Normaliza um DNA para virar família original: remove tudo que identifica a marca
 * de origem. Textos de marca viram slots; a paleta fica como padrão substituível.
 */
export const CATALOG_SLOT_TEXT = {
  headline: "{{headline}}",
  eyebrow: "{{eyebrow}}",
  cta: "{{cta}}",
  footer: "{{footer}}",
  itemTitle: "{{item.title}}",
  itemText: "{{item.text}}",
} as const;

const GENERIC_INTENT_NAME: Record<PostIntentKind, string> = {
  "value-pillars": "Proposta de valor com pilares",
  versus: "Comparação antes e depois",
  steps: "Passo a passo",
  quote: "Citação de identificação",
  proof: "Prova e quebra de objeção",
};

export function sanitizeForCatalog(extraction: DesignExtraction): DesignExtraction {
  const slotIntent = (intent: PostIntent): PostIntent => ({
    ...intent,
    name: GENERIC_INTENT_NAME[intent.kind],
    rationale: GENERIC_INTENT_NAME[intent.kind],
    eyebrow: CATALOG_SLOT_TEXT.eyebrow,
    headline: CATALOG_SLOT_TEXT.headline,
    highlight: intent.highlight ? "{{highlight}}" : null,
    leftLabel: intent.leftLabel ? "{{left.label}}" : null,
    rightLabel: intent.rightLabel ? "{{right.label}}" : null,
    items: intent.items.map(item => ({
      title: CATALOG_SLOT_TEXT.itemTitle,
      text: CATALOG_SLOT_TEXT.itemText,
      side: item.side,
    })),
    ctaLabel: CATALOG_SLOT_TEXT.cta,
    footerNote: CATALOG_SLOT_TEXT.footer,
    caption: "",
  });
  return {
    dna: { ...extraction.dna, brandName: null },
    intents: extraction.intents.map(slotIntent),
  };
}

/**
 * Projeção do DNA para `brand_projects.visual_preferences` (limites do schema atual:
 * 20 cores, 20 fontes, 30 traços de personalidade, composição até 4000 caracteres).
 */
export function dnaToVisualPreferences(extraction: DesignExtraction) {
  const { dna, intents } = extraction;
  const clip = (value: string, max: number) => (value.length > max ? value.slice(0, max - 1) + "…" : value);
  const fonts = Array.from(new Set([dna.typography.headingFont, dna.typography.bodyFont, dna.typography.labelFont]));
  const surface = `bordas ${dna.surfaces.borderWidth}px ${dna.surfaces.borderColor}, ${
    dna.surfaces.hardShadow ? `sombra dura ${dna.surfaces.shadowOffset}px` : "sem sombra"
  }, cantos ${dna.surfaces.corners}, textura ${dna.surfaces.texture}`;
  return {
    colors: Object.values(dna.palette).map(c => c.toUpperCase()),
    fonts,
    personality: [dna.styleName, dna.movement, dna.summary, surface].map(v => clip(v, 300)),
    composition: clip(
      JSON.stringify({
        source: "design-extraction",
        version: DESIGN_EXTRACTION_VERSION,
        movement: dna.movement,
        typography: {
          headingWeight: dna.typography.headingWeight,
          uppercaseLabels: dna.typography.uppercaseLabels,
          tracking: dna.typography.tracking,
        },
        surfaces: dna.surfaces,
        intents: intents.map(i => i.kind),
      }),
      4000
    ),
  };
}
