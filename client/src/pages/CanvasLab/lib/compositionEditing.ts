import type { CanvasPostModel } from "../components/types";
import type { ArsenalComposition } from "@shared/designArsenal";
import { applyContentText } from "@shared/arsenalContent";
import {
  editArsenalContent,
  setArsenalCustomBackground,
  setArsenalLogo,
  arsenalWorldGeometry,
  overrideArsenalElement,
  updateArsenalAuthorialLayer,
  putArsenalComposition,
  addArsenalUserFont,
} from "./arsenalComposition";

/** Bridge slide-scoped UI commands to the authoritative composition. */
export function applyCompositionAppearancePatch(
  post: CanvasPostModel,
  patch: Partial<CanvasPostModel>
): ArsenalComposition | undefined {
  const slide = post.slides[post.currentSlideIndex];
  let c = slide?.composition;
  if (!c) return;
  const changedSlide = patch.slides?.[post.currentSlideIndex];
  const value = <K extends keyof CanvasPostModel>(key: K) => patch[key];
  if (patch.userFonts) for (const font of patch.userFonts) c = addArsenalUserFont(c, font);
  const headline = patch.headline ?? changedSlide?.headline;
  const subtext = patch.subtext ?? changedSlide?.subtext;
  if (
    (headline !== undefined && headline !== slide.headline) ||
    (subtext !== undefined && subtext !== slide.subtext)
  ) {
    c = editArsenalContent(
      c,
      applyContentText(c.content, {
        ...(headline !== undefined && headline !== slide.headline
          ? { headline }
          : {}),
        ...(subtext !== undefined && subtext !== slide.subtext
          ? { subtext }
          : {}),
      })
    );
  }
  const imageChanged =
    Object.hasOwn(patch, "bgImage") ||
    (changedSlide && changedSlide.bgImage !== slide.bgImage);
  if (imageChanged)
    c = setArsenalCustomBackground(c, {
      imageUrl:
        (Object.hasOwn(patch, "bgImage")
          ? patch.bgImage
          : changedSlide?.bgImage) || undefined,
      overlayOpacity:
        c.version === 3 ? (c.customBackground?.overlayOpacity ?? 0) : 0,
    });
  if (
    patch.palette?.background &&
    patch.palette.background !== post.palette.background
  )
    c = setArsenalCustomBackground(c, { fill: patch.palette.background });
  if (
    patch.overlayOpacity !== undefined ||
    patch.overlayColor !== undefined ||
    patch.overlayMode !== undefined
  )
    c = setArsenalCustomBackground(c, {
      ...(value("overlayOpacity") !== undefined
        ? { overlayOpacity: patch.overlayOpacity }
        : {}),
      ...(patch.overlayColor !== undefined
        ? { overlayColor: patch.overlayColor }
        : {}),
      ...(patch.overlayMode !== undefined
        ? { overlayMode: patch.overlayMode }
        : {}),
    });
  if (Object.hasOwn(patch, "logoUrl"))
    c = setArsenalLogo(
      c,
      patch.logoUrl
        ? {
            ...(c.version === 3 ? c.logo : undefined),
            url: patch.logoUrl,
            position: patch.logoPosition ?? "top-right",
          }
        : undefined
    );
  if (patch.logoPosition && c.version === 3 && c.logo)
    c = setArsenalLogo(c, { ...c.logo, position: patch.logoPosition });
  return c;
}

/** Moving a layer into a group preserves its visible world position and size. */
export function reparentArsenalElement(
  c: ArsenalComposition,
  id: string,
  parentId: string | null
) {
  const element = c.elements.find(e => e.id === id);
  if (!element || element.parentId === parentId || c.version !== 3 || !c.authorialLayers.some(l => l.id === id)) return c;
  const parent = parentId ? c.groups.find(g => g.id === parentId) : null;
  if (parentId && !parent) return c;
  const world = arsenalWorldGeometry(element, c.groups);
  const origin = parent
    ? arsenalWorldGeometry(parent, c.groups)
    : { x: 0, y: 0, rotation: 0, scale: 1 };
  const scale = origin.scale * (parent?.scale ?? 1);
  const angle = (-origin.rotation * Math.PI) / 180;
  const dx = world.x - origin.x,
    dy = world.y - origin.y;
  return updateArsenalAuthorialLayer(c, id, {
    parentId,
    x: (dx * Math.cos(angle) - dy * Math.sin(angle)) / scale,
    y: (dx * Math.sin(angle) + dy * Math.cos(angle)) / scale,
    rotation: world.rotation - origin.rotation,
    width: (element.width * world.scale) / scale,
    height: (element.height * world.scale) / scale,
    fontSize: (element.fontSize * world.scale) / scale,
    zIndex:
      Math.max(
        0,
        ...[...c.elements, ...c.groups]
          .filter(e => e.parentId === parentId)
          .map(e => e.zIndex)
      ) + 1,
  });
}

export function shouldDeleteCanvasSelection(
  event: Pick<
    KeyboardEvent,
    "key" | "ctrlKey" | "metaKey" | "altKey" | "isComposing"
  >,
  target: HTMLElement | null
) {
  return (
    ["Delete", "Backspace"].includes(event.key) &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !event.isComposing &&
    !target?.closest(
      "input, textarea, select, [contenteditable=true], [role=dialog]"
    )
  );
}

/** Shared preview and commit path for guided generation and file uploads. */
export function applyCompositionBackgroundImage(
  post: CanvasPostModel,
  imageUrl?: string
): CanvasPostModel {
  const c = post.slides[post.currentSlideIndex]?.composition;
  if (!c) return post;
  return putArsenalComposition(
    post,
    setArsenalCustomBackground(c, {
      imageUrl,
      overlayOpacity:
        c.version === 3 ? (c.customBackground?.overlayOpacity ?? 0) : 0,
    })
  );
}
