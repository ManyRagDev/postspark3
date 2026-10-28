import type { CanvasPostModel, CarouselSlideItem, CanvasCustomText, CanvasCustomImage } from "../components/types";
import { applyContrastGuard, patchTouchesContrast } from "./contrast";
import { editArsenalContent, cloneArsenalComposition, setArsenalCustomBackground, overrideArsenalElement } from "./arsenalComposition";
import { applyContentText } from "@shared/arsenalContent";
import { freshId } from "./documentCommands";

export const REPLICATION_GROUPS = ["background", "colors", "font", "headline", "body", "composition"] as const;
export type ReplicationGroup = typeof REPLICATION_GROUPS[number];
export type SlideStyle = NonNullable<CarouselSlideItem["visualStyle"]>;

const STYLE_KEYS = [
  "showBadge", "badgeText", "showStep",
  "familyId", "familyName", "fontFamily", "customFontUrl", "palette",
  "overlayOpacity", "overlayColor", "overlayMode", "headlineAlign", "bodyAlign",
  "headlineSizeScale", "subtextSizeScale", "manualHeadlineColor", "manualSubtextColor",
  "headlineEffect", "headlineEffectColor", "subtextEffect", "subtextEffectColor",
] as const;

export function resolveSlideAppearance(post: CanvasPostModel, index: number): CanvasPostModel {
  const style = post.slides[index]?.visualStyle;
  if (!style) return post;
  return {
    ...post,
    ...style,
    palette: style.palette ? { ...post.palette, ...style.palette } : post.palette,
  };
}

/** Atualizações dos controles de aparência passam a afetar somente o slide ativo. */
export function applyCurrentSlideAppearancePatch(
  post: CanvasPostModel,
  patch: Partial<CanvasPostModel>,
): CanvasPostModel {
  const stylePatch: SlideStyle = {};
  const remainder: Partial<CanvasPostModel> = { ...patch };
  for (const key of STYLE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      Object.assign(stylePatch, { [key]: patch[key] });
      delete remainder[key];
    }
  }
  const base = { ...post, ...remainder };
  if (Object.keys(stylePatch).length === 0) return base;

  const index = base.currentSlideIndex;
  const active = base.slides[index];
  if (!active) return { ...base, ...stylePatch };

  const effective = resolveSlideAppearance(base, index);
  const nextEffective = { ...effective, ...stylePatch } as CanvasPostModel;
  const guarded = patchTouchesContrast(effective, stylePatch)
    ? applyContrastGuard(nextEffective)
    : nextEffective;
  const nextStyle: SlideStyle = {
    ...active.visualStyle,
    ...stylePatch,
    ...(guarded.palette !== nextEffective.palette ? { palette: guarded.palette } : {}),
  };
  const slides = [...base.slides];
  slides[index] = { ...active, visualStyle: nextStyle };

  // Com um único slide, mantenha a projeção raiz compatível com consumidores legados.
  return base.slides.length === 1
    ? { ...base, ...stylePatch, palette: guarded.palette, slides }
    : { ...base, slides };
}

const GROUP_STYLE_KEYS: Record<Exclude<ReplicationGroup, "background">, readonly (keyof SlideStyle)[]> = {
  colors: ["palette", "overlayOpacity", "overlayColor", "overlayMode"],
  font: ["fontFamily", "customFontUrl"],
  headline: ["headlineAlign", "headlineSizeScale", "headlineEffect", "headlineEffectColor", "manualHeadlineColor"],
  body: ["bodyAlign", "subtextSizeScale", "subtextEffect", "subtextEffectColor", "manualSubtextColor"],
  composition: ["familyId", "familyName"],
};

export interface ReplicationValidationIssue {
  targetIndex: number;
  group: ReplicationGroup;
  reason: string;
}

export interface ReplicationValidationResult {
  ok: boolean;
  issues: ReplicationValidationIssue[];
}

