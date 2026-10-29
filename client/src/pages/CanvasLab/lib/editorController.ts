import type {
  ArsenalComposition,
  ArsenalElement,
  ArsenalAuthorialLayer,
} from "@shared/designArsenal";
import { aspectRatioHeight } from "@shared/aspectRatios";
import {
  readArsenalComposition,
  arsenalLogoSchema,
  arsenalElementEffectSchema,
} from "@shared/designArsenal";
import type {
  CanvasPostModel,
  CanvasRichTextChunk,
  CarouselSlideItem,
} from "../components/types";
import {
  addArsenalAuthorialLayer,
  arsenalWorldGeometry,
  editArsenalContent,
  editArsenalElementText,
  hideArsenalInstance,
  overrideArsenalElement,
  putArsenalComposition,
  reorderArsenalLayer,
  setArsenalCustomBackground,
  setArsenalLogo,
  setArsenalElementEffect,
  upgradeCompositionToV3,
} from "./arsenalComposition";
import {
  canonicalContentSources,
  contentListItems,
  readContentSource,
  setContentSource,
} from "@shared/arsenalContent";
import {
  freshId,
  duplicateExtraElement,
  removeExtraElement,
  resolveSlideExtraImages,
  resolveSlideExtraTexts,
  updateExtraElement,
  updateSlideById,
} from "./documentCommands";
import { resolveSlideAppearance } from "./slideReplication";
import { applyContrastGuard } from "./contrast";
import { applyArsenalPalette } from "./editorPalette";
import { reconcileRichTextChange } from "./richText";
import {
  getEditorElementState,
  getArsenalElementStateInheritance,
  patchEditorElementState,
  resolveEditorElementOrder,
  COMPOSITION_BACKGROUND_ID,
  COMPOSITION_LOGO_ID,
} from "./editorElementState";
export {
  getEditorElementState,
  getArsenalElementState,
  resolveEditorElementOrder,
  COMPOSITION_BACKGROUND_ID,
  COMPOSITION_LOGO_ID,
} from "./editorElementState";

export type EditorTarget = { slideId: string; elementId: string };
export type EditorRole = "headline" | "body" | "content" | "decoration";
export type EditorGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  fontSize?: number;
};
export type EditorLayer = {
  id: string;
  target: EditorTarget;
  label: string;
  kind: "text" | "image" | "shape" | "group" | "background" | "logo";
  parentId: string | null;
  children: EditorLayer[];
  visible: boolean;
  locked: boolean;
  hiddenByAncestorId?: string;
  lockedByAncestorId?: string;
  visibilityUnavailableReason?: string;
  lockUnavailableReason?: string;
  text?: string;
  role?: EditorRole;
  capabilities: {
    editText: boolean;
    properties: boolean;
    duplicate: boolean;
    reorder: boolean;
    align: boolean;
    remove: boolean;
    visibility: boolean;
    lock: boolean;
  };
  unavailableReason?: string;
};
export type EditorCommand =
  | { type: "visibility"; visible: boolean }
  | { type: "lock"; locked: boolean }
  | { type: "text"; text: string; richText?: CanvasRichTextChunk[]; scope?: "phrase" }
  | { type: "list"; action: "add"; text: string }
  | { type: "list"; action: "remove"; itemId: string }
  | { type: "list"; action: "move"; itemId: string; destination: number }
  | { type: "list"; action: "text"; itemId: string; text: string }
  | { type: "duplicate"; geometry?: EditorGeometry }
  | { type: "remove" }
  | { type: "reorder"; direction: "front" | "back" | "forward" | "backward" }
  | {
      type: "align";
      alignment: "left" | "center" | "right" | "top" | "middle" | "bottom";
      geometry?: EditorGeometry;
    }
  | {
      type: "properties";
      patch: Record<string, string | number | boolean | null>;
      geometry?: EditorGeometry;
    };
export type EditorCommandResult = {
  ok: boolean;
  post: CanvasPostModel;
  selection?: EditorTarget | null;
  reason?: string;
};

function compositionRole(c: ArsenalComposition, e: ArsenalElement): EditorRole {
  if (e.fixedTextRole === "ornament") return "decoration";
  const binding = c.base.bindings.find(
    b => b.id === e.bindingId || b.targetIds.includes(e.id)
  );
  if (binding && c.content.schemaVersion === 3) {
    const sources = canonicalContentSources(c.content, binding.source);
    const blocks = c.content.blocks.filter(block =>
      sources.some(source => source.split(":")[1] === block.id)
    );
    if (
      blocks.length &&
      blocks.every(block => block.type === "text" && block.role === "headline")
    )
      return "headline";
    if (
      blocks.length &&
      blocks.every(block => block.type === "text" && block.role === "body")
    )
      return "body";
  }
  if (binding?.source === "headline") return "headline";
  if (binding?.source === "body" || binding?.source === "subtext")
    return "body";
  if (
    binding ||
    (c.version === 3 && c.authorialLayers.some(l => l.id === e.id))
  )
    return "content";
  return "decoration";
}

/** The conventional renderer has one primary badge: brand tag first, slide step as fallback. */
export function resolveNativeBadge(
  post: CanvasPostModel,
  slideId: string
): { text: string; source: "badgeText" | "step" } | undefined {
  const index = post.slides.findIndex(slide => slide.id === slideId);
  const slide = post.slides[index];
  if (!slide || slide.composition) return;
  const view = resolveSlideAppearance(post, index);
  if (view.showBadge && view.badgeText?.trim())
    return { text: view.badgeText, source: "badgeText" };
  if (post.slides.length > 1 && view.showStep && slide.step?.trim())
    return { text: slide.step, source: "step" };
}

