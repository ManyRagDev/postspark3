import { z } from "zod";
import type { DesignDnaAnalysis, DesignFontCandidate } from "@shared/designDna";

const FONTSOURCE_API = "https://api.fontsource.org/v1/fonts";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const FONT_CATEGORIES = ["sans-serif", "serif", "display", "monospace", "handwriting"] as const;
type FontCategory = typeof FONT_CATEGORIES[number];

const catalogFontSchema = z.object({
  id: z.string(),
  family: z.string(),
  subsets: z.array(z.string()),
  weights: z.array(z.number()),
  styles: z.array(z.string()),
  variable: z.boolean(),
  category: z.string(),
  type: z.string(),
});

type CatalogFont = Omit<z.infer<typeof catalogFontSchema>, "category"> & { category: FontCategory };
let catalogCache: { expiresAt: number; fonts: CatalogFont[] } | null = null;

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function loadCatalog(): Promise<CatalogFont[]> {
  if (catalogCache && catalogCache.expiresAt > Date.now()) return catalogCache.fonts;
  const response = await fetch(FONTSOURCE_API, { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error(`Fontsource respondeu HTTP ${response.status}.`);
  const parsed = z.array(catalogFontSchema).parse(await response.json());
  const fonts = parsed
    .filter(font => font.type === "google" && font.subsets.includes("latin") && FONT_CATEGORIES.includes(font.category as FontCategory))
    .map(font => ({ ...font, category: font.category as FontCategory }));
  catalogCache = { fonts, expiresAt: Date.now() + CACHE_TTL_MS };
  return fonts;
}

function closestWeight(weights: number[], target: number): number {
  return weights.reduce((closest, weight) => Math.abs(weight - target) < Math.abs(closest - target) ? weight : closest, weights[0] ?? target);
}

function buildGoogleCssUrl(font: CatalogFont, targetWeight = 400): string {
  const weights = Array.from(new Set([
    closestWeight(font.weights, 400),
    closestWeight(font.weights, 700),
    closestWeight(font.weights, targetWeight),
  ])).sort((a, b) => a - b);
  const family = font.family.trim().replace(/ /g, "+");
  return `https://fonts.googleapis.com/css2?family=${family}:wght@${weights.join(";")}&display=swap`;
}

export async function searchOpenFontCatalog(query: string, category?: FontCategory): Promise<DesignFontCandidate[]> {
  const needle = normalize(query);
  if (needle.length < 2) return [];
  const fonts = await loadCatalog();
  return fonts
    .filter(font => normalize(font.family).includes(needle) && (!category || font.category === category))
    .sort((a, b) => {
      const aName = normalize(a.family);
      const bName = normalize(b.family);
      const aRank = aName === needle ? 0 : aName.startsWith(needle) ? 1 : 2;
      const bRank = bName === needle ? 0 : bName.startsWith(needle) ? 1 : 2;
      return aRank - bRank || a.family.localeCompare(b.family);
    })
    .slice(0, 12)
    .map(font => ({
      id: font.id,
      family: font.family,
      category: font.category,
      matchBasis: "catalog-search" as const,
      rationale: "Encontrada pelo nome no catálogo aberto; compare visualmente antes de escolher.",
      weights: font.weights,
      styles: font.styles,
      variable: font.variable,
      source: "fontsource-google" as const,
      cssUrl: buildGoogleCssUrl(font),
      license: "open-source" as const,
    }));
}

export async function resolveOpenFontCandidates(
  typography: DesignDnaAnalysis["typography"],
): Promise<{ status: DesignDnaAnalysis["fontCatalogStatus"]; candidates: DesignFontCandidate[] }> {
  let fonts: CatalogFont[];
  try {
    fonts = await loadCatalog();
  } catch (error) {
    console.warn("[designDna.fonts] Fontsource catalog unavailable", error);
    return { status: "unavailable", candidates: [] };
  }

  const byName = new Map(fonts.map(font => [normalize(font.family), font]));
  const proposals = [
    ...(typography.identification.guessedFamily && typography.identification.confidence >= 0.8
      ? [{ family: typography.identification.guessedFamily, rationale: "Nome sugerido pela análise visual; confirme comparando as letras.", basis: "identified-family" as const, rank: 1 }]
      : []),
    ...typography.suggestedFamilies.map(item => ({
      family: item.family,
      rationale: item.rationale,
      basis: "model-suggestion" as const,
      rank: item.similarityScore,
    })),
  ].sort((a, b) => b.rank - a.rank);
  const seen = new Set<string>();
  const candidates = proposals.flatMap(proposal => {
    const font = byName.get(normalize(proposal.family));
    if (!font || seen.has(font.id)) return [];
    if (font.category !== typography.traits.category && proposal.basis !== "identified-family") return [];
    if (!font.weights.some(weight => Math.abs(weight - typography.traits.weight) <= 200)) return [];
    seen.add(font.id);
    return [{
      id: font.id,
      family: font.family,
      category: font.category,
      matchBasis: proposal.basis,
      rationale: proposal.rationale,
      weights: font.weights,
      styles: font.styles,
      variable: font.variable,
      source: "fontsource-google" as const,
      cssUrl: buildGoogleCssUrl(font, typography.traits.weight),
      license: "open-source" as const,
    }];
  }).slice(0, 4);

  return { status: candidates.length ? "resolved" : "no_match", candidates };
}
