import { PostVariation, DesignTokens, CreativeDirection, AdvancedLayoutSettings, ImageSettings, BgOverlaySettings, AspectRatio } from "../postspark";
import { directCreative, DirectCreativeOpts } from "./directCreative";
import { PALETTES, paletteToDesignTokens } from "./palettes";
import { FAMILIES } from "./families";
import { ComposeContext, FamilyOutput } from "./types";
import { mulberry32, hashString } from "./seed";
import { aspectOf, type AspectRatioKey } from "./layoutArchetypes";

const RATIO_KEYS: AspectRatioKey[] = ["1:1", "5:6", "9:16"];

export function composeVariation(
  variation: PostVariation,
  brandTokens: DesignTokens,
  opts: DirectCreativeOpts = {}
): PostVariation {
  // SPEC-002 (docs/reforma/SPEC-002 passo 2): pura — nunca escreve em
  // `variation`. `creativeIntent` nunca é produzido em nenhum ponto ativo do
  // código (só era lido via `as any`); passar `null` direto é mais honesto
  // que fingir ler um campo que nada popula.
  const seed = hashString(variation.id);
  const dir: CreativeDirection = variation.creativeDirection
    ? { ...variation.creativeDirection, hiddenOrnaments: { ...variation.creativeDirection.hiddenOrnaments } }
    : directCreative(variation, null, seed, opts);

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
  // G4 fix: derive the canvas height from the variation's aspect ratio instead
  // of hardcoding 1:1 / 360x360. Decorative textElements (cd-*) are authored via
  // pxX/pxY in this doc space; when the doc height matched the real format,
  // they stop being misread against the wrong height by visualFitValidator.
  const requestedRatio = variation.aspectRatio ?? "1:1";
  const docWidth = 360;
  const ratioParts = requestedRatio.split(":").map(Number);
  const docHeight = ratioParts.length === 2 && ratioParts[0] && ratioParts[1]
    ? (docWidth * ratioParts[1]) / ratioParts[0]
    : docWidth;

  const ctx: ComposeContext = {
    variation,
    tokens,
    rand,
    aspectRatio: requestedRatio,
    doc: { width: docWidth, height: docHeight },
    pxX: (pct) => (pct / 100) * docWidth,
    pxY: (pct) => (pct / 100) * docHeight,
  };
  
  const output: FamilyOutput = family.compose(ctx);
  
  const mergedTokens: DesignTokens = {
    ...tokens,
    structure: { ...tokens.structure, ...(output.structure || {}) },
    typography: { ...tokens.typography, ...(output.typography || {}) },
    decorations: output.decorations ?? tokens.decorations,
  };

  // SPEC-002: layoutSettings/imageSettings/bgOverlay podem ficar parciais
  // aqui de propósito — a maioria das famílias só declara alguns campos
  // (headline/body, às vezes badge/accentBar). `normalizeLayoutSettings`
  // (shared/variationSnapshot.ts) sempre mescla com `DEFAULT_LAYOUT_SETTINGS`
  // antes de qualquer consumidor tratar isto como completo; por isso o cast
  // é para o tipo nomeado (documenta a garantia downstream), nunca `any`
  // (que também silenciaria erros de campo genuinamente errado).
  const composedLayoutSettings = (
    output.layoutSettings
      ? { ...variation.layoutSettings, ...output.layoutSettings }
      : variation.layoutSettings
  ) as AdvancedLayoutSettings | undefined;
  const composedImageSettings = (
    output.imageSettings
      ? { ...variation.imageSettings, ...output.imageSettings }
      : variation.imageSettings
  ) as ImageSettings | undefined;
  const composedBgOverlay = (
    output.bgOverlay
      ? { ...variation.bgOverlay, ...output.bgOverlay }
      : variation.bgOverlay
  ) as BgOverlaySettings | undefined;

  // copyAngle é clonado para que as mutações de hiddenOrnaments abaixo nunca
  // toquem o `variation` original recebido (pureza — SPEC-002 passo 2).
  const composed: PostVariation = {
    ...variation,
    creativeDirection: dir,
    copyAngle: variation.copyAngle ? { ...variation.copyAngle } : variation.copyAngle,
    layout: output.layout || variation.layout || "minimal",
    template: output.template || variation.template || "simple",
    layoutSettings: composedLayoutSettings,
    imageSettings: composedImageSettings,
    bgOverlay: composedBgOverlay,
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
  if (output.textColor) composed.textColor = output.textColor;
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

    if (output.ornaments.body === "hide" && composed.body) {
      cd.hiddenOrnaments.body = composed.body;
      composed.body = "";
    } else if (output.ornaments.body === "keep" && cd.hiddenOrnaments.body) {
      composed.body = cd.hiddenOrnaments.body;
      delete cd.hiddenOrnaments.body;
    }
  }

  // Rede de segurança para o fallback incondicional de directCreative.ts quando
  // o pool de famílias com fit.needsSections (versus, mosaic-grid) já foi
  // consumido pelos outros slots do mesmo post — fitsContent já evita isso no
  // caminho normal; isto garante o invariante mesmo se o pool esgotar.
  if (!family.fit.needsSections && (composed.sections?.length ?? 0) > 0) {
    composed.template = "simple";
    composed.sections = undefined;
  }

  // Invariante de geometria (SPEC-001): misturar headline absoluto com body em
  // fluxo é o modo de falha de sobreposição — o shell do bloco absoluto usa
  // `display: contents` e não reserva espaço, então o body flui por baixo dele.
  // Ou os dois têm geometria explícita, ou o body não existe no visual, ou o
  // template é estruturado (seções fluem por `sectionLayouts`, por contrato).
  const ls = composed.layoutSettings;
  const isStructured = (composed.template ?? "simple") !== "simple" && (composed.sections?.length ?? 0) > 0;
  if (
    !isStructured &&
    ls?.headline?.freePosition &&
    !ls?.body?.freePosition &&
    String(composed.body ?? "").trim().length > 0
  ) {
    throw new Error(
      `[compose] família "${dir.familyId}" declara headline com freePosition e body em fluxo com texto — ` +
        `declare bodyHeightPercent no arquétipo ou use ornaments.body: "hide".`,
    );
  }

  // Geometria por proporção: a família já calibra headline/body/sectionLayouts
  // por `ar` (HEADLINE_HEIGHT_PCT[classe][ar], BODY_HEIGHT_PCT.standard[ar]) —
  // faltava rodar o cálculo para as 3 proporções, não só a de composição. Sem
  // isso, `layoutSettingsByAspectRatio` nunca era populado e visualizar o post
  // numa proporção diferente da de composição reciclava geometria congelada
  // (headline calibrado para 1:1 usado num canvas 9:16, por exemplo).
  const compositionRatioKey = aspectOf(requestedRatio);
  const layoutSettingsByAspectRatio: Partial<Record<AspectRatio, AdvancedLayoutSettings>> = {};
  for (const ratioKey of RATIO_KEYS) {
    if (ratioKey === compositionRatioKey) {
      layoutSettingsByAspectRatio[ratioKey] = composed.layoutSettings as AdvancedLayoutSettings;
      continue;
    }
    const ratioDocHeight = (docWidth * Number(ratioKey.split(":")[1])) / Number(ratioKey.split(":")[0]);
    const ratioCtx: ComposeContext = {
      variation,
      tokens,
      // Seed FRESCA por chamada: a mesma sequência pseudoaleatória em cada
      // proporção, para que decorações não-geométricas (splitImagePosition,
      // rotação de sticker) saiam idênticas — só a geometria calibrada por
      // `ar` deve variar entre as 3 chamadas.
      rand: mulberry32(dir.seed),
      aspectRatio: ratioKey,
      doc: { width: docWidth, height: ratioDocHeight },
      pxX: (pct) => (pct / 100) * docWidth,
      pxY: (pct) => (pct / 100) * ratioDocHeight,
    };
    const ratioOutput = family.compose(ratioCtx);
    layoutSettingsByAspectRatio[ratioKey] = (
      ratioOutput.layoutSettings
        ? { ...variation.layoutSettings, ...ratioOutput.layoutSettings }
        : variation.layoutSettings
    ) as AdvancedLayoutSettings;
  }
  composed.layoutSettingsByAspectRatio = layoutSettingsByAspectRatio;

  return composed;
}
