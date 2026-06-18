import { randomUUID } from "node:crypto";
import type {
  BrandDNA,
  DesignTokens,
  SiteIntelligence,
  SiteIntelligenceResult,
} from "@shared/postspark";
import { invokeLLM } from "./_core/llm";
import { extractBrandDNA } from "./brandDNA";
import { generateThemesFromBrandDNA } from "./brandThemeGenerator";
import {
  getLatestSiteIntelligenceByUrl,
  getSiteIntelligenceById,
  upsertSiteIntelligence,
} from "./db";
import {
  collectSiteContent,
  normalizeSiteUrl,
  type SiteContentSnapshot,
} from "./siteContent";

type BusinessSynthesis = Pick<SiteIntelligence, "business" | "editorial"> & {
  warnings: string[];
};

function responseText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter(
        (part): part is { type: "text"; text: string } =>
          Boolean(part) &&
          typeof part === "object" &&
          "type" in part &&
          part.type === "text" &&
          "text" in part &&
          typeof part.text === "string",
      )
      .map((part) => part.text)
      .join("\n");
  }
  return "";
}

function uniqueWords(value: string, limit: number): string[] {
  const stopWords = new Set([
    "para",
    "com",
    "uma",
    "que",
    "dos",
    "das",
    "por",
    "seu",
    "sua",
    "the",
    "and",
    "with",
    "from",
    "our",
  ]);
  const words = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .match(/[a-z0-9]{4,}/g) ?? [];

  return Array.from(new Set(words.filter((word) => !stopWords.has(word)))).slice(
    0,
    limit,
  );
}

function fallbackSynthesis(
  content: SiteContentSnapshot,
): BusinessSynthesis {
  const combined = content.pages
    .map((page) => `${page.title} ${page.description} ${page.content}`)
    .join(" ")
    .slice(0, 20_000);
  const topics = uniqueWords(combined, 8);
  const summary =
    content.pages[0]?.description ||
    content.pages[0]?.content.slice(0, 300) ||
    `Conteudo institucional de ${new URL(content.normalizedUrl).hostname}.`;

  return {
    business: {
      summary,
      products: [],
      services: [],
      valueProposition: summary,
      differentiators: [],
      audiences: [],
      audienceProblems: [],
      objections: [],
      goals: ["authority", "engage"],
    },
    editorial: {
      pillars: topics.slice(0, 4),
      priorityTopics: topics,
      prohibitedClaims: [
        "Nao inventar numeros, clientes, certificacoes ou resultados sem evidencia.",
      ],
      toneGuidelines: [
        "Manter linguagem coerente com as evidencias do site.",
        "Evitar tom generico quando houver sinais editoriais claros.",
      ],
    },
    warnings: [
      "A sintese semantica usou fallback deterministico; confirme publico, oferta e diferenciais.",
    ],
  };
}

async function synthesizeBusiness(
  content: SiteContentSnapshot,
): Promise<BusinessSynthesis> {
  const evidenceText = content.evidence
    .map(
      (item) =>
        `[${item.id}] ${item.kind} ${item.sourceUrl}\n${item.text}`,
    )
    .join("\n\n")
    .slice(0, 28_000);

  if (!evidenceText.trim()) {
    return fallbackSynthesis(content);
  }

  try {
    const response = await invokeLLM({
      traceLabel: "site_semantic_analysis",
      taskRoute: "content_strategy",
      messages: [
        {
          role: "system",
          content: `Voce e um estrategista de marca e conteudo. Extraia somente informacoes sustentadas pelas evidencias do site.
Nao invente produtos, publicos, diferenciais, resultados ou objetivos.
Quando algo nao estiver claro, retorne array vazio e registre um warning.
Os pilares e temas editoriais devem servir ao assunto, publico e objetivos comerciais observados no site.`,
        },
        {
          role: "user",
          content: `Evidencias:
${evidenceText}

Sintetize negocio e estrategia editorial. Responda apenas JSON valido.`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "site_business_intelligence",
          strict: true,
          schema: {
            type: "object",
            properties: {
              business: {
                type: "object",
                properties: {
                  summary: { type: "string" },
                  products: { type: "array", items: { type: "string" } },
                  services: { type: "array", items: { type: "string" } },
                  valueProposition: { type: "string" },
                  differentiators: { type: "array", items: { type: "string" } },
                  audiences: { type: "array", items: { type: "string" } },
                  audienceProblems: { type: "array", items: { type: "string" } },
                  objections: { type: "array", items: { type: "string" } },
                  goals: {
                    type: "array",
                    items: {
                      type: "string",
                      enum: ["educate", "authority", "sell", "engage", "lead"],
                    },
                  },
                },
                required: [
                  "summary",
                  "products",
                  "services",
                  "valueProposition",
                  "differentiators",
                  "audiences",
                  "audienceProblems",
                  "objections",
                  "goals",
                ],
                additionalProperties: false,
              },
              editorial: {
                type: "object",
                properties: {
                  pillars: { type: "array", items: { type: "string" } },
                  priorityTopics: { type: "array", items: { type: "string" } },
                  prohibitedClaims: { type: "array", items: { type: "string" } },
                  toneGuidelines: { type: "array", items: { type: "string" } },
                },
                required: [
                  "pillars",
                  "priorityTopics",
                  "prohibitedClaims",
                  "toneGuidelines",
                ],
                additionalProperties: false,
              },
              warnings: { type: "array", items: { type: "string" } },
            },
            required: ["business", "editorial", "warnings"],
            additionalProperties: false,
          },
        },
      },
    });

    const parsed = JSON.parse(
      responseText(response.choices[0]?.message?.content),
    ) as BusinessSynthesis;
    return parsed;
  } catch (error) {
    console.warn("[siteIntelligence] Semantic synthesis failed:", error);
    return fallbackSynthesis(content);
  }
}