/** Derived semantic tree only; the CanvasPostModel remains the sole document. */
export function projectEditorLayers(
  post: CanvasPostModel,
  slideId: string
): EditorLayer[] {
  const index = post.slides.findIndex(s => s.id === slideId),
    slide = post.slides[index];
  if (!slide) return [];
  const layers: EditorLayer[] = [];
  const add = (
    id: string,
    label: string,
    kind: EditorLayer["kind"],
    parentId: string | null = null,
    text?: string,
    role?: EditorRole
  ) => {
    const state = getEditorElementState(post, slideId, id);
    const inherited = slide.composition
      ? getArsenalElementStateInheritance(slide.composition, id)
      : {};
    const visibilityUnavailableReason = inherited.hiddenByAncestor
      ? `Mostre o grupo “${inherited.hiddenByAncestor.label}” em Camadas para exibir este objeto.`
      : undefined;
    const lockUnavailableReason = inherited.lockedByAncestor
      ? `Desbloqueie o grupo “${inherited.lockedByAncestor.label}” em Camadas para editar este objeto.`
      : undefined;
    const mutable = !state.locked;
    const ordinary = kind !== "background" && kind !== "logo";
    layers.push({
      id,
      target: { slideId, elementId: id },
      label,
      kind,
      parentId,
      children: [],
      ...state,
      hiddenByAncestorId: inherited.hiddenByAncestor?.id,
      lockedByAncestorId: inherited.lockedByAncestor?.id,
      visibilityUnavailableReason,
      lockUnavailableReason,
      text,
      role,
      capabilities: {
        editText: mutable && kind === "text",
        properties: mutable,
        duplicate: mutable && ordinary,
        reorder: mutable && ordinary,
        align: mutable && ordinary,
        remove: mutable && kind !== "background",
        visibility: !inherited.hiddenByAncestor,
        lock: !inherited.lockedByAncestor,
      },
      ...(state.locked
        ? {
            unavailableReason:
              lockUnavailableReason ??
              "Desbloqueie o objeto em Camadas para editá-lo.",
          }
        : {}),
    });
  };
  add(
    slide.composition ? COMPOSITION_BACKGROUND_ID : "background",
    "Fundo",
    "background"
  );
  if (slide.composition) {
    const c = slide.composition;
    for (const node of [...c.elements, ...c.groups].sort(
      (a, b) => a.zIndex - b.zIndex || a.id.localeCompare(b.id)
    )) {
      if ("label" in node)
        add(node.id, node.label || "Grupo", "group", node.parentId);
      else {
        const role =
          node.kind === "text"
            ? compositionRole(c, node)
            : node.kind === "media" ||
                (c.version === 3 &&
                  c.authorialLayers.some(l => l.id === node.id))
              ? "content"
              : "decoration";
        const label =
          role === "headline"
            ? "Título"
            : role === "body"
              ? "Corpo"
              : node.kind === "text"
                ? node.text.trim().slice(0, 36) || "Texto"
                : node.kind === "media"
                  ? "Imagem"
                  : "Decoração";
        add(
          node.id,
          label,
          node.kind === "text"
            ? "text"
            : node.kind === "media"
              ? "image"
              : "shape",
          node.parentId,
          node.kind === "text" ? node.text : undefined,
          role
        );
        const layer = layers.at(-1)!;
        // Group duplication would require cloning pinned structure and its graph; never pretend it succeeded.
        if (node.kind === "media" && node.imageAssetId) {
          layer.capabilities.duplicate = false;
          layer.unavailableReason =
            "A imagem fixa pertence ao design original.";
        }
      }
    }
    for (const layer of layers)
      if (layer.kind === "group") {
        layer.capabilities.duplicate = false;
        layer.capabilities.remove = false;
        layer.unavailableReason ??=
          "O grupo pertence à estrutura do design; edite seus objetos.";
      }
    if (c.version === 3 && c.logo?.url)
      add(COMPOSITION_LOGO_ID, "Logo", "logo");
  } else {
    if (slide.headline)
      add("headline", "Título", "text", null, slide.headline, "headline");
    if (slide.subtext)
      add("subtext", "Corpo", "text", null, slide.subtext, "body");
    const badge = resolveNativeBadge(post, slideId);
    if (badge)
      add(
        "badge",
        badge.source === "step" ? "Etapa do slide" : "Selo",
        "text",
        null,
        badge.text,
        "decoration"
      );
    add("bar", "Detalhe decorativo", "shape", null, undefined, "decoration");
    if (slide.logo ? slide.logo.url : post.logoUrl) add("logo", "Logo", "logo");
    for (const shape of slide.extraShapes ?? [])
      add(shape.id, "Forma", "shape", null, undefined, "content");
    for (const text of resolveSlideExtraTexts(post, index))
      add(
        text.id,
        text.text.trim().slice(0, 36) || "Texto",
        "text",
        null,
        text.text,
        "content"
      );
    for (const image of resolveSlideExtraImages(post, index))
      add(image.id, "Imagem", "image");
    for (const layer of layers)
      if (["badge", "bar"].includes(layer.id)) {
        layer.capabilities.duplicate = false;
        layer.capabilities.remove = false;
        layer.unavailableReason ??=
          "Esse detalhe faz parte do estilo; você pode movê-lo, redimensioná-lo, ocultá-lo ou bloqueá-lo.";
      }
    const naturalOrder = [
      "background",
      "badge",
      "logo",
      ...(slide.extraShapes ?? []).map(s => s.id),
      "headline",
      "subtext",
      "bar",
      ...resolveSlideExtraTexts(post, index).map(t => t.id),
      ...resolveSlideExtraImages(post, index).map(i => i.id),
    ].filter(id => layers.some(layer => layer.id === id));
    const order = new Map(
      resolveEditorElementOrder(naturalOrder, slide.elementOrder).map(
        (id, i) => [id, i]
      )
    );
    layers.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }
  const byId = new Map(layers.map(l => [l.id, l]));
  for (const layer of layers)
    if (layer.parentId) byId.get(layer.parentId)?.children.push(layer);
  return layers.filter(l => !l.parentId);
}
export function resolveEditorSelection(
  post: CanvasPostModel,
  target: EditorTarget | null | undefined
): EditorLayer | undefined {
  if (!target) return;
  const find = (layers: EditorLayer[]): EditorLayer | undefined => {
    for (const layer of layers) {
      if (layer.id === target.elementId) return layer;
      const nested = find(layer.children);
      if (nested) return nested;
    }
  };
  return find(projectEditorLayers(post, target.slideId));
}

export function resolveEditorPhrase(post: CanvasPostModel, target: EditorTarget) {
  const c = post.slides.find(slide => slide.id === target.slideId)?.composition;
  const element = c?.elements.find(e => e.id === target.elementId);
  const binding = c?.base.bindings.find(b => b.id === element?.bindingId);
  if (!c || !element?.contentFragment || binding?.kind !== "text") return;
  const text = readContentSource(c.content, binding.source);
  if (typeof text !== "string") return;
  return { text, source: binding.source };
}

