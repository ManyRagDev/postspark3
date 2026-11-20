import { readTextGradient } from "@shared/textGradient";
import type { CanvasPostModel, CarouselSlideItem, CanvasCustomText, CanvasCustomImage } from "../components/types";
import { applyContrastGuard, patchTouchesContrast } from "./contrast";
import { editArsenalContent, cloneArsenalComposition, setArsenalCustomBackground, overrideArsenalElement, setArsenalElementEffect } from "./arsenalComposition";
import { applyContentText, projectContentHeadline, canonicalContentSources } from "@shared/arsenalContent";
import { freshId } from "./documentCommands";
import { nativeTextAppearance } from "./nativeTextAppearance";
import { getEditorElementState, COMPOSITION_BACKGROUND_ID } from "./editorElementState";

export const REPLICATION_GROUPS = ["background", "colors", "font", "headline", "headlineText", "body", "composition"] as const;
export type ReplicationGroup = typeof REPLICATION_GROUPS[number];
export type SlideStyle = NonNullable<CarouselSlideItem["visualStyle"]>;

const STYLE_KEYS = [
  "showBadge", "badgeText", "showStep",
  "familyId", "familyName", "fontFamily", "customFontUrl", "palette",
  "overlayOpacity", "overlayColor", "overlayMode", "headlineAlign", "bodyAlign",
  "headlineSizeScale", "subtextSizeScale", "manualHeadlineColor", "manualSubtextColor",
  "headlineGradient", "subtextGradient", "headlineEffect", "headlineEffectColor", "subtextEffect", "subtextEffectColor",
  "subtextFontFamily", "headlineFontWeight", "subtextFontWeight",
  "headlineLineHeight", "subtextLineHeight", "headlineLetterSpacing", "subtextLetterSpacing",
] as const;

