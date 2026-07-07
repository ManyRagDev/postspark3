import { PostVariation, DesignTokens } from "../postspark";
import { directCreative, DirectCreativeOpts } from "./directCreative";
import { PALETTES, paletteToDesignTokens } from "./palettes";
import { FAMILIES } from "./families";
import { ComposeContext, FamilyOutput } from "./types";
import { mulberry32, hashString } from "./seed";

export function composeVariation(
  variation: PostVariation, 
  brandTokens: DesignTokens,
  opts: DirectCreativeOpts = {}
): PostVariation {
  if (!variation.creativeDirection) {
    const seed = hashString(variation.id);
    variation.creativeDirection = directCreative(variation, (variation as any).creativeIntent || null, seed, opts);
  }

  const dir = variation.creativeDirection;

  const existingBg = variation.backgroundColor;
  const existingText = variation.textColor;
  const existingAccent = variation.accentColor;
  
  let paletteTokens: DesignTokens;
  if (dir.paletteId === "brand") {
    paletteTokens = brandTokens;
  } else {
    const palette = PALETTES.find(p => p.id === dir.paletteId) || PALETTES[0];
    paletteTokens = paletteToDesignTokens(palette, dir.paletteInverted);
  }

  const tokens: DesignTokens = {
    ...paletteTokens,
    colors: {
      ...paletteTokens.colors,
      background: existingBg || paletteTokens.colors.background,
      text: existingText || paletteTokens.colors.text,
      primary: existingAccent || paletteTokens.colors.primary,
    },
  };
  
  const family = FAMILIES.find(f => f.id === dir.familyId) || FAMILIES.find(f => f.id === "chromatic-block")!;
  
  const rand = mulberry32(dir.seed);
  const docWidth = 360;
  const docHeight = 360;

  const ctx: ComposeContext = {
    variation,
    tokens,
    rand,
    aspectRatio: "1:1",
    doc: { width: docWidth, height: docHeight },
    pxX: (pct) => (pct / 100) * docWidth,
    pxY: (pct) => (pct / 100) * docHeight,
  };
  
  const output: FamilyOutput = family.compose(ctx);
  
  const mergedTokens: DesignTokens = {
    ...tokens,
    structure: { ...tokens.structure, ...(output.structure || {}) },
    typography: { ...tokens.typography, ...(output.typography || {}) },
  };

  const composed: PostVariation = {
    ...variation,
    creativeDirection: dir,
    layout: output.layout || variation.layout || "minimal",
    template: output.template || variation.template || "simple",
    layoutSettings: (output.layoutSettings 
      ? { ...variation.layoutSettings, ...output.layoutSettings } 
      : variation.layoutSettings) as any,
    imageSettings: (output.imageSettings 
      ? { ...variation.imageSettings, ...output.imageSettings } 
      : variation.imageSettings) as any,
    bgOverlay: (output.bgOverlay 
      ? { ...variation.bgOverlay, ...output.bgOverlay }
      : variation.bgOverlay) as any,
    backgroundColor: existingBg || mergedTokens.colors.background,
    textColor: existingText || mergedTokens.colors.text,
    accentColor: existingAccent || mergedTokens.colors.primary,
    headlineFontFamily: output.headlineFontFamily || mergedTokens.typography.fontFamily,
    bodyFontFamily: output.bodyFontFamily || mergedTokens.typography.fontFamily,
    textElements: output.textElements || [],
    imageElements: output.imageElements || [],
    designTokens: mergedTokens,
  };
  
  if (output.headlineFontSize) composed.headlineFontSize = output.headlineFontSize;
  if (output.bodyFontSize) composed.bodyFontSize = output.bodyFontSize;
  if (output.headlineColor) composed.headlineColor = output.headlineColor;
  if (output.bodyColor) composed.bodyColor = output.bodyColor;
  if (output.splitImagePosition) composed.splitImagePosition = output.splitImagePosition;
  
  if (output.ornaments) {
    const cd = composed.creativeDirection!;
    if (!cd.hiddenOrnaments) {
      cd.hiddenOrnaments = {};
    }
    const ca = composed.copyAngle;
    if (ca) {
      if (output.ornaments.sticker === "hide" && ca.stickerText) {
        cd.hiddenOrnaments.stickerText = ca.stickerText;
        ca.stickerText = "";
      } else if (output.ornaments.sticker === "keep" && cd.hiddenOrnaments.stickerText) {
        ca.stickerText = cd.hiddenOrnaments.stickerText;
        delete cd.hiddenOrnaments.stickerText;
      }
      
      if (output.ornaments.badge === "hide" && ca.badge) {
        cd.hiddenOrnaments.badge = ca.badge;
        ca.badge = "";
      } else if (output.ornaments.badge === "keep" && cd.hiddenOrnaments.badge) {
        ca.badge = cd.hiddenOrnaments.badge;
        delete cd.hiddenOrnaments.badge;
      }
    }
  }

  return composed;
}