function storeComposition(
  post: CanvasPostModel,
  index: number,
  composition: ArsenalComposition
): CanvasPostModel {
  const next = putArsenalComposition(
    { ...post, currentSlideIndex: index },
    readArsenalComposition(composition)
  );
  return { ...next, currentSlideIndex: post.currentSlideIndex };
}
function failed(post: CanvasPostModel, reason: string): EditorCommandResult {
  return { ok: false, post, reason };
}

/** All durable results must be committed through the page's handleUpdatePost. */
export function executeEditorCommand(
  post: CanvasPostModel,
  target: EditorTarget,
  command: EditorCommand
): EditorCommandResult {
  const index = post.slides.findIndex(s => s.id === target.slideId),
    slide = post.slides[index];
  const layer = resolveEditorSelection(post, target);
  if (!slide || !layer)
    return failed(post, "Este objeto não existe mais no slide de origem.");
  if (
    command.type === "visibility" &&
    command.visible &&
    layer.visibilityUnavailableReason
  )
    return failed(post, layer.visibilityUnavailableReason);
  if (command.type === "lock" && !command.locked && layer.lockUnavailableReason)
    return failed(post, layer.lockUnavailableReason);
  const capability =
    command.type === "text" || command.type === "list"
      ? "editText"
      : command.type;
  if (!layer.capabilities[capability])
    return failed(
      post,
      layer.unavailableReason ??
        "Esta operação não está disponível para este objeto."
    );
  const id = target.elementId;
  const success = (
    next: CanvasPostModel,
    selection: EditorTarget | null = target
  ): EditorCommandResult => ({ ok: true, post: next, selection });
  try {
    let c = slide.composition;
    if (command.type === "list") {
      if (!c) return failed(post, "O objeto selecionado não é uma lista.");
      const list = resolveEditorList(post, target);
      if (!list) return failed(post, "O objeto selecionado não é uma lista.");
      const content = structuredClone(c.content),
        items = contentListItems(content, list.source);
      const binding = c.base.bindings.find(
        b => b.kind === "list" && b.source === list.source
      );
      if (command.action === "add") {
        if (binding?.cardinality && items.length >= binding.cardinality.max)
          return failed(
            post,
            `Esta lista comporta até ${binding.cardinality.max} itens.`
          );
        items.push({ id: freshId("item"), text: command.text });
      } else {
        const itemIndex = items.findIndex(item => item.id === command.itemId);
        if (itemIndex < 0)
          return failed(post, "O item da lista não existe mais.");
        if (command.action === "remove") {
          if (binding?.cardinality && items.length <= binding.cardinality.min)
            return failed(
              post,
              `Esta lista precisa de pelo menos ${binding.cardinality.min} item.`
            );
          items.splice(itemIndex, 1);
        } else if (command.action === "text")
          items[itemIndex] = { ...items[itemIndex], text: command.text };
        else {
          if (
            !Number.isInteger(command.destination) ||
            command.destination < 0 ||
            command.destination >= items.length
          )
            return failed(post, "A posição na lista não é válida.");
          const [item] = items.splice(itemIndex, 1);
          items.splice(command.destination, 0, item);
        }
      }
      const updated = storeComposition(
        post,
        index,
        editArsenalContent(c, content)
      );
      const surviving =
        updated.slides[index].composition!.elements.find(e => e.id === id) ??
        updated.slides[index].composition!.elements.find(
          e => e.bindingId === binding?.id
        );
      return success(
        updated,
        surviving ? { ...target, elementId: surviving.id } : null
      );
    }
    if (command.type === "visibility" || command.type === "lock") {
      const patch =
        command.type === "visibility"
          ? { hidden: !command.visible }
          : { locked: command.locked };
      if (c)
        return success(
          storeComposition(post, index, {
            ...c,
            elementStates: patchEditorElementState(c.elementStates, id, patch),
          })
        );
      return success(
        updateSlideById(post, slide.id, {
          elementStates: patchEditorElementState(
            slide.elementStates,
            id,
            patch
          ),
        })
      );
    }
    if (command.type === "text") {
      if (c) {
        if (command.scope === "phrase") {
          const phrase = resolveEditorPhrase(post, target);
          if (!phrase) return failed(post, "Este texto não está dividido em partes.");
          const content = structuredClone(c.content);
          setContentSource(content, phrase.source, command.text);
          return success(storeComposition(post, index, editArsenalContent(c, content)));
        }
        const element = c.elements.find(e => e.id === id)!;
        return success(
          storeComposition(
            post,
            index,
            editArsenalElementText(
              c,
              id,
              command.text,
              command.richText ??
                reconcileRichTextChange(
                  element.text,
                  command.text,
                  element.richText
                )
            )
          )
        );
      }
      if (id === "badge") {
        const badge = resolveNativeBadge(post, slide.id);
        if (!badge)
          return failed(post, "A marcação não está mais visível neste slide.");
        return success(
          updateSlideById(
            post,
            slide.id,
            badge.source === "step"
              ? { step: command.text }
              : {
                  visualStyle: {
                    ...slide.visualStyle,
                    badgeText: command.text,
                  },
                }
          )
        );
      }
      if (id === "headline" || id === "subtext")
        return success(
          updateSlideById(post, slide.id, {
            [id]: command.text,
            [`${id}Rich`]:
              command.richText ??
              reconcileRichTextChange(
                slide[id],
                command.text,
                slide[`${id}Rich`]
              ),
          })
        );
      const text = resolveSlideExtraTexts(post, index).find(t => t.id === id)!;
      return success(
        onSlide(post, index, p =>
          updateExtraElement(p, id, {
            text: command.text,
            textRich:
              command.richText ??
              reconcileRichTextChange(text.text, command.text, text.textRich),
          })
        )
      );
    }
    if (command.type === "reorder") {
      if (c)
        return success(
          storeComposition(
            post,
            index,
            reorderArsenalLayer(c, id, command.direction)
          )
        );
      const order = projectEditorLayers(post, slide.id)
        .map(l => l.id)
        .filter(key => key !== "background");
      const from = order.indexOf(id),
        to =
          command.direction === "front"
            ? order.length - 1
            : command.direction === "back"
              ? 0
              : Math.max(
                  0,
                  Math.min(
                    order.length - 1,
                    from + (command.direction === "forward" ? 1 : -1)
                  )
                );
      order.splice(from, 1);
      order.splice(to, 0, id);
      return success(updateSlideById(post, slide.id, { elementOrder: order }));
    }
    if (command.type === "remove") {
      if (c) {
        if (id === COMPOSITION_LOGO_ID)
          return success(
            storeComposition(post, index, setArsenalLogo(c, undefined)),
            null
          );
        const element = c.elements.find(e => e.id === id),
          binding = c.base.bindings.find(b => b.id === element?.bindingId);
        if (binding?.kind === "list" && element?.itemId) {
          const content = structuredClone(c.content),
            items = contentListItems(content, binding.source),
            itemIndex = items.findIndex(item => item.id === element.itemId);
          if (itemIndex < 0)
            return failed(post, "O item da lista não existe mais.");
          items.splice(itemIndex, 1);
          return success(
            storeComposition(post, index, editArsenalContent(c, content)),
            null
          );
        }
        const removed = hideArsenalInstance(c, id);
        if (removed.elements.some(e => e.id === id))
          return failed(post, "Este objeto pertence à estrutura do design.");
        return success(storeComposition(post, index, removed), null);
      }
      if (id === "headline" || id === "subtext")
        return success(
          updateSlideById(post, slide.id, { [id]: "", [`${id}Rich`]: [] }),
          null
        );
      if (id === "logo") return setEditorLogo(post, [slide.id], { url: "" });
      if (slide.extraShapes?.some(s => s.id === id))
        return success(
          updateSlideById(post, slide.id, {
            extraShapes: slide.extraShapes.filter(s => s.id !== id),
          }),
          null
        );
      return success(
        onSlide(post, index, p => removeExtraElement(p, id)),
        null
      );
    }
    if (command.type === "duplicate") {
      if (c) {
        const source = c.elements.find(e => e.id === id);
        if (!source)
          return failed(
            post,
            "Selecione um objeto dentro do grupo para duplicar."
          );
        const newId = freshId("layer"),
          data: ArsenalAuthorialLayer = {
            id: newId,
            kind: source.kind === "media" ? "image" : source.kind,
            parentId: source.parentId,
            x: source.x + 24,
            y: source.y + 24,
            width: source.width,
            height: source.height,
            rotation: source.rotation,
            opacity: source.opacity,
            zIndex:
              Math.max(
                ...[...c.elements, ...c.groups]
                  .filter(e => e.parentId === source.parentId)
                  .map(e => e.zIndex),
                0
              ) + 1,
            text: source.text,
            richText: structuredClone(source.richText),
            fontFamily: source.fontFamily,
            fontSize: source.fontSize,
            fontWeight: source.fontWeight,
            align: source.align,
            lineHeight: source.lineHeight,
            letterSpacing: source.letterSpacing,
            fill: source.fill,
            stroke: source.stroke,
            strokeWidth: source.strokeWidth,
            cornerRadius: source.cornerRadius,
            points: structuredClone(source.points),
            ...(c.media[id]
              ? {
                  url: c.media[id].url,
                  focalX: c.media[id].focalX,
                  focalY: c.media[id].focalY,
                }
              : {}),
          };
        const upgraded = upgradeCompositionToV3(c);
        const next = addArsenalAuthorialLayer(
          {
            ...upgraded,
            ...(c.paletteAppliedFills?.[id]
              ? {
                  paletteAppliedFills: {
                    ...c.paletteAppliedFills,
                    [newId]: c.paletteAppliedFills[id],
                  },
                }
              : {}),
            ...(c.overrides[id]?.fill !== undefined
              ? {
                  overrides: {
                    ...c.overrides,
                    [newId]: { fill: c.overrides[id].fill },
                  },
                }
              : {}),
            ...(c.elementStates?.[id]
              ? {
                  elementStates: {
                    ...c.elementStates,
                    [newId]: structuredClone(c.elementStates[id]),
                  },
                }
              : {}),
            ...(upgraded.effects[id]
              ? {
                  effects: {
                    ...upgraded.effects,
                    [newId]: structuredClone(upgraded.effects[id]),
                  },
                }
              : {}),
          },
          data
        );
        return success(storeComposition(post, index, next), {
          slideId: slide.id,
          elementId: newId,
        });
      }
      if (id === "headline" || id === "subtext") {
        if (!command.geometry)
          return failed(
            post,
            "Aguarde a medição do texto na arte para duplicá-lo."
          );
        const geometry = command.geometry,
          effective = resolveSlideAppearance(post, index),
          newId = freshId("tx");
        const title = id === "headline";
        const next = updateSlideById(post, slide.id, {
          extraTexts: [
            ...resolveSlideExtraTexts(post, index),
            {
              id: newId,
              text: slide[id],
              textRich: structuredClone(slide[`${id}Rich`]),
              x: geometry.x + 24,
              y: geometry.y + 24,
              width: geometry.width,
              fontSize: geometry.fontSize,
              rotation: geometry.rotation,
              fontFamily: title
                ? effective.fontFamily
                : (effective.subtextFontFamily ?? effective.fontFamily),
              fontWeight: title
                ? effective.headlineFontWeight
                : effective.subtextFontWeight,
              color: title
                ? (effective.palette.headlineColor ?? effective.palette.text)
                : (effective.palette.subtextColor ?? effective.palette.text),
              align: title ? effective.headlineAlign : effective.bodyAlign,
              effect: title
                ? effective.headlineEffect
                : effective.subtextEffect,
              effectColor: title
                ? effective.headlineEffectColor
                : effective.subtextEffectColor,
            },
          ],
        });
        return success(next, { slideId: slide.id, elementId: newId });
      }
      const shape = slide.extraShapes?.find(s => s.id === id);
      if (shape) {
        const newId = freshId("shape");
        return success(
          updateSlideById(post, slide.id, {
            extraShapes: [
              ...slide.extraShapes!,
              {
                ...structuredClone(shape),
                id: newId,
                x: shape.x + 24,
                y: shape.y + 24,
              },
            ],
          }),
          { slideId: slide.id, elementId: newId }
        );
      }
      const result = duplicateExtraElement(
        { ...post, currentSlideIndex: index },
        id
      );
      if (!result.newElementId)
        return failed(post, "Não foi possível duplicar este objeto.");
      let next = { ...result.post, currentSlideIndex: post.currentSlideIndex };
      if (slide.elementStates?.[id])
        next = updateSlideById(next, slide.id, {
          elementStates: {
            ...slide.elementStates,
            [result.newElementId]: structuredClone(slide.elementStates[id]),
          },
        });
      return success(next, {
        slideId: slide.id,
        elementId: result.newElementId,
      });
    }
    if (command.type === "align") {
      let geometry: EditorGeometry | undefined = command.geometry;
      let node = c
        ? [...c.elements, ...c.groups].find(e => e.id === id)
        : undefined;
      if (c && node && !geometry) {
        const world = arsenalWorldGeometry(node, c.groups),
          scale = world.scale * ("scale" in node ? node.scale : 1);
        geometry = {
          ...world,
          width: node.width * scale,
          height: node.height * scale,
        };
      } else if (!geometry) {
        const item = [
          ...resolveSlideExtraImages(post, index),
          ...resolveSlideExtraTexts(post, index),
          ...(slide.extraShapes ?? []),
        ].find(e => e.id === id);
        if (item && item.width && "height" in item && item.height)
          geometry = {
            x: item.x ?? 0,
            y: item.y ?? 0,
            width: item.width,
            height: item.height,
          };
      }
      if (!geometry)
        return failed(
          post,
          "Aguarde a medição do objeto na arte para alinhá-lo."
        );
      const width = c?.artboard.width ?? 360,
        height = c?.artboard.height ?? aspectRatioHeight(post.aspectRatio, 360);
      const x =
        command.alignment === "left"
          ? 0
          : command.alignment === "center"
            ? (width - geometry.width) / 2
            : command.alignment === "right"
              ? width - geometry.width
              : geometry.x;
      const y =
        command.alignment === "top"
          ? 0
          : command.alignment === "middle"
            ? (height - geometry.height) / 2
            : command.alignment === "bottom"
              ? height - geometry.height
              : geometry.y;
      if (c && node) {
        let dx = x - geometry.x,
          dy = y - geometry.y;
        if (node.parentId) {
          const parent = c.groups.find(g => g.id === node.parentId)!;
          const world = arsenalWorldGeometry(parent, c.groups),
            scale = world.scale * parent.scale,
            angle = (-world.rotation * Math.PI) / 180;
          [dx, dy] = [
            (dx * Math.cos(angle) - dy * Math.sin(angle)) / scale,
            (dx * Math.sin(angle) + dy * Math.cos(angle)) / scale,
          ];
        }
        return success(
          storeComposition(
            post,
            index,
            overrideArsenalElement(c, id, { x: node.x + dx, y: node.y + dy })
          )
        );
      }
      return executeEditorCommand(post, target, {
        type: "properties",
        patch: { x, y },
      });
    }
    if (command.type === "properties")
      return applyProperties(
        post,
        index,
        layer,
        command.patch,
        command.geometry
      );
    return failed(post, "Operação desconhecida.");
  } catch (error) {
    return failed(
      post,
      error instanceof Error
        ? error.message
        : "Não foi possível aplicar a alteração."
    );
  }
}
function onSlide(
  post: CanvasPostModel,
  index: number,
  fn: (post: CanvasPostModel) => CanvasPostModel
): CanvasPostModel {
  return {
    ...fn({ ...post, currentSlideIndex: index }),
    currentSlideIndex: post.currentSlideIndex,
  };
}

