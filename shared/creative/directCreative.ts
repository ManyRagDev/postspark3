import { PostVariation } from "../postspark";
import { CreativeIntent, CreativeMood, CreativeEnergy, CreativeFormality, CreativeDirection, PaletteDef, CreativeFamily } from "./types";
import { FAMILIES } from "./families";
import { PALETTES } from "./palettes";
import { mulberry32 } from "./seed";
import { contrastRatio, isDark } from "./color";

function isValidIntent(intent: any): intent is CreativeIntent {
  return intent && typeof intent.mood === "string" && typeof intent.energy === "string" && typeof intent.formality === "string";
}

function classifyIntentFromContent(variation: PostVariation): CreativeIntent {
  const content = `${variation.headline || ""} ${variation.body || ""} ${(variation.hashtags || []).join(" ")}`.toLowerCase();
  let mood: CreativeMood = "editorial";
  
  if (/(urgente|última|não perca|hoje|agora|corre|imperdível|promoção)/.test(content)) mood = "urgente";
  else if (/(ia|inteligência artificial|tech|startup|app|software|digital|crypto|futuro|inovação)/.test(content)) mood = "tech";
  else if (/(luxo|premium|exclusivo|sofisticado|elite|alta performance)/.test(content)) mood = "premium";
  else if (/(saúde|bem-estar|equilíbrio|meditação|yoga|calma|natureza|orgânico)/.test(content)) mood = "sereno";
  else if (/(game|meme|festa|diversão|criativo|arte|música|cultura)/.test(content)) mood = "divertido";
  else if (/(pare|chega|basta|nunca|verdade|mito|ninguém fala)/.test(content)) mood = "cru";

  const headlineLen = (variation.headline || "").length;
  const bodyLen = (variation.body || "").length;
  let energy: CreativeEnergy = "media";
  if (headlineLen <= 30 || mood === "urgente" || mood === "cru") energy = "alta";
  else if (bodyLen > 200) energy = "baixa";

  let formality: CreativeFormality = "neutro";
  const type = (variation as any).copyAngle?.type;
  if (type === "autoridade" || type === "objecao") formality = "formal";
  else if (mood === "divertido") formality = "casual";

  return { mood, energy, formality };
}

function fitsContent(fit: CreativeFamily["fit"], variation: PostVariation): boolean {
  if (fit.maxHeadlineChars && (variation.headline?.length || 0) > fit.maxHeadlineChars) return false;
  if (fit.minHeadlineChars && (variation.headline?.length || 0) < fit.minHeadlineChars) return false;
  const sectionsCount = variation.sections?.length || 0;
  const isStructured = Boolean(variation.template && variation.template !== "simple");
  const hasSectionsContent = sectionsCount >= 2 || isStructured;

  if (fit.needsSections) {
    if (!hasSectionsContent) return false;
  } else if (hasSectionsContent) {
    return false;
  }
  if (fit.needsNumber && !/\d/.test((variation.headline || "") + " " + (variation.body || ""))) return false;
  if (fit.needsImage && !variation.imageUrl && !variation.bgValue?.url) return false;
  return true;
}

export function creativeCellOf(family: CreativeFamily): string {
  const structureGroup =
    family.axes.composition === "grid" ? "grid" :
    family.axes.composition === "poster" || family.axes.composition === "split" ? "poster" :
    family.axes.composition === "centered-minimal" ? "centered" : "freeform";
  const voiceGroup =
    family.axes.typography === "display-brutal" || family.axes.typography === "mono-tech" ? "display" :
    family.axes.typography === "editorial-serif" ? "serif" : "clean";
  return `${structureGroup}:${voiceGroup}`;
}

export function cellTaken(f: CreativeFamily, excludeIds?: string[]): boolean {
  if (!excludeIds || excludeIds.length === 0) return false;
  const takenCells = excludeIds
    .map(id => FAMILIES.find(fam => fam.id === id))
    .filter(Boolean)
    .map(fam => creativeCellOf(fam!));
  return takenCells.includes(creativeCellOf(f));
}

function pickSeeded<T>(arr: T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)];
}

const TEMP_BY_MOOD: Record<CreativeMood, "warm" | "cool" | "neutral"> = {
  urgente: "warm", divertido: "warm", premium: "neutral", editorial: "neutral", sereno: "neutral", tech: "cool", cru: "cool"
};

function pickPalette(intent: CreativeIntent, variation: PostVariation, rand: () => number) {
  let candidates = PALETTES.filter(p => p.vibe.includes(intent.mood));
  if (candidates.length === 0) candidates = PALETTES.filter(p => p.temperature === TEMP_BY_MOOD[intent.mood]);
  if (candidates.length === 0) candidates = PALETTES;
  
  const palette = pickSeeded(candidates, rand);
  let inverted = false;
  if (palette.invertible && rand() < 0.35) {
    const dark = isDark(palette.colorA) ? palette.colorA : palette.colorB;
    const light = isDark(palette.colorA) ? palette.colorB : palette.colorA;
    if (contrastRatio(light, dark) >= 4.5) {
      inverted = true;
    }
  }
  return { id: palette.id, inverted };
}

export interface DirectCreativeOpts {
  excludeFamilyIds?: string[];
  recentFamilyIds?: string[];
  brandLocked?: boolean;
}

export function directCreative(variation: PostVariation, intent: CreativeIntent | null, seed: number, opts: DirectCreativeOpts = {}): CreativeDirection {
  const rand = mulberry32(seed);

  const resolvedIntent = isValidIntent(intent) ? intent : classifyIntentFromContent(variation);

  const eligible = FAMILIES.filter(f =>
    f.moods.includes(resolvedIntent.mood) &&
    fitsContent(f.fit, variation) &&
    !opts.excludeFamilyIds?.includes(f.id) &&
    !cellTaken(f, opts.excludeFamilyIds)
  );

  const fresh = eligible.filter(f => !opts.recentFamilyIds?.includes(f.id));
  const pool = fresh.length ? fresh : eligible;
  
  let family = pool.length ? pickSeeded(pool, rand) : null;
  if (!family) {
    const relaxMood = FAMILIES.filter(f => fitsContent(f.fit, variation) && !cellTaken(f, opts.excludeFamilyIds));
    family = relaxMood.length ? pickSeeded(relaxMood, rand) : null;
  }
  if (!family) {
    const relaxAll = FAMILIES.filter(f => fitsContent(f.fit, variation));
    family = relaxAll.length ? pickSeeded(relaxAll, rand) : null;
  }
  if (!family) {
    family = FAMILIES.find(f => f.id === "chromatic-block")!;
  }

  const palette = opts.brandLocked
    ? { id: "brand", inverted: false }
    : pickPalette(resolvedIntent, variation, rand);

  return {
    version: 1,
    familyId: family.id,
    paletteId: palette.id,
    paletteInverted: palette.inverted,
    seed,
    axes: family.axes,
    source: isValidIntent(intent) ? "llm-intent" : "classifier",
  };
}
