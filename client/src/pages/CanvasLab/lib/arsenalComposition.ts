import { aspectRatioHeight } from "@shared/aspectRatios";
import type { CanvasCustomText, CanvasCustomImage } from "../components/types";
import { buildArsenalFallback } from "./arsenalFallback";
import { resolveArsenalGeometry, auditArsenalGeometry as auditSharedArsenalGeometry, arsenalWorldGeometry } from "@shared/arsenalGeometry";
import {
  arsenalCanonicalJson,
  arsenalHash,
  projectContentBody,
  readContentSource,
  contentCoverageIssues,
  projectContentHeadline,
  setContentSource,
  type DesignContent,
} from "@shared/arsenalContent";
import {
  arsenalCompositionSchema,
  orderArsenalRelations,
  type ArsenalComposition,
  type ArsenalCompositionV2,
  type ArsenalCompositionV3,
  type ArsenalAuthorialLayer,
  type ArsenalCustomBackground,
  type ArsenalLogo,
  type ArsenalUserFont,
  type ArsenalElementEffect,
  type ArsenalElement,
  type ArsenalGroup,
} from "@shared/designArsenal";
import { INITIAL_POST, type CanvasPostModel, type CanvasRichTextChunk } from "../components/types";
import { layoutRichText } from "./richTextLayout";

export function arsenalTextLayout(e: ArsenalElement) {
  return layoutRichText({
    text: e.text,
    richText: e.richText,
    width: e.width,
    fontSize: e.fontSize,
    fontFamily: e.fontFamily,
    fontStyle: String(e.fontWeight),
    fill: e.fill,
    align: e.align,
    lineHeight: e.lineHeight,
    letterSpacing: e.letterSpacing,
    wordBreak: "word",
  });
}
const sorted = <T extends { id: string; zIndex: number }>(rows: T[]) =>
  [...rows].sort((a, b) => a.zIndex - b.zIndex || a.id.localeCompare(b.id));
export const orderedArsenalNodes = (
  c: ArsenalComposition,
  parentId: string | null
) => sorted([...c.elements, ...c.groups].filter(n => n.parentId === parentId));

/** Group origins are explicit; this is also used by selection bounds and the inspector. */
export { arsenalWorldGeometry } from "@shared/arsenalGeometry";
export function resolveArsenalComposition(source: ArsenalComposition, allowReduction = false): ArsenalComposition {
  return resolveArsenalGeometry(source, { measureText: layoutRichText, allowReduction });
}