function applyProperties(
  post: CanvasPostModel,
  index: number,
  layer: EditorLayer,
  patch: Record<string, string | number | boolean | null>,
  geometry?: EditorGeometry
): EditorCommandResult {
  const slide = post.slides[index],
    id = layer.id,
    c = slide.composition;
  const geometryKeys = ["x", "y", "width", "height", "rotation", "opacity"];
  const allowed =
    !c && ["badge", "bar"].includes(id)
      ? ["x", "y", "rotation", "scaleX", "scaleY"]
      : layer.kind === "text"
        ? [
            ...geometryKeys,
            "fontFamily",
            "fontSize",
            "fontWeight",
            "align",
            "fill",
            "lineHeight",
            "letterSpacing",
            "effect",
            "effectColor",
            "sizeScale",
          ]
        : layer.kind === "image"
          ? [...geometryKeys, "cornerRadius"]
          : layer.kind === "shape"
            ? [...geometryKeys, "fill", "stroke", "strokeWidth", "cornerRadius"]
            : layer.kind === "group"
              ? [...geometryKeys, "scale"]
              : layer.kind === "background"
                ? [
                    "fill",
                    "imageUrl",
                    "overlayOpacity",
                    "overlayColor",
                    "overlayMode",
                    "fitMode",
                    "splitBgPosition",
                  ]
                : ["x", "y", "width", "height", "opacity", "position"];
  if (Object.keys(patch).some(key => !allowed.includes(key)))
    return failed(
      post,
      "Esta propriedade não se aplica ao objeto selecionado."
    );
  if (
    Object.values(patch).some(
      value => typeof value === "number" && !Number.isFinite(value)
    )
  )
    return failed(post, "Use valores numéricos finitos.");
  for (const key of [
    "width",
    "height",
    "fontSize",
    "scale",
    "scaleX",
    "scaleY",
    "lineHeight",
    "sizeScale",
  ])
    if (
      key in patch &&
      (typeof patch[key] !== "number" || Number(patch[key]) <= 0)
    )
      return failed(post, "Dimensões e tamanhos precisam ser positivos.");
  if (
    "opacity" in patch &&
    (typeof patch.opacity !== "number" ||
      patch.opacity < 0 ||
      patch.opacity > 1)
  )
    return failed(post, "Opacidade deve estar entre 0 e 1.");
  let next = post;
  if (c) {
    let composition = c;
    if (layer.kind === "background")
      composition = setArsenalCustomBackground(
        c,
        patch as Parameters<typeof setArsenalCustomBackground>[1]
      );
    else if (layer.kind === "logo")
      return setEditorLogo(
        post,
        [slide.id],
        patch as Partial<import("@shared/designArsenal").ArsenalLogo>
      );
    else {
      const { effect, effectColor, sizeScale, ...values } = patch;
      if (sizeScale !== undefined)
        return failed(post, "Use o tamanho da fonte deste objeto.");
      composition = Object.keys(values).length
        ? overrideArsenalElement(c, id, {
            ...values,
            ...("fontFamily" in values || "fontWeight" in values
              ? { fontAssetId: null }
              : {}),
          })
        : c;
      if (effect !== undefined || effectColor !== undefined) {
        const previous = c.version === 3 ? c.effects[id] : undefined;
        const data = arsenalElementEffectSchema.parse({
          effect: effect ?? previous?.effect ?? "none",
          ...(effectColor !== undefined
            ? { color: effectColor }
            : previous?.color
              ? { color: previous.color }
              : {}),
        });
        composition = setArsenalElementEffect(composition, id, data);
      }
    }
    next = storeComposition(post, index, composition);
  } else if (id === "badge" || id === "bar") {
    const position = slide[`${id}Pos`] ?? geometry,
      transform = slide.nativeDecorationTransforms?.[id] ?? {
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
      };
    if (
      ("x" in patch || "y" in patch) &&
      !position &&
      !("x" in patch && "y" in patch)
    )
      return failed(
        post,
        "Aguarde a medição do objeto na arte para posicioná-lo."
      );
    next = updateSlideById(post, slide.id, {
      ...("x" in patch || "y" in patch
        ? {
            [`${id}Pos`]: {
              x: Number(patch.x ?? position?.x),
              y: Number(patch.y ?? position?.y),
            },
          }
        : {}),
      nativeDecorationTransforms: {
        ...slide.nativeDecorationTransforms,
        [id]: {
          scaleX: Number(patch.scaleX ?? transform.scaleX),
          scaleY: Number(patch.scaleY ?? transform.scaleY),
          rotation: Number(patch.rotation ?? transform.rotation),
        },
      },
    });
  } else if (id === "headline" || id === "subtext") {
    const title = id === "headline",
      style = { ...slide.visualStyle },
      update: Partial<CarouselSlideItem> = {};
    if ("x" in patch || "y" in patch) {
      const position = slide[`${id}Pos`] ?? geometry;
      if (!position && !("x" in patch && "y" in patch))
        return failed(
          post,
          "Aguarde a medição do texto na arte para posicioná-lo."
        );
      update[`${id}Pos`] = {
        x: Number(patch.x ?? position?.x),
        y: Number(patch.y ?? position?.y),
      };
    }
    const mapping: Record<string, string> = title
      ? {
          fontFamily: "fontFamily",
          fontWeight: "headlineFontWeight",
          align: "headlineAlign",
        }
      : {
          fontFamily: "subtextFontFamily",
          fontWeight: "subtextFontWeight",
          align: "bodyAlign",
        };
    for (const [key, value] of Object.entries(patch)) {
      if (mapping[key]) Object.assign(style, { [mapping[key]]: value });
      else if (key === "effect" || key === "effectColor" || key === "sizeScale")
        Object.assign(style, {
          [`${title ? "headline" : "subtext"}${key === "effect" ? "Effect" : key === "effectColor" ? "EffectColor" : "SizeScale"}`]:
            value,
        });
      else if (key === "width")
        Object.assign(update, { [`${id}Width`]: value });
      else if (key === "fill") {
        const effective = resolveSlideAppearance(post, index);
        const colorKey = title ? "headlineColor" : "subtextColor";
        const manualKey = title ? "manualHeadlineColor" : "manualSubtextColor";
        const automatic =
          value === null
            ? applyContrastGuard({
                ...effective,
                [manualKey]: false,
                palette: { ...effective.palette, [colorKey]: undefined },
              })
            : undefined;
        style.palette = {
          ...effective.palette,
          [colorKey]: automatic ? automatic.palette[colorKey] : String(value),
        };
        Object.assign(style, { [manualKey]: value !== null });
      } else if (!["x", "y"].includes(key))
        return failed(
          post,
          "Este ajuste do texto principal requer o controle de tamanho ou transformação na arte."
        );
    }
    next = updateSlideById(post, slide.id, { ...update, visualStyle: style });
  } else if (layer.kind === "background") {
    const effective = resolveSlideAppearance(post, index);
    const { imageUrl, fill, fitMode, splitBgPosition, ...overlay } = patch;
    if (
      fitMode !== undefined &&
      !["cover", "contain", "original", "custom"].includes(String(fitMode))
    )
      return failed(post, "Enquadramento inválido.");
    if (
      splitBgPosition !== undefined &&
      !["top", "bottom", "full"].includes(String(splitBgPosition))
    )
      return failed(post, "Posição de fundo inválida.");
    next = updateSlideById(post, slide.id, {
      ...(imageUrl !== undefined ? { bgImage: String(imageUrl ?? "") } : {}),
      ...(fitMode !== undefined
        ? {
            bgPlacement: {
              ...slide.bgPlacement,
              fitMode: fitMode as NonNullable<
                CarouselSlideItem["bgPlacement"]
              >["fitMode"],
            },
          }
        : {}),
      ...(splitBgPosition !== undefined
        ? {
            splitBgPosition:
              splitBgPosition as CarouselSlideItem["splitBgPosition"],
          }
        : {}),
      visualStyle: {
        ...slide.visualStyle,
        ...(fill !== undefined
          ? { palette: { ...effective.palette, background: String(fill) } }
          : {}),
        ...overlay,
      },
    });
  } else if (layer.kind === "logo")
    return setEditorLogo(
      post,
      [slide.id],
      patch as Partial<import("@shared/designArsenal").ArsenalLogo>
    );
  else if (slide.extraShapes?.some(s => s.id === id)) {
    if (
      Object.keys(patch).some(
        k => !["x", "y", "width", "height", "fill"].includes(k)
      )
    )
      return failed(post, "Este ajuste não está disponível para esta forma.");
    next = updateSlideById(post, slide.id, {
      extraShapes: slide.extraShapes.map(s =>
        s.id === id
          ? {
              ...s,
              ...patch,
              ...("fill" in patch ? { color: String(patch.fill) } : {}),
            }
          : s
      ) as CarouselSlideItem["extraShapes"],
    });
  } else {
    if (
      Object.keys(patch).some(k =>
        ["lineHeight", "letterSpacing", "height"].includes(k)
      ) &&
      layer.kind === "text"
    )
      return failed(
        post,
        "Este ajuste não está disponível para este texto livre."
      );
    const { fill, ...rest } = patch;
    next = onSlide(post, index, p =>
      updateExtraElement(p, id, {
        ...rest,
        ...(fill !== undefined ? { color: String(fill) } : {}),
      } as Parameters<typeof updateExtraElement>[2])
    );
  }
  return { ok: true, post: next, selection: layer.target };
}