export function resolveSlideAppearance(post: CanvasPostModel, index: number): CanvasPostModel {
  const style = post.slides[index]?.visualStyle;
  if (!style) return post;
  return {
    ...post,
    ...style,
    headlineGradient: style.headlineGradient === undefined ? post.headlineGradient : style.headlineGradient,
    subtextGradient: style.subtextGradient === undefined ? post.subtextGradient : style.subtextGradient,
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

const GROUP_STYLE_KEYS: Record<Exclude<ReplicationGroup, "background" | "headlineText">, readonly (keyof SlideStyle)[]> = {
  colors: ["palette", "overlayOpacity", "overlayColor", "overlayMode"],
  font: ["fontFamily", "customFontUrl"],
  headline: ["headlineGradient", "headlineAlign", "headlineSizeScale", "headlineEffect", "headlineEffectColor", "manualHeadlineColor"],
  body: ["subtextGradient", "bodyAlign", "subtextSizeScale", "subtextEffect", "subtextEffectColor", "manualSubtextColor"],
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

function bindingsForTextRole(
  comp: NonNullable<CarouselSlideItem["composition"]>,
  role: "headline" | "body"
) {
  return comp.base.bindings.filter(b => b.kind === "text" && (
    comp.content.schemaVersion === 3
      ? canonicalContentSources(comp.content, b.source).some(source => comp.content.schemaVersion === 3 && comp.content.blocks.some(block => block.id === source.split(":")[1] && block.type === "text" && block.role === role))
      : role === "headline" ? b.source === "headline" : b.source === "body" || b.source === "subtext"
  ));
}

export function findArsenalTextElementsByRole(
  comp: NonNullable<CarouselSlideItem["composition"]>, role: "headline" | "body"
) {
  const bindings = bindingsForTextRole(comp, role);
  const boundTargetIds = new Set(bindings.flatMap(b => b.targetIds));
  const boundElements = comp.elements.filter(e => e.kind === "text" && (boundTargetIds.has(e.id) || Array.from(boundTargetIds).some(id => e.id.startsWith(id + "~")) || (e.bindingId && bindings.some(b => b.id === e.bindingId))));
  if (boundElements.length) return boundElements;

  const matches = comp.elements.filter(e =>
    e.kind === "text" && (
      role === "headline"
        ? e.id.toLowerCase().includes("headline") || e.id.toLowerCase().includes("title")
        : e.id.toLowerCase().includes("body") || e.id.toLowerCase().includes("subtext")
    )
  );
  return matches;
}

export function findArsenalTextElementByRole(comp: NonNullable<CarouselSlideItem["composition"]>, role: "headline" | "body") {
  return findArsenalTextElementsByRole(comp, role)[0];
}

const TEXT_STYLE_KEYS = ["fontFamily", "fontSize", "fontWeight", "fill", "align", "lineHeight", "letterSpacing"] as const;

/** Compare rendered values, not the mere creation of a new object or overrides. */
export function changedReplicationSlides(before: CanvasPostModel, after: CanvasPostModel, targets: readonly number[]): number[] {
  const signature = (post: CanvasPostModel, i: number) => {
    const slide = post.slides[i], view = resolveSlideAppearance(post, i);
    return JSON.stringify({ style: Object.fromEntries(STYLE_KEYS.map(key => [key, view[key]])),
      headline: slide.headline, subtext: slide.subtext, headlineRich: slide.headlineRich,
      bgImage: slide.bgImage ?? view.bgImage, bgPlacement: slide.bgPlacement ?? view.bgPlacement,
      bgTransform: slide.bgTransform ?? view.bgTransform, splitBgPosition: slide.splitBgPosition ?? view.splitBgPosition,
      composition: slide.composition && { elements: slide.composition.elements, groups: slide.composition.groups,
        artboard: slide.composition.artboard, ...(slide.composition.version === 3 ? { effects: slide.composition.effects, background: slide.composition.customBackground } : {}) },
    });
  };
  return Array.from(new Set(targets)).filter(i => before.slides[i] && after.slides[i] && signature(before, i) !== signature(after, i));
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

  for (const index of targetIndices) {
    if (!Number.isInteger(index) || index < 0 || index >= post.slides.length)
      issues.push({ targetIndex: index, group: groups[0] ?? "composition", reason: "Um slide de destino não existe mais." });
  }

  const targets = targetIndices.filter(index => index !== sourceIndex && index >= 0 && index < post.slides.length);
  if (targets.length === 0 || groups.length === 0) {
    return { ok: issues.length === 0, issues };
  }

  if (groups.includes("headlineText") && source.composition && !bindingsForTextRole(source.composition, "headline").length) {
    issues.push({ targetIndex: sourceIndex, group: "headlineText", reason: `Slide de origem ${sourceIndex + 1} não possui título vinculado que possa ser copiado.` });
  }

  for (const targetIndex of targets) {
    const target = post.slides[targetIndex];
    if (!target) continue;

    for (const group of groups) {
      const affectedIds = group === "font"
        ? target.composition ? target.composition.elements.filter(e => e.kind === "text" && e.bindingId).map(e => e.id) : ["headline", "subtext"]
        : group === "background" || group === "colors" ? [target.composition ? COMPOSITION_BACKGROUND_ID : "background"]
        : group === "composition" ? target.composition ? [...target.composition.elements, ...target.composition.groups].map(e => e.id) : ["headline", "subtext", "background"] : [];
      if (affectedIds.some(id => getEditorElementState(post, target.id, id).locked))
        issues.push({ targetIndex, group, reason: `Slide ${targetIndex + 1}: a operação afetaria um objeto bloqueado.` });
      if (group === "headline" || group === "body" || group === "headlineText") {
        const role = group === "body" ? "body" : "headline";
        const elements = target.composition ? findArsenalTextElementsByRole(target.composition, role) : [];
        const ids = target.composition ? elements.map(e => e.id) : [role === "headline" ? "headline" : "subtext"];
        if (ids.some(id => getEditorElementState(post, target.id, id).locked))
          issues.push({ targetIndex, group, reason: `Slide ${targetIndex + 1}: desbloqueie o texto de destino antes de aplicar.` });
        const sourceElements = source.composition ? findArsenalTextElementsByRole(source.composition, role) : [];
        if (source.composition && !sourceElements.length)
          issues.push({ targetIndex, group, reason: `A origem não possui texto correspondente ao papel ${role === "body" ? "corpo" : "título"}.` });
        if (group !== "headlineText" && new Set(sourceElements.map(e => JSON.stringify(TEXT_STYLE_KEYS.map(key => e[key])))).size > 1)
          issues.push({ targetIndex, group, reason: "A origem tem textos com estilos diferentes nesse papel. Selecione um objeto para copiar sua aparência." });
      }
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
      } else if (group === "headline" || group === "headlineText") {
        if (target.composition) {
          const headlineElem = findArsenalTextElementByRole(target.composition, "headline");
          const headlineBinding = bindingsForTextRole(target.composition, "headline").length > 0;
          if (!headlineElem || (group === "headlineText" && !headlineBinding)) {
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

      if (group === "headlineText") {
        const headline = sourceComp ? projectContentHeadline(sourceComp.content) : source.headline;
        next = { ...next, headline, headlineRich: undefined };
        if (targetComp) {
          targetComp = editArsenalContent(targetComp, applyContentText(targetComp.content, { headline }));
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
          style.subtextFontFamily = sourceComp ? findArsenalTextElementByRole(sourceComp, "body")?.fontFamily ?? fontName : nativeTextAppearance(appearance, source, "body").fontFamily;
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

      if (group === "headline" || group === "body") {
        const title = group === "headline", colorKey = title ? "headlineColor" : "subtextColor";
        const sourceElement = sourceComp && findArsenalTextElementByRole(sourceComp, group);
        const textStyle = sourceElement ?? nativeTextAppearance(appearance, source, group);
        const effect = sourceComp?.version === 3 && sourceElement ? sourceComp.effects[sourceElement.id] : undefined;
        const gradient = sourceComp ? (effect?.gradient !== undefined ? effect.gradient : (sourceComp.overrides[sourceElement!.id]?.fill ? null : sourceElement?.textGradient)) : (title ? appearance.headlineGradient : appearance.subtextGradient);
        const effectName = effect?.effect ?? (title ? appearance.headlineEffect : appearance.subtextEffect) ?? "none";
        const effectColor = effect?.color ?? (title ? appearance.headlineEffectColor : appearance.subtextEffectColor);
        style.palette = { ...(style.palette ?? resolveSlideAppearance(post, index).palette), [colorKey]: textStyle.fill };
        if (targetComp) {
          const unitScale = targetComp.artboard.width / (sourceComp?.artboard.width ?? 360);
          const asset = sourceComp?.assets.find(a => a.family === textStyle.fontFamily);
          if (asset && !targetComp.assets.some(a => a.id === asset.id)) targetComp.assets = [...targetComp.assets, asset];
          const patch: Record<string, string | number | boolean | null> = {};
          for (const key of TEXT_STYLE_KEYS) {
            const value = textStyle[key];
            if (value !== undefined && value !== null)
              patch[key] = (key === "fontSize" || key === "letterSpacing") && typeof value === "number" ? value * unitScale : value;
          }
          patch.fontAssetId = asset?.id ?? null;
          for (const targetElement of findArsenalTextElementsByRole(targetComp, group)) {
            targetComp = overrideArsenalElement(targetComp, targetElement.id, patch);
            if (gradient !== undefined || effectName !== "none" || (targetComp.version === 3 && targetComp.effects[targetElement.id]))
              targetComp = setArsenalElementEffect(targetComp, targetElement.id, { effect: effectName, ...(effectColor ? { color: effectColor } : {}), gradient: readTextGradient(gradient) ?? null });
          }
        } else {
          const targetView = resolveSlideAppearance(post, index);
          const current = nativeTextAppearance(targetView, slide, group);
          const scaleKey = title ? "headlineSizeScale" : "subtextSizeScale";
          Object.assign(style, {
            [title ? "fontFamily" : "subtextFontFamily"]: textStyle.fontFamily,
            [title ? "headlineFontWeight" : "subtextFontWeight"]: textStyle.fontWeight,
            [title ? "headlineAlign" : "bodyAlign"]: textStyle.align,
            [title ? "headlineLineHeight" : "subtextLineHeight"]: textStyle.lineHeight,
            [title ? "headlineLetterSpacing" : "subtextLetterSpacing"]: (textStyle.letterSpacing ?? 0) * (sourceComp ? 360 / sourceComp.artboard.width : 1),
            [title ? "headlineGradient" : "subtextGradient"]: readTextGradient(gradient) ?? null,
            [title ? "headlineEffect" : "subtextEffect"]: effectName,
            [title ? "headlineEffectColor" : "subtextEffectColor"]: effectColor,
            [title ? "manualHeadlineColor" : "manualSubtextColor"]: true,
            // Native-to-native keeps the requested relative appearance; catalogue text supplies px.
            [scaleKey]: sourceComp ? textStyle.fontSize * 360 / sourceComp.artboard.width / current.fontSize * (targetView[scaleKey] ?? 1) : appearance[scaleKey],
          });
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