function calculateQuality(
  brand: BrandDNA,
  content: SiteContentSnapshot,
  synthesis: BusinessSynthesis,
): SiteIntelligence["quality"] {
  const semanticSignals = [
    synthesis.business.summary,
    synthesis.business.valueProposition,
    ...synthesis.business.products,
    ...synthesis.business.services,
    ...synthesis.business.audiences,
    ...synthesis.editorial.pillars,
  ].filter(Boolean).length;
  const semantic = Math.min(1, semanticSignals / 10);
  const evidenceCoverage = Math.min(1, content.evidence.length / 8);
  const visual = brand.metadata.extractionQuality;
  const fallbackUsed = synthesis.warnings.some((warning) =>
    warning.toLowerCase().includes("fallback"),
  );

  return {
    overall: Number(
      (visual * 0.4 + semantic * 0.4 + evidenceCoverage * 0.2).toFixed(3),
    ),
    visual,
    semantic,
    evidenceCoverage,
    fallbackUsed,
    warnings: synthesis.warnings,
  };
}

function isSiteIntelligence(value: unknown): value is SiteIntelligence {
  return Boolean(
    value &&
      typeof value === "object" &&
      "id" in value &&
      "brand" in value &&
      "business" in value &&
      "editorial" in value,
  );
}

export async function loadSiteIntelligence(
  id: string,
  userUuid: string,
): Promise<SiteIntelligence | null> {
  try {
    const record = await getSiteIntelligenceById(id, userUuid);
    return isSiteIntelligence(record?.snapshot) ? record.snapshot : null;
  } catch (error) {
    console.warn("[siteIntelligence] Could not load persisted snapshot:", error);
    return null;
  }
}

export async function analyzeSiteIntelligence(
  rawUrl: string,
  userUuid: string,
  options: { persist?: boolean } = {},
): Promise<SiteIntelligenceResult> {
  const shouldPersist = options.persist !== false;
  const normalizedUrl = normalizeSiteUrl(rawUrl);
  const content = await collectSiteContent(normalizedUrl);

  if (shouldPersist) {
    try {
      const cached = await getLatestSiteIntelligenceByUrl(normalizedUrl, userUuid);
      if (
        cached?.fingerprint === content.fingerprint &&
        isSiteIntelligence(cached.snapshot)
      ) {
        const siteIntelligence = cached.snapshot;
        return {
          siteIntelligence,
          brandDNA: siteIntelligence.brand,
          themes: generateThemesFromBrandDNA(siteIntelligence.brand, normalizedUrl),
          fallbackUsed: siteIntelligence.quality.fallbackUsed,
          cached: true,
        };
      }
    } catch (error) {
      console.warn("[siteIntelligence] Cache lookup unavailable:", error);
    }
  }

  const [brand, synthesis] = await Promise.all([
    extractBrandDNA(normalizedUrl, {
      discoveredPages: content.discoveredPages,
    }),
    synthesizeBusiness(content),
  ]);
  const siteIntelligence: SiteIntelligence = {
    id: randomUUID(),
    version: 1,
    sourceUrl: rawUrl,
    normalizedUrl,
    fingerprint: content.fingerprint,
    brand,
    business: synthesis.business,
    editorial: synthesis.editorial,
    evidence: content.evidence,
    quality: calculateQuality(brand, content, synthesis),
    extractedAt: new Date().toISOString(),
  };

  if (shouldPersist) {
    try {
      const record = await upsertSiteIntelligence({
        id: siteIntelligence.id,
        userUuid,
        sourceUrl: rawUrl,
        normalizedUrl,
        fingerprint: content.fingerprint,
        snapshot: siteIntelligence as any,
      });
      if (record.id !== siteIntelligence.id) {
        siteIntelligence.id = record.id;
      }
    } catch (error) {
      console.warn("[siteIntelligence] Persistence unavailable:", error);
      siteIntelligence.quality.warnings.push(
        "Snapshot nao persistido; a migration de site_intelligence pode estar pendente.",
      );
    }
  }

  return {
    siteIntelligence,
    brandDNA: brand,
    themes: generateThemesFromBrandDNA(brand, normalizedUrl),
    fallbackUsed: siteIntelligence.quality.fallbackUsed,
    cached: false,
  };
}