/** Explicit slide IDs and binding roles, never largest-font heuristics. */
export function applyEditorTypography(
  post: CanvasPostModel,
  slideIds: readonly string[],
  role: Exclude<EditorRole, "decoration">,
  fontFamily: string
): EditorCommandResult {
  if (!fontFamily.trim() || fontFamily.length > 120)
    return failed(post, "Escolha uma família tipográfica válida.");
  if (
    !slideIds.length ||
    slideIds.some(id => !post.slides.some(s => s.id === id))
  )
    return failed(post, "Um slide de destino não existe mais.");
  let next = post,
    changed = false;
  try {
    for (const slideId of Array.from(new Set(slideIds))) {
      const index = next.slides.findIndex(s => s.id === slideId),
        slide = next.slides[index];
      if (slide.composition) {
        let c = slide.composition;
        if (post.userFonts?.length) {
          const upgraded = upgradeCompositionToV3(c);
          c = {
            ...upgraded,
            userFonts: Array.from(
              new Map(
                [...upgraded.userFonts, ...post.userFonts].map(font => [
                  font.family,
                  structuredClone(font),
                ])
              ).values()
            ),
          };
        }
        for (const element of c.elements)
          if (
            element.kind === "text" &&
            (role === "content"
              ? compositionRole(c, element) !== "decoration"
              : compositionRole(c, element) === role) &&
            !getEditorElementState(next, slideId, element.id).locked
          ) {
            c = overrideArsenalElement(c, element.id, {
              fontFamily,
              fontAssetId: null,
            });
            changed = true;
          }
        next = storeComposition(next, index, c);
      } else if (role === "headline" || role === "body") {
        if (
          getEditorElementState(
            next,
            slideId,
            role === "headline" ? "headline" : "subtext"
          ).locked
        )
          continue;
        next = updateSlideById(next, slideId, {
          visualStyle: {
            ...slide.visualStyle,
            [role === "headline" ? "fontFamily" : "subtextFontFamily"]:
              fontFamily,
          },
        });
        changed = true;
      } else {
        const visualStyle = { ...slide.visualStyle };
        if (!getEditorElementState(next, slideId, "headline").locked)
          visualStyle.fontFamily = fontFamily;
        if (!getEditorElementState(next, slideId, "subtext").locked)
          visualStyle.subtextFontFamily = fontFamily;
        const extraTexts = resolveSlideExtraTexts(next, index).map(text =>
          getEditorElementState(next, slideId, text.id).locked
            ? text
            : { ...text, fontFamily }
        );
        next = updateSlideById(next, slideId, { extraTexts, visualStyle });
        changed ||=
          extraTexts.length > 0 ||
          Object.keys(visualStyle).length >
            Object.keys(slide.visualStyle ?? {}).length ||
          visualStyle.fontFamily !== slide.visualStyle?.fontFamily ||
          visualStyle.subtextFontFamily !==
            slide.visualStyle?.subtextFontFamily;
      }
    }
    return changed
      ? { ok: true, post: next }
      : failed(
          post,
          "Nenhum texto editável com esse papel foi encontrado nos slides escolhidos."
        );
  } catch (error) {
    return failed(
      post,
      error instanceof Error
        ? error.message
        : "Não foi possível trocar a fonte."
    );
  }
}

