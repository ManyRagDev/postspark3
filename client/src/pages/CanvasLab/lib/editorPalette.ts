import type { ArsenalComposition } from "@shared/designArsenal";
import type { CanvasPostPalette } from "../components/types";
import {
  overrideArsenalElement,
  setArsenalCustomBackground,
} from "./arsenalComposition";
import {
  getArsenalElementState,
  COMPOSITION_BACKGROUND_ID,
} from "./editorElementState";

/** An explicit palette action preserves manual fills and immutable raster artwork. */
export function applyArsenalPalette(
  source: ArsenalComposition,
  previous: CanvasPostPalette,
  palette: CanvasPostPalette
): { composition: ArsenalComposition; changed: boolean } {
  let composition = source,
    changed = false;
  const applied = { ...source.paletteAppliedFills };
  const keys = (["background", "text", "accent", "surface"] as const).filter(
    key => palette[key] !== undefined && palette[key] !== previous[key]
  );
  if (
    keys.includes("background") &&
    !getArsenalElementState(source, COMPOSITION_BACKGROUND_ID).locked
  ) {
    composition = setArsenalCustomBackground(composition, {
      fill: palette.background,
    });
    changed = true;
  }
  for (const element of source.elements) {
    if (
      getArsenalElementState(source, element.id).locked ||
      element.imageAssetId
    )
      continue;
    const manual = source.overrides[element.id]?.fill;
    if (
      manual !== undefined &&
      manual !== source.paletteAppliedFills?.[element.id]
    )
      continue;
    const content =
      element.kind === "text" &&
      element.fixedTextRole !== "ornament" &&
      (!!element.bindingId ||
        source.base.bindings.some(b => b.targetIds.includes(element.id)) ||
        (source.version === 3 &&
          source.authorialLayers.some(layer => layer.id === element.id)));
    const key =
      content && keys.includes("text")
        ? "text"
        : keys.find(key => element.fill === previous[key]);
    if (!key || !palette[key] || palette[key] === element.fill) continue;
    composition = overrideArsenalElement(composition, element.id, {
      fill: palette[key]!,
    });
    applied[element.id] = palette[key]!;
    changed = true;
  }
  return {
    composition: {
      ...composition,
      ...(Object.keys(applied).length ? { paletteAppliedFills: applied } : {}),
    },
    changed,
  };
}
