import { z } from "zod";

/**
 * Contrato da extração de DNA de design + intenções de post.
 *
 * A análise propõe direção visual e editorial. O CanvasLab materializa e mede
 * a composição no documento editável.
 */
export const DESIGN_EXTRACTION_VERSION = 2 as const;
export const CREATIVE_DESIGN_EXTRACTION_VERSION = 3 as const;
export const ARTWORK_PROPOSAL_COUNT = 5;

export const DEFAULT_DESIGN_EXTRACTION_MODEL = "google/gemini-3.8-flash";
export const designExtractionModelSchema = z.enum([
  DEFAULT_DESIGN_EXTRACTION_MODEL,
  "openai/gpt-6.2-sol",
  "google/gemini-4-neon",
]);
export type DesignExtractionModel = z.infer<typeof designExtractionModelSchema>;

export const designExtractionModelLabels: Record<DesignExtractionModel, string> = {
  [DEFAULT_DESIGN_EXTRACTION_MODEL]: "Gemini 3.8 Flash",
  "openai/gpt-6.2-sol": "GPT-6.2 Sol",
  "google/gemini-4-neon": "Gemini 4 Neon",
};

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

export const referenceCompositionSchema = z.object({
  orientation: z.enum(["stacked", "split"]),
  primaryPosition: z.enum(["first", "last"]),
  alignment: z.enum(["left", "center", "right"]),
  verticalAlignment: z.enum(["top", "center", "bottom"]),
  margin: z.number().min(0.035).max(0.14),
  spacing: z.number().min(0.018).max(0.08),
  leadWidth: z.number().min(0.6).max(1),
  splitShare: z.number().min(0.4).max(0.65),
  headingSize: z.number().min(23).max(48),
  headingStyle: z.enum(["normal", "italic"]),
  details: z.enum(["list", "grid", "featured"]),
  detailStyle: z.enum(["plain", "rule", "panel"]),
  actionStyle: z.enum(["text", "outline", "filled"]),
  actionPosition: z.enum(["lead", "end"]),
  background: z.object({
    kind: z.enum(["solid", "linear", "spotlight"]),
    tint: z.enum(["surface", "accent", "accent2", "accent3"]),
    strength: z.number().min(0).max(0.85),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  }).strict(),
}).strict();
export type ReferenceComposition = z.infer<typeof referenceCompositionSchema>;

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
    composition: referenceCompositionSchema.optional(),
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

// Respostas para clientes anteriores mantêm o contrato das intenções.
export const designExtractionResponseSchema = designExtractionSchema.extend({
  dna: designDnaSchema.extend({ composition: referenceCompositionSchema }),
});

const artworkBoxSchema = z.object({
  x: z.number().min(0).max(0.99),
  y: z.number().min(0).max(0.99),
  width: z.number().min(0.001).max(1),
  height: z.number().min(0.001).max(1),
}).strict();

const artworkTextSchema = z.object({
  text: z.string().min(1).max(180),
  role: z.enum(["headline", "support", "brand", "callToAction", "footer", "marker"]),
  box: artworkBoxSchema,
  color: hex,
  fontSize: z.number().min(9).max(150),
  fontFamily: z.string().min(1).max(80).optional(),
  fontWeight: z.number().int().min(300).max(900).optional(),
  italic: z.boolean().optional(),
  align: z.enum(["left", "center", "right"]).optional(),
  letterSpacing: z.number().min(-4).max(14).optional(),
}).strict();

const artworkShapeSchema = z.object({
  box: artworkBoxSchema,
  fill: hex.nullable(),
  cornerRadius: z.number().min(0).max(180).optional(),
  stroke: hex.optional(),
  strokeWidth: z.number().min(0.5).max(12).optional(),
  shadowOffset: z.number().min(1).max(16).optional(),
}).strict();