/** Only advertise fields consumed by the renderer for this exact object type. */
export function resolveEditorProperties(
  post: CanvasPostModel,
  target: EditorTarget
): {
  values: Record<string, string | number | boolean | null>;
  supported: string[];
} {
  const index = post.slides.findIndex(s => s.id === target.slideId),
    slide = post.slides[index],
    id = target.elementId;
  if (!slide) return { values: {}, supported: [] };
  const c = slide.composition,
    effective = resolveSlideAppearance(post, index);
  let raw: Record<string, unknown> = {},
    supported: string[] = [];
  if (c) {
    const node = [...c.elements, ...c.groups].find(e => e.id === id);
    if (node) {
      raw = {
        ...node,
        ...(c.version === 3 && c.effects[id]
          ? { effect: c.effects[id].effect, effectColor: c.effects[id].color }
          : {}),
      };
      supported = ["x", "y", "width", "height", "rotation", "opacity"];
      if ("kind" in node)
        supported.push(
          ...(node.kind === "text"
            ? [
                "fontFamily",
                "fontSize",
                "fontWeight",
                "align",
                "fill",
                "lineHeight",
                "letterSpacing",
                "effect",
                "effectColor",
              ]
            : node.kind === "media"
              ? ["cornerRadius"]
              : ["fill", "stroke", "strokeWidth", "cornerRadius"])
        );
      else supported.push("scale");
    } else if (id === COMPOSITION_BACKGROUND_ID) {
      raw = {
        fill: c.artboard.background,
        fitMode: "cover",
        overlayOpacity: 0,
        overlayColor: "#000000",
        overlayMode: "gradient-bottom",
        ...(c.version === 3 ? c.customBackground : {}),
      };
      supported = [
        "fill",
        "imageUrl",
        "fitMode",
        "overlayOpacity",
        "overlayColor",
        "overlayMode",
      ];
    } else if (id === COMPOSITION_LOGO_ID && c.version === 3 && c.logo) {
      raw = { ...c.logo };
      supported = ["x", "y", "width", "height", "opacity", "position"];
    }
  } else if (id === "badge" || id === "bar") {
    raw = {
      ...slide[`${id}Pos`],
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      ...slide.nativeDecorationTransforms?.[id],
    };
    supported = ["x", "y", "rotation", "scaleX", "scaleY"];
  } else if (id === "headline" || id === "subtext") {
    const title = id === "headline";
    raw = {
      ...slide[`${id}Pos`],
      width: slide[`${id}Width`],
      fontFamily: title
        ? effective.fontFamily
        : (effective.subtextFontFamily ?? effective.fontFamily),
      fontWeight:
        (title ? effective.headlineFontWeight : effective.subtextFontWeight) ??
        400,
      fill:
        (title
          ? effective.palette.headlineColor
          : effective.palette.subtextColor) ?? effective.palette.text,
      align: title ? effective.headlineAlign : effective.bodyAlign,
      effect:
        (title ? effective.headlineEffect : effective.subtextEffect) ?? "none",
      effectColor: title
        ? effective.headlineEffectColor
        : effective.subtextEffectColor,
      sizeScale:
        (title ? effective.headlineSizeScale : effective.subtextSizeScale) ?? 1,
    };
    supported = [
      "x",
      "y",
      "width",
      "fontFamily",
      "fontWeight",
      "fill",
      "align",
      "effect",
      "effectColor",
      "sizeScale",
    ];
  } else if (id === "background") {
    raw = {
      fill: effective.palette.background,
      imageUrl: slide.bgImage ?? post.bgImage ?? "",
      fitMode:
        slide.bgPlacement?.fitMode ?? post.bgPlacement?.fitMode ?? "cover",
      splitBgPosition:
        slide.splitBgPosition ?? post.splitBgPosition ?? "bottom",
      overlayOpacity: effective.overlayOpacity,
      overlayColor: effective.overlayColor ?? "#000000",
      overlayMode: effective.overlayMode ?? "gradient-bottom",
    };
    supported = [
      "fill",
      "imageUrl",
      "fitMode",
      "overlayOpacity",
      "overlayColor",
      "overlayMode",
      ...(effective.familyId === "brutal-split" ? ["splitBgPosition"] : []),
    ];
  } else if (id === "logo") {
    raw = {
      url: post.logoUrl,
      position: post.logoPosition,
      opacity: 1,
      ...slide.logoPos,
      ...slide.logo,
    };
    supported = ["x", "y", "width", "height", "opacity", "position"];
  } else {
    const text = resolveSlideExtraTexts(post, index).find(e => e.id === id),
      image = resolveSlideExtraImages(post, index).find(e => e.id === id),
      shape = slide.extraShapes?.find(e => e.id === id);
    if (text) {
      raw = {
        ...text,
        fill: text.color ?? effective.palette.text,
        fontFamily: text.fontFamily ?? effective.fontFamily,
        fontSize: text.fontSize ?? 24,
        fontWeight: text.fontWeight ?? 400,
        opacity: text.opacity ?? 1,
        rotation: text.rotation ?? 0,
      };
      supported = [
        "x",
        "y",
        "width",
        "rotation",
        "opacity",
        "fontFamily",
        "fontSize",
        "fontWeight",
        "align",
        "fill",
        "effect",
        "effectColor",
      ];
    } else if (image) {
      raw = {
        ...image,
        opacity: image.opacity ?? 1,
        rotation: image.rotation ?? 0,
      };
      supported = [
        "x",
        "y",
        "width",
        "height",
        "rotation",
        "opacity",
        "cornerRadius",
      ];
    } else if (shape) {
      raw = { ...shape, fill: shape.color };
      supported = ["x", "y", "width", "height", "fill"];
    }
  }
  const values = Object.fromEntries(
    supported.flatMap(key => {
      const value = raw[key];
      return typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean" ||
        value === null
        ? [[key, value]]
        : [];
    })
  );
  return { values, supported };
}

