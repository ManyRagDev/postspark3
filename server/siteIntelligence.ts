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

export function siteIntelligenceToPrompt(
  intelligence: SiteIntelligence,
): string {
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
- Cores: ${intelligence.brand.colors.palette.join(", ")}
- Ritmo/dinamica: ${intelligence.brand.composition.rhythm}/${intelligence.brand.composition.dynamics}

REGRAS:
1. Cada tema e post deve se conectar explicitamente a assunto, publico e objetivo acima.
2. Nao invente oferta, numero, cliente, certificacao ou resultado ausente nas evidencias.
3. Use os temas prioritarios como materia-prima, sem copiar frases do site literalmente.
4. Preserve a identidade visual da marca e contraste legivel.`;
}

export function siteIntelligenceToDesignTokens(
  intelligence: SiteIntelligence,
): DesignTokens {
  const brand = intelligence.brand;
  return {
    colors: {
      background: brand.colors.background,
      primary: brand.colors.primary,
      secondary: brand.colors.secondary,
      text: brand.colors.text,
      card: brand.colors.secondary,
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