export const artworkProposalSchema = z.object({
  name: z.string().min(1).max(60),
  rationale: z.string().min(1).max(220),
  caption: z.string().max(600),
  background: z.object({
    color: hex,
    kind: z.enum(["solid", "linear", "spotlight"]),
    tint: hex.optional(),
    x: z.number().min(0).max(1).optional(),
    y: z.number().min(0).max(1).optional(),
    texture: z.enum(["none", "dots", "grid", "grain"]).optional(),
  }).strict(),
  texts: z.array(artworkTextSchema).min(1).max(8),
  shapes: z.array(artworkShapeSchema).max(10),
}).strict();
export type ArtworkProposal = z.infer<typeof artworkProposalSchema>;
export type ArtworkText = z.infer<typeof artworkTextSchema>;

export const creativeDesignExtractionSchema = z.object({
  dna: designDnaSchema.omit({ composition: true }),
  proposals: z.array(artworkProposalSchema).length(ARTWORK_PROPOSAL_COUNT),
}).strict().superRefine(({ proposals }, ctx) => {
  const layouts = new Set<string>();
  const position = (box: z.infer<typeof artworkBoxSchema>) =>
    [box.x, box.y, box.width, box.height].map(value => Math.round(value * 20)).join(",");
  proposals.forEach((proposal, index) => {
    const signature = JSON.stringify([
      proposal.texts.map(text => [position(text.box), Math.round(text.fontSize / 8), text.align ?? "left"].join("/")).sort(),
      proposal.shapes.map(shape => position(shape.box)).sort(),
    ]);
    if (layouts.has(signature)) {
      ctx.addIssue({ code: "custom", path: ["proposals", index], message: "Cada proposta precisa de uma composição própria." });
    }
    layouts.add(signature);
    if (!proposal.texts.some(text => text.role === "headline" && text.text.trim())) {
      ctx.addIssue({ code: "custom", path: ["proposals", index, "texts"], message: "Identifique o texto principal da proposta." });
    }
  });
});
export type CreativeDesignExtraction = z.infer<typeof creativeDesignExtractionSchema>;

export const designExtractionResultSchema = z.union([designExtractionSchema, creativeDesignExtractionSchema]);
export type DesignExtractionResult = z.infer<typeof designExtractionResultSchema>;

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

export function sanitizeForCatalog(extraction: DesignExtractionResult): DesignExtractionResult {
  if ("proposals" in extraction) {
    const textSlot: Record<ArtworkText["role"], string> = {
      headline: CATALOG_SLOT_TEXT.headline,
      support: CATALOG_SLOT_TEXT.itemText,
      brand: "{{brand}}",
      callToAction: CATALOG_SLOT_TEXT.cta,
      footer: CATALOG_SLOT_TEXT.footer,
      marker: "{{marker}}",
    };
    return {
      dna: {
        ...extraction.dna,
        brandName: null,
        styleName: "Família visual",
        summary: "Composições editáveis para adaptação editorial.",
      },
      proposals: extraction.proposals.map((proposal, index) => ({
        ...proposal,
        name: `Composição ${index + 1}`,
        rationale: "Estrutura visual para conteúdo editável.",
        caption: "",
        texts: proposal.texts.map(layer => ({ ...layer, text: textSlot[layer.role] })),
      })),
    };
  }
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
export function dnaToVisualPreferences(extraction: DesignExtractionResult) {
  const { dna } = extraction;
  const composition = "composition" in dna ? dna.composition : undefined;
  const version = "proposals" in extraction
    ? CREATIVE_DESIGN_EXTRACTION_VERSION
    : composition ? DESIGN_EXTRACTION_VERSION : 1;
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
        version,
        movement: dna.movement,
        palette: dna.palette,
        typography: {
          headingWeight: dna.typography.headingWeight,
          uppercaseLabels: dna.typography.uppercaseLabels,
          tracking: dna.typography.tracking,
        },
        surfaces: dna.surfaces,
        ...(composition && { composition }),
        ...("intents" in extraction && { intents: extraction.intents.map(i => i.kind) }),
      }),
      4000
    ),
  };
}