export function findArsenalTextElementByRole(
  comp: NonNullable<CarouselSlideItem["composition"]>,
  role: "headline" | "body"
) {
  const bindings = comp.base.bindings.filter(b => {
    if (role === "headline") {
      return b.source === "headline" || b.source.includes("headline");
    }
    return b.source === "body" || b.source.includes("body") || b.source === "subtext" || b.source.includes("subtext");
  });
  const boundTargetIds = new Set(bindings.flatMap(b => b.targetIds));
  const boundElement = comp.elements.find(e => boundTargetIds.has(e.id) || (e.bindingId && bindings.some(b => b.id === e.bindingId)));
  if (boundElement) return boundElement;

  const match = comp.elements.find(e =>
    e.kind === "text" && (
      role === "headline"
        ? e.id.toLowerCase().includes("headline") || e.id.toLowerCase().includes("title")
        : e.id.toLowerCase().includes("body") || e.id.toLowerCase().includes("subtext")
    )
  );
  if (match) return match;

  if (comp.version === 3) {
    const layer = comp.authorialLayers.find(l =>
      l.kind === "text" && (
        role === "headline"
          ? l.id.toLowerCase().includes("headline") || l.id.toLowerCase().includes("title")
          : l.id.toLowerCase().includes("body") || l.id.toLowerCase().includes("subtext")
      )
    );
    if (layer) return comp.elements.find(e => e.id === layer.id);
  }
  return undefined;
}

export function getEffectiveSourceFont(source: CarouselSlideItem, post: CanvasPostModel): string {
  if (source.composition) {
    const headlineElem = findArsenalTextElementByRole(source.composition, "headline");
    if (headlineElem?.fontFamily) return headlineElem.fontFamily;
    const firstText = source.composition.elements.find(e => e.kind === "text" && e.fontFamily);
    if (firstText?.fontFamily) return firstText.fontFamily;
  }
  return source.visualStyle?.fontFamily || post.fontFamily || "";
}

