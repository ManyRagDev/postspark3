import type { CanvasPostModel, CarouselSlideItem } from "../components/types";
import { applyContrastGuard, patchTouchesContrast } from "./contrast";

export const REPLICATION_GROUPS = ["background", "colors", "font", "headline", "body", "composition"] as const;
export type ReplicationGroup = typeof REPLICATION_GROUPS[number];
export type SlideStyle = NonNullable<CarouselSlideItem["visualStyle"]>;

const STYLE_KEYS = [
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

/** Copia SOMENTE os grupos escolhidos; conteúdo textual e elementos livres não são tocados. */
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
  const appearance = resolveSlideAppearance(post, sourceIndex);

  const slides = post.slides.map((slide, index) => {
    if (!targets.has(index)) return slide;
    let next = { ...slide };
    let style: SlideStyle = { ...slide.visualStyle };
    for (const group of groups) {
      if (group === "background") {
        next = {
          ...next,
          bgImage: source.bgImage ?? post.bgImage ?? "",
          bgPlacement: source.bgPlacement ?? post.bgPlacement,
          bgTransform: source.bgTransform ?? post.bgTransform,
          splitBgPosition: source.splitBgPosition ?? post.splitBgPosition,
        };
        continue;
      }
      for (const key of GROUP_STYLE_KEYS[group]) {
        Object.assign(style, { [key]: appearance[key] });
      }
      if (group === "headline") {
        style.palette = { ...(style.palette ?? resolveSlideAppearance(post, index).palette), headlineColor: appearance.palette.headlineColor };
      }
      if (group === "body") {
        style.palette = { ...(style.palette ?? resolveSlideAppearance(post, index).palette), subtextColor: appearance.palette.subtextColor };
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
    return { ...next, visualStyle: style };
  });
  return { ...post, slides };
}