export function editArsenalContent(
  c: ArsenalComposition,
  content: DesignContent
): ArsenalComposition {
  if (arsenalCanonicalJson(c.content) === arsenalCanonicalJson(content))
    return c;
  // Only the private editorial fallback regenerates structural bindings; immutable catalogue bases remain pinned.
  let updated = c;
  if (
    c.base.variantKey.startsWith("fallback-") &&
    c.origin.versionId === "00000000-0000-4000-8000-000000000001"
  ) {
    const { base, pieces } = buildArsenalFallback(content, c.base.aspectRatio, {
      background: c.artboard.background,
      text: c.elements.find(e => e.kind === "text")?.fill ?? "#111111",
    });
    // Keep authored sizes/pieces for surviving IDs: typing never shrinks the font.
    for (const i of base.instances) {
      const previous = c.base.instances.find(old => old.id === i.id);
      if (previous) {
        i.pieceHash = previous.pieceHash;
        pieces[previous.pieceHash] = c.pieces[previous.pieceHash];
        const fit = base.relations.find(r => r.id === `fit-${i.id}`);
        if (fit?.kind === "textFit")
          fit.parameters.minFontSize = c.pieces[previous.pieceHash].fontSize;
      }
    }
    updated = {
      ...c,
      base,
      pieces,
      relations: base.relations.map(r => ({
        ...r,
        enabled: c.relations.find(old => old.id === r.id)?.enabled ?? true,
      })),
      origin: {
        ...c.origin,
        compilerVersion: base.compilerVersion,
        variantKey: base.variantKey,
        candidateId: `${c.origin.versionId}:${base.variantKey}`,
        variantHash: arsenalHash(base),
        definitionHash: arsenalHash(base),
      },
    };
  }
  return resolveArsenalComposition({
    ...updated,
    content,
    contentRevision: c.contentRevision + 1,
  });
}
export function editArsenalElementText(
  c: ArsenalComposition,
  id: string,
  text: string,
  chunks?: CanvasRichTextChunk[]
): ArsenalComposition {
  const element = c.elements.find(e => e.id === id),
    binding = c.base.bindings.find(b => b.id === element?.bindingId);
  if (!element) return c;
  const content = structuredClone(c.content),
    richText = { ...c.richText, [id]: chunks ?? [] };
  if (binding) {
    if (binding.source !== "media.primary") {
      let textToSet = text;
      if (binding.prefix && textToSet.startsWith(binding.prefix)) {
        textToSet = textToSet.slice(binding.prefix.length);
      }
      if (binding.targetIds.length > 1) {
        const siblings = binding.targetIds.map(tid => c.elements.find(e => e.id === tid)).filter(Boolean) as ArsenalElement[];
        if (siblings.length > 1) {
          textToSet = siblings.map(s => s.id === id ? text : s.text).join(" ");
        }
      }
      setContentSource(content, binding.source, textToSet, element.itemId);
    }
    const next = editArsenalContent({ ...c, richText }, content);
    return resolveArsenalComposition({
      ...next,
      overrides: { ...next.overrides, [id]: { ...next.overrides[id], text } },
    });
  }
  if (c.version === 3 && c.authorialLayers.some(l => l.id === id)) {
    const authorialLayers = c.authorialLayers.map(l =>
      l.id === id ? { ...l, text, richText: chunks ?? l.richText } : l
    );
    return resolveArsenalComposition({
      ...c,
      richText,
      authorialLayers,
      overrides: { ...c.overrides, [id]: { ...c.overrides[id], text } },
    });
  }
  return resolveArsenalComposition({
    ...c,
    richText,
    overrides: { ...c.overrides, [id]: { ...c.overrides[id], text } },
  });
}

export function overrideArsenalElement(
  c: ArsenalComposition,
  id: string,
  patch: Record<string, string | number | boolean | null>
): ArsenalComposition {
  const current =
    c.elements.find(e => e.id === id) ?? c.groups.find(e => e.id === id);
  if (!current) return c;
  const relations = c.relations
    .map(r => ({
      ...r,
      outputs: r.outputs
        .map(o =>
          o.targetId === id
            ? { ...o, properties: o.properties.filter(p => !(p in patch)) }
            : o
        )
        .filter(o => o.properties.length),
    }))
    .map(r =>
      r.outputs.length
        ? r
        : {
            ...r,
            enabled: false,
            outputs: c.relations.find(original => original.id === r.id)!
              .outputs,
          }
    ) as ArsenalComposition["relations"];
  let authorialLayers = c.version === 3 ? c.authorialLayers : undefined;
  if (authorialLayers && authorialLayers.some(l => l.id === id)) {
    authorialLayers = authorialLayers.map(l =>
      l.id === id ? { ...l, ...(patch as any) } : l
    );
  }
  const paletteAppliedFills = c.paletteAppliedFills ? { ...c.paletteAppliedFills } : undefined;
  if (paletteAppliedFills && Object.hasOwn(patch, "fill")) delete paletteAppliedFills[id];
  return resolveArsenalComposition({
    ...c,
    ...(paletteAppliedFills ? { paletteAppliedFills } : {}),
    ...(authorialLayers ? { authorialLayers } : {}),
    relations,
    overrides: { ...c.overrides, [id]: { ...c.overrides[id], ...patch } },
  });
}

