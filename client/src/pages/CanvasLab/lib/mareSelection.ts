import { aspectRatioHeight } from "@shared/aspectRatios";
import {
  mareSelectionSchema,
  type MareLayer,
  type MareSelection,
} from "@shared/mareSelection";
import { arsenalBundledManifest } from "@shared/arsenalBundledManifest";
import { activeArsenalMedia } from "@shared/designArsenal";
import { arsenalCanonicalJson } from "@shared/arsenalContent";
import type { CanvasPostModel } from "../components/types";
import {
  addArsenalAuthorialLayer,
  putArsenalComposition,
} from "./arsenalComposition";
import {
  projectEditorLayers,
  type EditorLayer,
  type EditorGeometry,
} from "./editorController";
import { resolveSlideAppearance } from "./slideReplication";
import {
  extraTextAppearance,
  nativeTextAppearance,
} from "./nativeTextAppearance";

const blank =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=";
type Geometry = (id: string) => EditorGeometry | null | undefined;

export function buildMareSelection(
  doc: CanvasPostModel,
  ids: string[],
  getGeometry: Geometry
): MareSelection {
  const post = resolveSlideAppearance(doc, doc.currentSlideIndex);
  const slide = post.slides[doc.currentSlideIndex],
    c = slide.composition;
  const height = aspectRatioHeight(post.aspectRatio),
    unit = c ? 360 / c.artboard.width : 1,
    scale = unit * (c?.projection.scale ?? 1);
  const layers: MareLayer[] = [];
  const elementIds: string[] = [];
  function visit(layer: EditorLayer, parentSelected: boolean, opacity: number) {
    const selected = parentSelected || ids.includes(layer.id);
    if (!layer.visible) return;
    const group = c?.groups.find(g => g.id === layer.id);
    if (layer.kind === "group") {
      layer.children.forEach(child =>
        visit(child, selected, opacity * (group?.opacity ?? 1))
      );
      if (selected && layer.locked)
        throw Error("Desbloqueie o grupo antes de animar.");
      return;
    }
    if (!selected) return;
    if (layer.locked || slide.temporalMedia?.[layer.id])
      throw Error("Selecione elementos visíveis, desbloqueados e estáticos.");
    const g = getGeometry(layer.id);
    if (!g || !g.width || !g.height)
      throw Error("Não foi possível medir " + layer.label + ".");
    const e = c?.elements.find(e => e.id === layer.id);
    const image = (slide.extraImages ?? post.extraImages)?.find(
      a => a.id === layer.id
    );
    const shape = slide.extraShapes?.find(s => s.id === layer.id);
    const text = (slide.extraTexts ?? post.extraTexts)?.find(
      t => t.id === layer.id
    );
    const radians = ((g.rotation ?? 0) * Math.PI) / 180;
    const main = {
      name: layer.label,
      x:
        (g.x +
          (Math.cos(radians) * g.width) / 2 -
          (Math.sin(radians) * g.height) / 2) *
          scale +
        (c?.projection.x ?? 0) * unit,
      y:
        (g.y +
          (Math.sin(radians) * g.width) / 2 +
          (Math.cos(radians) * g.height) / 2) *
          scale +
        (c?.projection.y ?? 0) * unit,
      width: g.width * scale,
      height: g.height * scale,
      rotation: g.rotation ?? 0,
      opacity: opacity * (e?.opacity ?? image?.opacity ?? text?.opacity ?? 1),
    };
    let item: MareLayer;
    if (layer.kind === "text") {
      const style = e
        ? {
            fontFamily:
              c?.assets.find(a => a.id === e.fontAssetId)?.sourceFamily ??
              e.fontFamily,
            fontWeight: e.fontWeight,
            fill: e.fill,
            align: e.align,
            fontSize: e.fontSize,
          }
        : text
          ? extraTextAppearance(post, text)
          : nativeTextAppearance(
              post,
              slide,
              layer.id === "subtext" ? "body" : "headline"
            );
      item = {
        ...main,
        kind: "text",
        text: layer.text ?? "",
        color: style.fill,
        fontSize: (g.fontSize ?? style.fontSize) * scale,
        fontFamily:
          style.fontFamily
            .split(",")[0]
            .replace(new RegExp("[^\\p{L}\\d -]", "gu"), "")
            .trim()
            .slice(0, 80) || "Arial",
        fontWeight: style.fontWeight,
        align: style.align,
        italic: text?.fontStyle === "italic",
      };
    } else if (layer.kind === "image") {
      const url =
        e && c
          ? (activeArsenalMedia(c, e)?.url ??
            arsenalBundledManifest[e.imageAssetId ?? ""]?.path)
          : image?.url;
      if (
        !url ||
        !/^(?:\/(?:api\/post-media|arsenal\/images|backgrounds|designs|images)\/|data:image\/(?:png|jpeg|webp);base64,)/.test(
          url
        )
      )
        throw Error(
          "A imagem “" +
            layer.label +
            "” precisa de uma fonte do PostSpark para ser animada."
        );
      item = { ...main, kind: "image", url };
    } else if (e?.kind === "line" && e.points.length === 4) {
      const [x1, y1, x2, y2] = e.points,
        groupScale = g.width / e.width;
      const x = ((x1 + x2) * groupScale) / 2,
        y = ((y1 + y2) * groupScale) / 2;
      item = {
        ...main,
        kind: "rect",
        color: e.stroke ?? e.fill,
        x:
          (g.x + Math.cos(radians) * x - Math.sin(radians) * y) * scale +
          (c?.projection.x ?? 0) * unit,
        y:
          (g.y + Math.sin(radians) * x + Math.cos(radians) * y) * scale +
          (c?.projection.y ?? 0) * unit,
        width: Math.hypot(x2 - x1, y2 - y1) * groupScale * scale,
        height: Math.max(0.001, e.strokeWidth * groupScale * scale),
        rotation:
          (g.rotation ?? 0) + (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI,
      };
    } else if (shape || e?.kind === "rect" || layer.id === "bar")
      item = {
        ...main,
        kind: "rect",
        color: e?.fill ?? shape?.color ?? post.palette.accent,
      };
    else
      throw Error(
        "A camada “" + layer.label + "” não tem representação editável no Maré."
      );
    layers.push(item);
    elementIds.push(layer.id);
  }
  projectEditorLayers(post, slide.id).forEach(layer => visit(layer, false, 1));
  if (!layers.length) throw Error("Selecione pelo menos um objeto visível.");
  return mareSelectionSchema.parse({
    elementIds,
    sourceComposition: {
      name: layers.length === 1 ? layers[0].name : "Seleção do CanvasLab",
      width: 360,
      height,
      layers,
    },
  });
}

export function addMareSelection(
  doc: CanvasPostModel,
  slotId: string,
  selection: MareSelection
) {
  const index = doc.currentSlideIndex,
    slide = doc.slides[index],
    c = slide.composition;
  const { width, height } = selection.sourceComposition;
  const image = {
    id: slotId,
    url: blank,
    x: 0,
    y: 0,
    width,
    height,
    opacity: 1,
    rotation: 0,
    cornerRadius: 0,
  };
  let next = doc;
  if (c) {
    const factor = c.artboard.width / 360 / c.projection.scale;
    const selected = c.elements.filter(e =>
      selection.elementIds.includes(e.id)
    );
    const topZ = Math.max(
      ...selected.map(e => {
        let parent = e.parentId,
          z = e.zIndex;
        const visited = new Set<string>();
        while (parent) {
          if (visited.has(parent))
            throw Error("A estrutura do grupo é circular.");
          visited.add(parent);
          const group = c.groups.find(g => g.id === parent);
          if (!group) break;
          z = group.zIndex;
          parent = group.parentId;
        }
        return z;
      })
    );
    const authorial = addArsenalAuthorialLayer(c, {
      ...image,
      kind: "image",
      parentId: null,
      zIndex: topZ + 1,
      x: -c.projection.x / c.projection.scale,
      y: -c.projection.y / c.projection.scale,
      width: width * factor,
      height: height * factor,
    });
    next = putArsenalComposition(doc, authorial);
    next = { ...next, caption: doc.caption, hashtags: doc.hashtags };
  }
  const sourceSlide = next.slides[index];
  const order = projectEditorLayers(doc, slide.id).map(l => l.id);
  const pos =
    Math.max(...selection.elementIds.map(id => order.indexOf(id))) + 1;
  return {
    ...next,
    slides: next.slides.map((s, i) =>
      i === index
        ? {
            ...sourceSlide,
            ...(!c
              ? {
                  extraImages: [
                    ...(slide.extraImages ?? doc.extraImages ?? []),
                    image,
                  ],
                  elementOrder: [
                    ...order.slice(0, pos),
                    slotId,
                    ...order.slice(pos),
                  ],
                }
              : {}),
            mareSelections: { ...slide.mareSelections, [slotId]: selection },
          }
        : s
    ),
  };
}

/** Keep original objects editable in the saved design. Derive replacement visibility only while rendering. */
export function projectMareSelections(doc: CanvasPostModel, index: number) {
  const slide = doc.slides[index];
  if (!slide?.mareSelections) return doc;
  const states = {
    ...(slide.composition?.elementStates ?? slide.elementStates),
  };
  for (const [id, selection] of Object.entries(slide.mareSelections)) {
    const assigned = Boolean(slide.temporalMedia?.[id]);
    for (const target of assigned ? selection.elementIds : [id])
      states[target] = { ...states[target], hidden: true };
  }
  return {
    ...doc,
    slides: doc.slides.map((s, i) =>
      index !== i
        ? s
        : s.composition
          ? { ...s, composition: { ...s.composition, elementStates: states } }
          : { ...s, elementStates: states }
    ),
  };
}

export function mareSelectionFingerprint(
  doc: CanvasPostModel,
  slotId: string,
  slideId: string
): string | null {
  const index = doc.slides.findIndex(s => s.id === slideId),
    slide = doc.slides[index],
    selection = slide?.mareSelections?.[slotId];
  if (!selection) return null;
  const view = resolveSlideAppearance(doc, index),
    c = slide.composition;
  const originals = selection.elementIds.map(id => {
    const element = c?.elements.find(e => e.id === id);
    if (c && element) {
      const groups = [];
      let parent = element.parentId;
      const visited = new Set<string>();
      while (parent) {
        if (visited.has(parent))
          throw Error("A estrutura do grupo é circular.");
        visited.add(parent);
        const group = c.groups.find(g => g.id === parent);
        if (!group) break;
        groups.push(group);
        parent = group.parentId;
      }
      return [
        element,
        groups,
        c.media[id],
        c.elementStates?.[id],
        c.richText[id],
      ];
    }
    const object =
      (slide.extraTexts ?? view.extraTexts)?.find(e => e.id === id) ??
      (slide.extraImages ?? view.extraImages)?.find(e => e.id === id) ??
      slide.extraShapes?.find(e => e.id === id);
    if (object) return [object, slide.elementStates?.[id]];
    if (id === "headline" || id === "subtext")
      return [
        slide[id],
        slide[(id + "Pos") as "headlinePos"],
        slide[(id + "Width") as "headlineWidth"],
        slide[(id + "Scale") as "headlineScale"],
        slide[(id + "Rich") as "headlineRich"],
        nativeTextAppearance(
          view,
          slide,
          id === "headline" ? "headline" : "body"
        ),
        slide.elementStates?.[id],
      ];
    return [
      id,
      view.badgeText,
      slide.step,
      slide.nativeDecorationTransforms?.[id as "bar"],
      slide.elementStates?.[id],
    ];
  });
  return arsenalCanonicalJson(
    JSON.parse(
      JSON.stringify({
        selection,
        originals,
        aspect: doc.aspectRatio,
        projection: c?.projection,
      })
    )
  );
}