/** Brand replication carries only brand data, never a source slide's copy or media. */
export function setEditorLogo(
  post: CanvasPostModel,
  slideIds: readonly string[],
  patch: Partial<import("@shared/designArsenal").ArsenalLogo>
): EditorCommandResult {
  if (
    !slideIds.length ||
    slideIds.some(id => !post.slides.some(s => s.id === id))
  )
    return failed(post, "Um slide de destino não existe mais.");
  let next = post;
  try {
    for (const slideId of Array.from(new Set(slideIds))) {
      const index = next.slides.findIndex(s => s.id === slideId),
        slide = next.slides[index],
        c = slide.composition;
      if (
        getEditorElementState(next, slideId, c ? COMPOSITION_LOGO_ID : "logo")
          .locked
      )
        return failed(post, "Desbloqueie o logo no slide de destino.");
      const previous = c ? (c.version === 3 ? c.logo : undefined) : slide.logo;
      const logo = arsenalLogoSchema.parse({
        url: post.logoUrl ?? "",
        position: post.logoPosition,
        ...previous,
        ...patch,
        ...(patch.x !== undefined || patch.y !== undefined
          ? { position: "custom" }
          : {}),
      });
      next = c
        ? storeComposition(
            next,
            index,
            setArsenalLogo(c, logo.url ? logo : undefined)
          )
        : updateSlideById(next, slideId, { logo });
    }
    return {
      ok: true,
      post: next,
      ...(slideIds.length === 1
        ? {
            selection:
              patch.url === ""
                ? null
                : {
                    slideId: slideIds[0],
                    elementId: next.slides.find(s => s.id === slideIds[0])
                      ?.composition
                      ? COMPOSITION_LOGO_ID
                      : "logo",
                  },
          }
        : {}),
    };
  } catch (error) {
    return failed(
      post,
      error instanceof Error
        ? error.message
        : "Não foi possível aplicar a marca."
    );
  }
}