export function disableArsenalRelation(
  c: ArsenalComposition,
  id: string
): ArsenalComposition {
  const relation = c.relations.find(r => r.id === id);
  if (!relation || !relation.enabled) return c;
  const overrides = structuredClone(c.overrides);
  for (const o of relation.outputs) {
    const binding = c.base.bindings.find(
      b => b.kind === "list" && b.targetIds.includes(o.targetId)
    );
    const nodes = binding
      ? c.elements.filter(e => e.bindingId === binding.id)
      : [
          c.elements.find(e => e.id === o.targetId) ??
            c.groups.find(e => e.id === o.targetId),
        ];
    for (const e of nodes)
      if (e)
        for (const p of o.properties) {
          overrides[e.id] ??= {};
          overrides[e.id][p] = (e as unknown as Record<string, number>)[p];
        }
  }
  return resolveArsenalComposition({
    ...c,
    overrides,
    relations: c.relations.map(r =>
      r.id === id ? { ...r, enabled: false } : r
    ),
  });
}

export function putArsenalComposition(
  post: CanvasPostModel,
  c: ArsenalComposition
): CanvasPostModel {
  const authorialExtraTexts: CanvasCustomText[] =
    c.version === 3
      ? c.authorialLayers
          .filter(l => l.kind === "text")
          .map(l => ({
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
    c.version === 3
      ? c.authorialLayers
          .filter(l => l.kind === "image")
          .map(l => ({
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

  const bgImage = (c.version === 3 && c.customBackground?.imageUrl) ? c.customBackground.imageUrl : undefined;
  const logoUrl = (c.version === 3 && c.logo?.url) ? c.logo.url : undefined;

  const slides = post.slides.map((s, i) =>
    i === post.currentSlideIndex
      ? {
          ...s,
          composition: c,
          headline: projectContentHeadline(c.content),
          subtext: projectContentBody(c.content),
          extraTexts: authorialExtraTexts,
          extraImages: authorialExtraImages,
          bgImage: bgImage ?? "",
          logoUrl: logoUrl ?? "",
        }
      : s
  );
  const cover = slides[0];
  return {
    ...post,
    modelVersion: 2,
    slides,
    headline: cover.headline,
    subtext: cover.subtext,
    caption: (post.slides[post.currentSlideIndex]?.composition !== undefined)
      ? (post.caption !== undefined ? post.caption : (c.content.caption ?? ""))
      : (c.content.caption ?? post.caption ?? ""),
    hashtags: post.hashtags !== undefined ? post.hashtags : c.content.hashtags,
    extraTexts: slides.length <= 1 ? authorialExtraTexts : post.extraTexts,
    extraImages: slides.length <= 1 ? authorialExtraImages : post.extraImages,
    bgImage: cover.bgImage ?? post.bgImage ?? "",
    logoUrl: post.logoUrl ?? "",
  };
}

export function projectArsenalFormat(
  c: ArsenalComposition,
  ratio: CanvasPostModel["aspectRatio"]
): ArsenalComposition {
  if (ratio === c.effectiveAspectRatio) return c;
  const artboard = {
    width: 1080,
    height: aspectRatioHeight(ratio, 1080),
    background: c.artboard.background,
  };
  const scale = Math.min(
    artboard.width / c.artboard.width,
    artboard.height / c.artboard.height
  );
  // Compose the uniform transform from the current artboard, including existing margins.
  let frozen = c;
  for (const r of c.relations.filter(
    r => r.enabled && r.inputs.includes("artboard")
  ))
    frozen = disableArsenalRelation(frozen, r.id);
  return {
    ...frozen,
    artboard,
    effectiveAspectRatio: ratio,
    layoutOrigin: "manual-projection",
    projection: {
      scale: c.projection.scale * scale,
      x:
        c.projection.x * scale +
        (artboard.width - c.artboard.width * scale) / 2,
      y:
        c.projection.y * scale +
        (artboard.height - c.artboard.height * scale) / 2,
    },
  };
}

export const hasArsenalGeometryOverrides = (c: ArsenalComposition) =>
  Object.values(c.overrides).some(p =>
    ["x", "y", "width", "height", "rotation", "scale"].some(k => k in p)
  ) || c.relations.some(r => !r.enabled);
export function restoreArsenalVariant(
  c: ArsenalComposition,
  targetAspectRatio?: CanvasPostModel["aspectRatio"]
): ArsenalComposition {
  const geometry = new Set(["x", "y", "width", "height", "rotation", "scale"]);
  const overrides = Object.fromEntries(
    Object.entries(c.overrides).map(([id, patch]) => [
      id,
      Object.fromEntries(
        Object.entries(patch).filter(([key]) => !geometry.has(key))
      ),
    ])
  );
  const baseRestored = resolveArsenalComposition({
    ...c,
    overrides,
    relations: structuredClone(c.base.relations),
    artboard: c.base.artboard,
    projection: { scale: 1, x: 0, y: 0 },
    layoutOrigin: "catalog-variant",
    effectiveAspectRatio: c.base.aspectRatio,
  });
  const ratio = targetAspectRatio ?? c.effectiveAspectRatio ?? c.base.aspectRatio;
  return ratio && ratio !== baseRestored.effectiveAspectRatio
    ? projectArsenalFormat(baseRestored, ratio)
    : baseRestored;
}

export { readArsenalComposition } from "@shared/designArsenal";

/** Conservative geometry audit; intentional overlaps are explicit variant data. */
export function auditArsenalGeometry(c: ArsenalComposition): string[] {
  return auditSharedArsenalGeometry(c, layoutRichText);
}

export function upgradeCompositionToV3(
  c: ArsenalComposition
): ArsenalCompositionV3 {
  if (c.version === 3) return c;
  return {
    ...c,
    version: 3,
    authorialLayers: [],
    hiddenInstanceIds: [],
    customBackground: undefined,
    logo: undefined,
    userFonts: [],
    effects: {},
  };
}

export function addArsenalAuthorialLayer(
  source: ArsenalComposition,
  layer: ArsenalAuthorialLayer
): ArsenalCompositionV3 {
  const c = upgradeCompositionToV3(source);
  const authorialLayers = [...c.authorialLayers, layer];
  return resolveArsenalComposition({
    ...c,
    authorialLayers,
  }) as ArsenalCompositionV3;
}

export function updateArsenalAuthorialLayer(
  source: ArsenalComposition,
  id: string,
  patch: Partial<ArsenalAuthorialLayer>
): ArsenalComposition {
  const c = upgradeCompositionToV3(source);
  const authorialLayers = c.authorialLayers.map(l =>
    l.id === id ? { ...l, ...patch } : l
  );
  return resolveArsenalComposition({
    ...c,
    authorialLayers,
    overrides: { ...c.overrides, [id]: Object.fromEntries(Object.entries(c.overrides[id] ?? {}).filter(([key]) => !(key in patch))) },
  });
}

export function removeArsenalAuthorialLayer(
  source: ArsenalComposition,
  id: string
): ArsenalComposition {
  const c = upgradeCompositionToV3(source);
  const authorialLayers = c.authorialLayers.filter(l => l.id !== id);
  const overrides = { ...c.overrides };
  delete overrides[id];
  const richText = { ...c.richText };
  delete richText[id];
  const media = { ...c.media };
  delete media[id];
  const effects = { ...c.effects };
  delete effects[id];
  return resolveArsenalComposition({
    ...c,
    authorialLayers,
    overrides,
    richText,
    media,
    effects,
  });
}

export function duplicateArsenalAuthorialLayer(
  source: ArsenalComposition,
  id: string
): { composition: ArsenalComposition; newId: string } {
  const c = upgradeCompositionToV3(source);
  const target = c.authorialLayers.find(l => l.id === id);
  if (!target) return { composition: c, newId: id };
  const newId = `layer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const duplicated: ArsenalAuthorialLayer = {
    ...structuredClone(target),
    id: newId,
    x: target.x + 24,
    y: target.y + 24,
    zIndex: Math.max(...c.elements.map(e => e.zIndex), 0) + 1,
  };
  const next = addArsenalAuthorialLayer({
    ...c,
    ...(c.elementStates?.[id] ? { elementStates: { ...c.elementStates, [newId]: structuredClone(c.elementStates[id]) } } : {}),
    ...(c.effects[id] ? { effects: { ...c.effects, [newId]: structuredClone(c.effects[id]) } } : {}),
    ...(c.richText[id] ? { richText: { ...c.richText, [newId]: structuredClone(c.richText[id]) } } : {}),
    ...(c.media[id] ? { media: { ...c.media, [newId]: structuredClone(c.media[id]) } } : {}),
    ...(c.paletteAppliedFills?.[id] ? { paletteAppliedFills: { ...c.paletteAppliedFills, [newId]: c.paletteAppliedFills[id] } } : {}),
    ...(c.overrides[id]?.fill !== undefined ? { overrides: { ...c.overrides, [newId]: { fill: c.overrides[id].fill } } } : {}),
  }, duplicated);
  return { composition: next, newId };
}

export function reorderArsenalLayer(
  source: ArsenalComposition,
  id: string,
  direction: "front" | "back" | "forward" | "backward"
): ArsenalComposition {
  const c = upgradeCompositionToV3(source);
  const current = [...c.elements, ...c.groups].find(e => e.id === id);
  if (!current) return c;
  // Konva orders siblings, not a flattened list of children from unrelated groups.
  const siblings = orderedArsenalNodes(c, current.parentId);
  const index = siblings.findIndex(e => e.id === id);
  const destination = direction === "front" ? siblings.length - 1
    : direction === "back" ? 0
    : Math.max(0, Math.min(siblings.length - 1, index + (direction === "forward" ? 1 : -1)));
  if (index === destination) return c;
  siblings.splice(index, 1);
  siblings.splice(destination, 0, current);
  const overrides = structuredClone(c.overrides);
  siblings.forEach((node, i) => { overrides[node.id] = { ...overrides[node.id], zIndex: i }; });
  return resolveArsenalComposition({ ...c, overrides });
}

export function hideArsenalInstance(
  source: ArsenalComposition,
  id: string
): ArsenalComposition {
  const c = upgradeCompositionToV3(source);
  if (c.authorialLayers.some(l => l.id === id)) {
    return removeArsenalAuthorialLayer(c, id);
  }
  if (!c.base.instances.some(i => i.id === id)) return c;
  const hiddenInstanceIds = Array.from(new Set([...c.hiddenInstanceIds, id]));
  const relations = c.relations.map(r =>
    r.outputs.some(o => o.targetId === id)
      ? { ...r, enabled: false }
      : r
  );
  return resolveArsenalComposition({
    ...c,
    hiddenInstanceIds,
    relations,
  });
}

export function setArsenalCustomBackground(
  source: ArsenalComposition,
  bg: ArsenalCustomBackground
): ArsenalComposition {
  const c = upgradeCompositionToV3(source);
  return resolveArsenalComposition({
    ...c,
    customBackground: { ...c.customBackground, ...bg },
    artboard: {
      ...c.artboard,
      background: bg.fill ?? c.artboard.background,
    },
  });
}

export function setArsenalLogo(
  source: ArsenalComposition,
  logo: ArsenalLogo | undefined
): ArsenalComposition {
  const c = upgradeCompositionToV3(source);
  return resolveArsenalComposition({
    ...c,
    logo,
  });
}

export function setArsenalElementEffect(
  source: ArsenalComposition,
  id: string,
  effect: ArsenalElementEffect
): ArsenalComposition {
  const c = upgradeCompositionToV3(source);
  const effects = { ...c.effects, [id]: effect };
  return resolveArsenalComposition({
    ...c,
    effects,
  });
}

export function addArsenalUserFont(
  source: ArsenalComposition,
  font: ArsenalUserFont
): ArsenalComposition {
  const c = upgradeCompositionToV3(source);
  const userFonts = [
    ...c.userFonts.filter(f => f.family !== font.family),
    font,
  ];
  return resolveArsenalComposition({
    ...c,
    userFonts,
  });
}

export function releaseArsenalPropertyRelation(
  source: ArsenalComposition,
  elementId: string,
  property: string
): ArsenalComposition {
  const current = source.elements.find(e => e.id === elementId);
  const patch: Record<string, any> = {};
  if (current && property in current) {
    patch[property] = (current as any)[property];
  }
  return overrideArsenalElement(source, elementId, patch);
}

function makeFreshId(prefix: string): string {
  let uuid: string;
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    uuid = crypto.randomUUID();
  } else {
    uuid = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
  return prefix ? `${prefix}-${uuid}` : uuid;
}

/**
 * Clona uma composição Arsenal V3 gerando novos IDs para as camadas autorais,
 * remapeando overrides, richText, effects e media, e reconciliando os elementos
 * via resolveArsenalComposition.
 */
export function cloneArsenalComposition(
  source: ArsenalComposition,
  createId: (prefix: string) => string = makeFreshId
): { composition: ArsenalComposition; idMap: Map<string, string> } {
  const cloned = structuredClone(source);
  const idMap = new Map<string, string>();

  if (cloned.version === 3 && cloned.authorialLayers?.length) {
    cloned.authorialLayers = cloned.authorialLayers.map((layer) => {
      const newId = createId(layer.kind === "text" ? "tx" : layer.kind === "image" ? "im" : "layer");
      idMap.set(layer.id, newId);
      return {
        ...layer,
        id: newId,
        richText: Array.isArray(layer.richText) ? structuredClone(layer.richText) : layer.richText,
      };
    });

    // Traduz parentId somente se apontar para outra camada autoral presente no idMap
    cloned.authorialLayers = cloned.authorialLayers.map((layer) => {
      if (layer.parentId && idMap.has(layer.parentId)) {
        return { ...layer, parentId: idMap.get(layer.parentId)! };
      }
      return layer;
    });

    // Remapeia overrides das camadas autorais preservando as de catálogo
    const nextOverrides: Record<string, any> = {};
    for (const [key, val] of Object.entries(cloned.overrides)) {
      const mappedKey = idMap.get(key) || key;
      nextOverrides[mappedKey] = structuredClone(val);
    }
    cloned.overrides = nextOverrides;

    // Remapeia richText das camadas autorais
    const nextRichText: Record<string, any> = {};
    for (const [key, val] of Object.entries(cloned.richText)) {
      const mappedKey = idMap.get(key) || key;
      nextRichText[mappedKey] = structuredClone(val);
    }
    cloned.richText = nextRichText;

    // Remapeia effects das camadas autorais
    const nextEffects: Record<string, any> = {};
    for (const [key, val] of Object.entries(cloned.effects || {})) {
      const mappedKey = idMap.get(key) || key;
      nextEffects[mappedKey] = structuredClone(val);
    }
    cloned.effects = nextEffects;

    // Remapeia media das camadas autorais
    const nextMedia: Record<string, any> = {};
    for (const [key, val] of Object.entries(cloned.media || {})) {
      const mappedKey = idMap.get(key) || key;
      nextMedia[mappedKey] = structuredClone(val);
    }
    cloned.media = nextMedia;

    if (cloned.elementStates) cloned.elementStates = Object.fromEntries(
      Object.entries(cloned.elementStates).map(([id, state]) => [idMap.get(id) ?? id, structuredClone(state)]),
    );
    if (cloned.paletteAppliedFills) cloned.paletteAppliedFills = Object.fromEntries(
      Object.entries(cloned.paletteAppliedFills).map(([id, color]) => [idMap.get(id) ?? id, color]),
    );

    // Materializa e reconcilia elements e groups através do resolver existente
    const resolved = resolveArsenalComposition(cloned);
    return { composition: resolved, idMap };
  }

  return { composition: cloned, idMap };
}