/**
 * Build the SITE INTELLIGENCE prompt block injected into post generation.
 *
 * Beyond listing business/editorial data, this now emits MANDATORY color
 * constraints derived from the brand palette so the LLM cannot drift to
 * generic black/white when a richer brand identity was extracted.
 */
export function siteIntelligenceToPrompt(
  intelligence: SiteIntelligence,
): string {
  const palette = intelligence.brand.colors.palette ?? [
    intelligence.brand.colors.primary,
    intelligence.brand.colors.secondary,
    intelligence.brand.colors.background,
    intelligence.brand.colors.text,
    intelligence.brand.colors.accent,
  ];

  // Pre-compute brand-aware suggestions (same logic as design tokens) so the
  // prompt and the deterministic fallback stay in sync.
  const brandAccent =
    pickBrandAccent(palette) ??
    intelligence.brand.colors.accent ??
    intelligence.brand.colors.primary ??
    "#ff6f61";
  const canvasBackground = pickCanvasBackground(palette);

  return `SITE INTELLIGENCE (fonte unica):
- Snapshot: ${intelligence.id}
- Marca/setor: ${intelligence.brand.brandName} (${intelligence.brand.industry})
- Resumo do negocio: ${intelligence.business.summary}
- Proposta de valor: ${intelligence.business.valueProposition}
- Produtos: ${intelligence.business.products.join("; ") || "nao confirmados"}
- Servicos: ${intelligence.business.services.join("; ") || "nao confirmados"}
- Publicos: ${intelligence.business.audiences.join("; ") || "nao confirmados"}
- Problemas do publico: ${intelligence.business.audienceProblems.join("; ") || "nao confirmados"}
- Diferenciais: ${intelligence.business.differentiators.join("; ") || "nao confirmados"}
- Objetivos observados: ${intelligence.business.goals.join(", ")}
- Pilares editoriais: ${intelligence.editorial.pillars.join("; ")}
- Temas prioritarios: ${intelligence.editorial.priorityTopics.join("; ")}
- Tom: ${intelligence.editorial.toneGuidelines.join("; ")}
- Alegacoes proibidas: ${intelligence.editorial.prohibitedClaims.join("; ")}
- Cores: ${palette.join(", ")}
- Ritmo/dinamica: ${intelligence.brand.composition.rhythm}/${intelligence.brand.composition.dynamics}

REGRAS:
1. Cada tema e post deve se conectar explicitamente a assunto, publico e objetivo acima.
2. Nao invente oferta, numero, cliente, certificacao ou resultado ausente nas evidencias.
3. Use os temas prioritarios como materia-prima, sem copiar frases do site literalmente.
4. Preserve a identidade visual da marca e contraste legivel.

REGRAS DE CORES OBRIGATORIAS (BRAND SOUL):
- O post DEVE pertencer visualmente ao site. As cores abaixo sao MANDATORIAS.
- backgroundColor DEVE ser um destes hexes: ${[canvasBackground, ...palette].slice(0, 4).join(", ")}.
- accentColor DEVE ser o hex mais saturado da marca: ${brandAccent}.
- textColor deve garantir contraste WCAG >= 4.5:1 contra o backgroundColor escolhido.
- NUNCA use preto puro (#000000) nem branco puro (#ffffff) quando a paleta da marca oferece alternativas.`;
}