/** Preflight de validação: verifica compatibilidade semântica de todos os destinos e grupos. */
export function validateReplication(
  post: CanvasPostModel,
  sourceIndex: number,
  targetIndices: readonly number[],
  groups: readonly ReplicationGroup[],
): ReplicationValidationResult {
  const issues: ReplicationValidationIssue[] = [];
  const source = post.slides[sourceIndex];
  if (!source) {
    return {
      ok: false,
      issues: [{ targetIndex: -1, group: groups[0] || "composition", reason: "Slide de origem não encontrado" }],
    };
  }

  const targets = targetIndices.filter(index => index !== sourceIndex && index >= 0 && index < post.slides.length);
  if (targets.length === 0 || groups.length === 0) {
    return { ok: true, issues: [] };
  }

  for (const targetIndex of targets) {
    const target = post.slides[targetIndex];
    if (!target) continue;

    for (const group of groups) {
      if (group === "background") {
        const sourceCompBg = source.composition?.version === 3 ? source.composition.customBackground : undefined;
        const sourceHasBg = Boolean(
          source.bgImage ||
          sourceCompBg?.imageUrl ||
          sourceCompBg?.fill ||
          post.bgImage ||
          source.visualStyle?.palette?.background ||
          post.palette.background
        );
        if (!sourceHasBg) {
          issues.push({
            targetIndex,
            group: "background",
            reason: `Slide de origem ${sourceIndex + 1} não possui plano de fundo representável.`,
          });
        }
      } else if (group === "headline") {
        if (target.composition) {
          const headlineElem = findArsenalTextElementByRole(target.composition, "headline");
          if (!headlineElem) {
            issues.push({
              targetIndex,
              group: "headline",
              reason: `Slide de destino ${targetIndex + 1} não possui elemento de título correspondente.`,
            });
          }
        }
      } else if (group === "body") {
        if (target.composition) {
          const bodyElem = findArsenalTextElementByRole(target.composition, "body");
          if (!bodyElem) {
            issues.push({
              targetIndex,
              group: "body",
              reason: `Slide de destino ${targetIndex + 1} não possui elemento de corpo correspondente.`,
            });
          }
        }
      } else if (group === "composition") {
        if (!source.composition && !source.guidedComposition && !source.visualStyle?.familyId && !post.familyId) {
          issues.push({
            targetIndex,
            group: "composition",
            reason: `Slide de origem ${sourceIndex + 1} não possui composição visual representável.`,
          });
        }
      } else if (group === "font") {
        const sourceFont = getEffectiveSourceFont(source, post);
        if (!sourceFont || typeof sourceFont !== "string" || !sourceFont.trim()) {
          issues.push({
            targetIndex,
            group: "font",
            reason: `Slide de origem ${sourceIndex + 1} não possui fonte válida.`,
          });
        }
      }
    }
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

/** Copia SOMENTE os grupos escolhidos; aborta totalmente se qualquer destino for incompatível. */
export function replicateSlideAppearance(
  post: CanvasPostModel,
  sourceIndex: number,
  targetIndices: readonly number[],
  groups: readonly ReplicationGroup[],
): CanvasPostModel {
  const source = post.slides[sourceIndex];
  if (!source || groups.length === 0) return post;
  const targets = new Set(targetIndices.filter(index => index !== sourceIndex && index >= 0 && index < post.slides.length));
  if (targets.size === 0) return post;

  // Preflight check: se qualquer destino falhar, aborta sem aplicação parcial (D-01 / AC-003-03)
  const validation = validateReplication(post, sourceIndex, targetIndices, groups);
  if (!validation.ok) return post;

  const appearance = resolveSlideAppearance(post, sourceIndex);
  const sourceComp = source.composition;

  const slides = post.slides.map((slide, index) => {
    if (!targets.has(index)) return slide;
    let next = { ...slide };
    let style: SlideStyle = { ...slide.visualStyle };
    let targetComp = slide.composition ? structuredClone(slide.composition) : undefined;

    for (const group of groups) {
      if (group === "background") {
        const sourceCompBg = sourceComp?.version === 3 ? sourceComp.customBackground : undefined;
        const effectiveBgImage = sourceCompBg?.imageUrl || source.bgImage || post.bgImage || "";
        next = {
          ...next,
          bgImage: effectiveBgImage,
          bgPlacement: source.bgPlacement ?? post.bgPlacement,
          bgTransform: source.bgTransform ?? post.bgTransform,
          splitBgPosition: source.splitBgPosition ?? post.splitBgPosition,
        };
        if (targetComp) {
          const bgFill = sourceCompBg?.fill || appearance.palette.background;
          const bgOverlayOpacity = sourceCompBg?.overlayOpacity ?? appearance.overlayOpacity ?? 0;
          const bgOverlayColor = sourceCompBg?.overlayColor ?? appearance.overlayColor;
          const bgOverlayMode = sourceCompBg?.overlayMode ?? appearance.overlayMode;
          targetComp = setArsenalCustomBackground(targetComp, {
            imageUrl: effectiveBgImage || undefined,
            fill: bgFill,
            overlayOpacity: bgOverlayOpacity,
            overlayColor: bgOverlayColor,
            overlayMode: bgOverlayMode,
          });
        }
        continue;
      }

      for (const key of GROUP_STYLE_KEYS[group]) {
        Object.assign(style, { [key]: appearance[key] });
      }

      if (group === "font") {
        const fontName = getEffectiveSourceFont(source, post);
        if (fontName) {
          style.fontFamily = fontName;
          if (targetComp) {
            const sourceHeadlineElem = sourceComp ? findArsenalTextElementByRole(sourceComp, "headline") : undefined;
            const sourceBodyElem = sourceComp ? findArsenalTextElementByRole(sourceComp, "body") : undefined;
            const headlineFont = sourceHeadlineElem?.fontFamily || fontName;
            const bodyFont = sourceBodyElem?.fontFamily || headlineFont;

            const targetHeadlineElem = findArsenalTextElementByRole(targetComp, "headline");
            const targetBodyElem = findArsenalTextElementByRole(targetComp, "body");

            for (const f of [headlineFont, bodyFont]) {
              const matchingAsset = sourceComp?.assets?.find(a => a.family === f);
              if (matchingAsset && !targetComp.assets.some(a => a.id === matchingAsset.id)) {
                targetComp.assets = [...targetComp.assets, matchingAsset];
              }
            }

            // Mapeamento esparso estrito por binding (BUG-CL-025 / C04-R4 / C05):
            // Apenas os alvos representáveis identificados por binding estrutural recebem alteração.
            // Camadas autorais extras e textos sem binding retêm sua fonte original.
            const headlineTargetIds = new Set<string>();
            const bodyTargetIds = new Set<string>();

            for (const el of targetComp.elements) {
              if (el.kind !== "text") continue;
              const binding = targetComp.base.bindings.find(b =>
                (el.bindingId && b.id === el.bindingId) ||
                b.targetIds.includes(el.id) ||
                b.targetIds.some(tId => el.id.startsWith(tId + "~"))
              );
              if (binding) {
                const isHeadline = binding.source === "headline" || binding.source.includes("headline") || binding.source === "title";
                if (isHeadline) {
                  headlineTargetIds.add(el.id);
                } else {
                  bodyTargetIds.add(el.id);
                }
              }
            }
            if (targetHeadlineElem) headlineTargetIds.add(targetHeadlineElem.id);
            if (targetBodyElem) bodyTargetIds.add(targetBodyElem.id);

            for (const targetId of Array.from(headlineTargetIds)) {
              const matchingAsset = sourceComp?.assets?.find(a => a.family === headlineFont);
              targetComp = overrideArsenalElement(targetComp, targetId, {
                fontFamily: headlineFont,
                fontAssetId: matchingAsset ? matchingAsset.id : null,
              });
            }

            for (const targetId of Array.from(bodyTargetIds)) {
              if (headlineTargetIds.has(targetId)) continue;
              const matchingAsset = sourceComp?.assets?.find(a => a.family === bodyFont);
              targetComp = overrideArsenalElement(targetComp, targetId, {
                fontFamily: bodyFont,
                fontAssetId: matchingAsset ? matchingAsset.id : null,
              });
            }
          }
        }
      }

      if (group === "headline") {
        style.palette = { ...(style.palette ?? resolveSlideAppearance(post, index).palette), headlineColor: appearance.palette.headlineColor };
        if (targetComp) {
          const headlineElem = findArsenalTextElementByRole(targetComp, "headline");
          if (headlineElem) {
            const hColor = appearance.palette.headlineColor;
            targetComp.elements = targetComp.elements.map(el =>
              el.id === headlineElem.id
                ? {
                    ...el,
                    fill: hColor ?? el.fill,
                    align: appearance.headlineAlign ?? el.align,
                  }
                : el
            );
            if (targetComp.version === 3 && targetComp.authorialLayers) {
              targetComp.authorialLayers = targetComp.authorialLayers.map(l =>
                l.id === headlineElem.id
                  ? {
                      ...l,
                      fill: hColor ?? (l as any).fill,
                      align: appearance.headlineAlign ?? (l as any).align,
                    }
                  : l
              );
            }
          }
        }
      }

      if (group === "body") {
        style.palette = { ...(style.palette ?? resolveSlideAppearance(post, index).palette), subtextColor: appearance.palette.subtextColor };
        if (targetComp) {
          const bodyElem = findArsenalTextElementByRole(targetComp, "body");
          if (bodyElem) {
            const bColor = appearance.palette.subtextColor;
            targetComp.elements = targetComp.elements.map(el =>
              el.id === bodyElem.id
                ? {
                    ...el,
                    fill: bColor ?? el.fill,
                    align: appearance.bodyAlign ?? el.align,
                  }
                : el
            );
            if (targetComp.version === 3 && targetComp.authorialLayers) {
              targetComp.authorialLayers = targetComp.authorialLayers.map(l =>
                l.id === bodyElem.id
                  ? {
                      ...l,
                      fill: bColor ?? (l as any).fill,
                      align: appearance.bodyAlign ?? (l as any).align,
                    }
                  : l
              );
            }
          }
        }
      }
    }

    // Cores globais e cores de título/corpo podem ser selecionadas separadamente.
    if (groups.includes("colors")) {
      const targetPalette = resolveSlideAppearance(post, index).palette;
      style.palette = {
        ...appearance.palette,
        ...(!groups.includes("headline") ? { headlineColor: targetPalette.headlineColor } : {}),
        ...(!groups.includes("body") ? { subtextColor: targetPalette.subtextColor } : {}),
      };
      if (targetComp) {
        const bgFill = appearance.palette.background;
        targetComp = {
          ...targetComp,
          artboard: {
            ...targetComp.artboard,
            background: bgFill ?? targetComp.artboard.background,
          },
        };
      }
    }

    if (groups.some(group => group === "colors" || group === "composition" || group === "headline" || group === "body")) {
      const targetAppearance = resolveSlideAppearance(post, index);
      const guarded = applyContrastGuard({
        ...targetAppearance,
        ...style,
        palette: { ...targetAppearance.palette, ...style.palette },
      });
      style.palette = guarded.palette;
    }

    return {
      ...next,
      visualStyle: style,
      ...(targetComp ? { composition: targetComp } : {}),
    };
  });

  return { ...post, slides };
}

export function replicateCarouselComposition(
  post: CanvasPostModel,
  sourceIndex: number,
  targetIndices: readonly number[]
): CanvasPostModel {
  const sourceSlide = post.slides[sourceIndex];
  const sourceComp = sourceSlide?.composition;
  if (!sourceComp) return post;

  const targets = new Set(
    targetIndices.filter(
      index => index !== sourceIndex && index >= 0 && index < post.slides.length
    )
  );
  if (targets.size === 0) return post;

  const slides = post.slides.map((targetSlide, index) => {
    if (!targets.has(index)) return targetSlide;
    let targetComp = structuredClone(sourceComp);
    targetComp = editArsenalContent(
      targetComp,
      applyContentText(targetComp.content, {
        headline: targetSlide.headline || undefined,
        subtext: targetSlide.subtext || undefined,
      })
    );
    const { composition: clonedComp } = cloneArsenalComposition(targetComp, freshId);

    const authorialExtraTexts: CanvasCustomText[] =
      clonedComp.version === 3
        ? clonedComp.authorialLayers
            .filter((l) => l.kind === "text")
            .map((l) => ({
              id: l.id,
              text: l.text ?? "",
              x: l.x,
              y: l.y,
              width: l.width,
              fontSize: l.fontSize,
              fontFamily: l.fontFamily,
              color: l.fill,
              align: l.align ?? "left",
              rotation: l.rotation,
            }))
        : [];

    const authorialExtraImages: CanvasCustomImage[] =
      clonedComp.version === 3
        ? clonedComp.authorialLayers
            .filter((l) => l.kind === "image")
            .map((l) => ({
              id: l.id,
              url: l.url || "",
              x: l.x,
              y: l.y,
              width: l.width,
              height: l.height,
              rotation: l.rotation,
              opacity: l.opacity ?? 1,
              cornerRadius: l.cornerRadius ?? 0,
            }))
        : [];

    const bgImage =
      clonedComp.version === 3 && clonedComp.customBackground?.imageUrl
        ? clonedComp.customBackground.imageUrl
        : targetSlide.bgImage;

    return {
      ...targetSlide,
      composition: clonedComp,
      extraTexts: authorialExtraTexts,
      extraImages: authorialExtraImages,
      bgImage: bgImage ?? "",
    };
  });

  return { ...post, slides };
}