export function resolveEditorList(
  post: CanvasPostModel,
  target: EditorTarget
): { source: string; items: Array<{ id: string; text: string }> } | undefined {
  const c = post.slides.find(s => s.id === target.slideId)?.composition;
  if (!c) return;
  const element = c.elements.find(e => e.id === target.elementId),
    binding = c.base.bindings.find(
      b => b.id === element?.bindingId || b.targetIds.includes(target.elementId)
    );
  if (binding?.kind !== "list") return;
  return {
    source: binding.source,
    items: structuredClone(contentListItems(c.content, binding.source)),
  };
}

/** Explicit palette scope; a color with no editable recipient yields an actionable result. */
export function applyEditorPalette(
  post: CanvasPostModel,
  slideIds: readonly string[],
  patch: Partial<import("../components/types").CanvasPostPalette>
): EditorCommandResult {
  if (
    !slideIds.length ||
    slideIds.some(id => !post.slides.some(s => s.id === id))
  )
    return failed(post, "Um slide de destino não existe mais.");
  if (
    Object.values(patch).some(
      color =>
        color !== undefined &&
        (typeof color !== "string" || !/^#[a-f\d]{6}$/i.test(color))
    )
  )
    return failed(post, "Escolha cores no formato hexadecimal.");
  let next = post,
    changed = false;
  try {
    for (const slideId of Array.from(new Set(slideIds))) {
      const index = next.slides.findIndex(s => s.id === slideId),
        slide = next.slides[index],
        previous = resolveSlideAppearance(next, index).palette,
        palette = { ...previous, ...patch };
      if (slide.composition) {
        const result = applyArsenalPalette(
          slide.composition,
          previous,
          palette
        );
        if (!result.changed) continue;
        next = storeComposition(next, index, result.composition);
        next = updateSlideById(next, slideId, {
          visualStyle: { ...slide.visualStyle, palette },
        });
        changed = true;
      } else {
        next = updateSlideById(next, slideId, {
          visualStyle: { ...slide.visualStyle, palette },
        });
        changed = true;
      }
    }
    return changed
      ? { ok: true, post: next }
      : failed(
          post,
          "Nenhum objeto editável usa essa cor neste slide; ajuste a cor do objeto pela seleção."
        );
  } catch (error) {
    return failed(
      post,
      error instanceof Error
        ? error.message
        : "Não foi possível aplicar a paleta."
    );
  }
}