// ─── WCAG color utilities (local, no dependencies) ──────────────────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  let clean = hex.trim().replace(/^#/, "");
  if (clean.length === 3) {
    clean = clean
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (clean.length !== 6) return null;
  const num = parseInt(clean, 16);
  if (Number.isNaN(num)) return null;
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function relativeLuminance(rgb: { r: number; g: number; b: number }): number {
  const normalize = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return (
    0.2126 * normalize(rgb.r) +
    0.7152 * normalize(rgb.g) +
    0.0722 * normalize(rgb.b)
  );
}

/** WCAG contrast ratio between two hex colors (1.0 - 21.0). Returns 0 if invalid. */
export function wcagContrast(hexA: string, hexB: string): number {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  if (!a || !b) return 0;
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Saturation in HSL space (0-1). Used to pick the most "brand-like" color. */
function colorSaturation(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const max = Math.max(rgb.r, rgb.g, rgb.b);
  const min = Math.min(rgb.r, rgb.g, rgb.b);
  return max === 0 ? 0 : (max - min) / max;
}

/** Brightness 0-255 (perceptual). */
function colorBrightness(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 128;
  return (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
}

const NEUTRAL_FALLBACK_HEXES = new Set([
  "#ffffff",
  "#fff",
  "#1a1a1a",
  "#1f2937",
  "#262626",
  "#4a4a4a",
  "#000000",
  "#000",
]);

function isNeutralOrFallback(hex: string): boolean {
  return NEUTRAL_FALLBACK_HEXES.has(hex.trim().toLowerCase());
}

/**
 * Pick the most brand-representative (saturated) color from a palette,
 * excluding neutrals/blacks/whites when richer alternatives exist.
 */
function pickBrandAccent(palette: string[]): string | null {
  const candidates = palette
    .filter((hex) => hexToRgb(hex) !== null)
    .filter((hex) => !isNeutralOrFallback(hex))
    .sort((a, b) => colorSaturation(b) - colorSaturation(a));
  return candidates[0] ?? null;
}

/**
 * Pick a background color suitable for a POST canvas (not the site's own bg).
 * Prefers dark brand colors so the post reads as a "piece" of the brand,
 * falls back to the darkest palette color, and finally to #171717.
 */
function pickCanvasBackground(palette: string[]): string {
  const valid = palette.filter((hex) => hexToRgb(hex) !== null);
  if (valid.length === 0) return "#171717";

  // Prefer dark colors (brightness < 60) that aren't pure black
  const darks = valid
    .filter((hex) => {
      const b = colorBrightness(hex);
      return b > 12 && b < 80;
    })
    .sort((a, b) => colorBrightness(a) - colorBrightness(b));
  if (darks.length > 0) return darks[0];

  // Fallback: darkest available (excluding pure black)
  const notPureBlack = valid.filter((hex) => colorBrightness(hex) > 12);
  const pool = notPureBlack.length > 0 ? notPureBlack : valid;
  return pool.sort((a, b) => colorBrightness(a) - colorBrightness(b))[0];
}

/** Ensure a readable text color for the given background (WCAG >= 4.5:1). */
function readableTextFor(background: string, candidates: string[]): string {
  // Prefer brand-provided candidates that pass contrast
  for (const candidate of candidates) {
    if (hexToRgb(candidate) && wcagContrast(background, candidate) >= 4.5) {
      return candidate;
    }
  }
  // Deterministic fallback: pure white or near-black based on bg brightness
  return colorBrightness(background) < 128 ? "#FFFFFF" : "#1A1A1A";
}

export function siteIntelligenceToDesignTokens(
  intelligence: SiteIntelligence,
): DesignTokens {
  const brand = intelligence.brand;
  const palette = brand.colors.palette ?? [
    brand.colors.primary,
    brand.colors.secondary,
    brand.colors.background,
    brand.colors.text,
    brand.colors.accent,
  ];

  // ── Resolve brand-aware colors for the POST canvas ──
  const brandAccent =
    pickBrandAccent(palette) ?? brand.colors.accent ?? brand.colors.primary ?? "#ff6f61";

  const background = pickCanvasBackground(palette);

  const text = readableTextFor(background, [
    brand.colors.text,
    ...palette.filter((hex) => !isNeutralOrFallback(hex)),
  ]);

  const secondary =
    pickBrandAccent(
      palette.filter((hex) => hex.toLowerCase() !== brandAccent.toLowerCase()),
    ) ?? brand.colors.secondary ?? brandAccent;

  const card =
    secondary && wcagContrast(background, secondary) >= 3
      ? secondary
      : background;

  return {
    colors: {
      background,
      primary: brandAccent,
      secondary,
      text,
      card,
    },
    typography: {
      fontFamily: brand.typography.headingFont,
      customFontUrl: "",
      originalFont: brand.typography.headingFont,
      textTransform: "none",
      textAlign:
        brand.layout.preferredAlignment === "left" ? "left" : "center",
    },
    structure: {
      borderRadius:
        brand.layout.borderRadius === "square"
          ? "0px"
          : brand.layout.borderRadius === "pill"
            ? "40px"
            : "16px",
      boxShadow: brand.effects.shadows
        ? "0 10px 25px rgba(0,0,0,0.16)"
        : "none",
      border:
        brand.layout.cardStyle === "neobrutalist"
          ? `2px solid ${brand.colors.text}`
          : "none",
    },
    decorations:
      brand.personality.seriousPlayful > 60 ? "playful" : "minimal",
  };
}
