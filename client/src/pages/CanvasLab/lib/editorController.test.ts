import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { INITIAL_POST, type CanvasPostModel } from "../components/types";
import { createArsenalFixtureComposition } from "./arsenalFixture";
import {
  addArsenalAuthorialLayer,
  putArsenalComposition,
  resolveArsenalComposition,
} from "./arsenalComposition";
import {
  applyEditorTypography,
  applyEditorPalette,
  executeEditorCommand,
  getArsenalElementState,
  projectEditorLayers,
  resolveEditorSelection,
  resolveEditorList,
  setEditorLogo,
  COMPOSITION_BACKGROUND_ID,
  COMPOSITION_LOGO_ID,
} from "./editorController";
import { duplicateSlide, reorderSlides } from "./documentCommands";
import {
  canvasModelToSavePayload,
  savedPostToCanvasModel,
} from "./saveAdapter";
import { validateArsenalSaveModel } from "../../../../../server/designCatalog/arsenalSave";
import {
  compositionToPortableRecipe,
  readPortableArsenalRecipe,
} from "@shared/arsenalRecipe";
import { readArsenalComposition } from "@shared/designArsenal";
import {
  applyMediaOperation,
  imageRequestForTarget,
  mediaTargets,
} from "./mediaSlots";
const original = Object.getOwnPropertyDescriptor(globalThis, "document");
beforeAll(() =>
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { createElement: () => createCanvas(20, 20) },
  })
);
afterAll(() => {
  if (original) Object.defineProperty(globalThis, "document", original);
  else Reflect.deleteProperty(globalThis, "document");
});
const native = (): CanvasPostModel => ({
  ...structuredClone(INITIAL_POST),
  slides: [
    {
      id: "first",
      step: "1",
      headline: "Título rico",
      subtext: "Corpo",
      headlineRich: [{ text: "Título rico", bold: true, color: "#ff0000" }],
      extraTexts: [{ id: "free", text: "Meu texto", x: 12, y: 22, width: 120 }],
      extraImages: [
        { id: "photo", url: "old.png", x: 10, y: 20, width: 90, height: 120 },
      ],
    },
  ],
});
const composed = () =>
  putArsenalComposition(
    { ...structuredClone(INITIAL_POST), aspectRatio: "5:6" },
    createArsenalFixtureComposition()
  );
const command = (
  post: CanvasPostModel,
  id: string,
  type: Parameters<typeof executeEditorCommand>[2]
) =>
  executeEditorCommand(
    post,
    { slideId: post.slides[0].id, elementId: id },
    type
  );
const roundtrip = (post: CanvasPostModel) => {
  const payload = canvasModelToSavePayload(post, {
    inputType: "text",
    inputContent: "teste",
  });
  validateArsenalSaveModel(payload.canvasModel);
  return savedPostToCanvasModel({
    id: 1,
    canvas_model: JSON.parse(JSON.stringify(payload.canvasModel)),
  });
};

describe("single-document editor intentions", () => {
  it("captures slide IDs and preserves rich text when the alternate input is edited", () => {
    let post = duplicateSlide(native(), 0);
    post = reorderSlides(post, 0, 1);
    post.currentSlideIndex = 0;
    const result = executeEditorCommand(
      post,
      { slideId: "first", elementId: "headline" },
      { type: "text", text: "Título rico!" }
    );
    expect(result.ok).toBe(true);
    expect(result.post.currentSlideIndex).toBe(0);
    expect(result.post.slides[1].headline).toBe("Título rico!");
    expect(result.post.slides[0].headline).toBe("Título rico");
    expect(result.post.slides[1].headlineRich).toEqual([
      expect.objectContaining({
        text: "Título rico!",
        bold: true,
        color: "#ff0000",
      }),
    ]);
    const gone = executeEditorCommand(
      result.post,
      { slideId: "removed", elementId: "headline" },
      { type: "text", text: "errado" }
    );
    expect(gone).toMatchObject({ ok: false, post: result.post });
  });
  it("keeps hidden native objects reachable, persists states and remaps cloned extra IDs", () => {
    let post = command(native(), "free", {
      type: "visibility",
      visible: false,
    }).post;
    post = command(post, "free", { type: "lock", locked: true }).post;
    expect(
      resolveEditorSelection(post, { slideId: "first", elementId: "free" })
    ).toMatchObject({ visible: false, locked: true });
    expect(command(post, "free", { type: "remove" }).ok).toBe(false);
    const reopened = roundtrip(post);
    expect(reopened.slides[0].elementStates?.free).toEqual({
      hidden: true,
      locked: true,
    });
    const cloned = duplicateSlide(reopened, 0);
    const newId = cloned.slides[1].extraTexts![0].id;
    expect(newId).not.toBe("free");
    expect(cloned.slides[1].elementStates?.[newId]).toEqual({
      hidden: true,
      locked: true,
    });
    expect(cloned.slides[1].elementStates?.free).toBeUndefined();
    post = command(post, "free", { type: "lock", locked: false }).post;
    post = command(post, "free", { type: "visibility", visible: true }).post;
    expect(post.slides[0].extraTexts![0].text).toBe("Meu texto");
  });
  it("reorders native objects together with images and reopens the same order", () => {
    const result = command(native(), "headline", {
      type: "reorder",
      direction: "front",
    });
    expect(result.ok).toBe(true);
    expect(projectEditorLayers(result.post, "first").at(-1)?.id).toBe(
      "headline"
    );
    expect(roundtrip(result.post).slides[0].elementOrder).toEqual(
      result.post.slides[0].elementOrder
    );
  });
  it("aligns conventional objects using canonical geometry independent of zoom", () => {
    const result = command(native(), "free", {
      type: "align",
      alignment: "center",
      geometry: { x: 12, y: 22, width: 120, height: 30 },
    });
    expect(result.post.slides[0].extraTexts![0].x).toBe(120);
    const duplicate = command(native(), "headline", {
      type: "duplicate",
      geometry: { x: 24, y: 100, width: 300, height: 50, fontSize: 32 },
    });
    expect(duplicate.ok).toBe(true);
    const text = duplicate.post.slides[0].extraTexts!.at(-1)!;
    expect(text).toMatchObject({
      x: 48,
      y: 124,
      fontSize: 32,
      text: "Título rico",
    });
    expect(text.textRich?.[0].bold).toBe(true);
  });
  it("hides authorial composition layers without removing bindings, content, assets or relationships", () => {
    let post = composed();
    const original = post.slides[0].composition!;
    post = putArsenalComposition(
      post,
      addArsenalAuthorialLayer(original, {
        id: "authored",
        kind: "text",
        parentId: null,
        zIndex: 100,
        x: 10,
        y: 20,
        width: 160,
        height: 50,
        rotation: 0,
        opacity: 1,
        text: "Texto autoral",
      })
    );
    post = command(post, "authored", {
      type: "visibility",
      visible: false,
    }).post;
    post = command(post, "authored", { type: "lock", locked: true }).post;
    const c = readArsenalComposition(roundtrip(post).slides[0].composition);
    expect(c.version).toBe(3);
    expect(c.elements.some(e => e.id === "authored")).toBe(true);
    expect(c.assets).toEqual(original.assets);
    expect(c.relations).toEqual(original.relations);
    expect(c.content).toEqual(original.content);
    expect(getArsenalElementState(c, "authored")).toEqual({
      visible: false,
      locked: true,
    });
    const recipe = readPortableArsenalRecipe(compositionToPortableRecipe(c));
    expect(JSON.stringify(recipe)).toContain("elementStates");
    const cloned = duplicateSlide(post, 0).slides[1].composition!;
    const authored =
      cloned.version === 3 ? cloned.authorialLayers[0] : undefined;
    expect(authored?.id).not.toBe("authored");
    expect(cloned.elementStates?.[authored!.id]).toEqual({
      hidden: true,
      locked: true,
    });
  });
  it("inherits group locks/visibility and leaves selection accessible to Camadas", () => {
    let post = composed();
    const c = post.slides[0].composition!;
    const group = c.groups.find(g =>
      c.elements.some(e => e.parentId === g.id)
    )!;
    expect(group).toBeTruthy();
    const child = c.elements.find(e => e.parentId === group.id)!;
    post = command(post, group.id, { type: "visibility", visible: false }).post;
    post = command(post, group.id, { type: "lock", locked: true }).post;
    expect(
      getArsenalElementState(post.slides[0].composition!, child.id)
    ).toEqual({ visible: false, locked: true });
    expect(command(post, child.id, { type: "text", text: "não" }).ok).toBe(
      false
    );
    expect(
      resolveEditorSelection(post, {
        slideId: post.slides[0].id,
        elementId: child.id,
      })?.locked
    ).toBe(true);
  });
  it("duplicates a bound text as isolated authorial text and keeps original pinned hashes", () => {
    const post = composed(),
      c = post.slides[0].composition!,
      text = c.elements.find(e => e.kind === "text" && e.bindingId)!;
    const result = command(post, text.id, { type: "duplicate" });
    expect(result.ok).toBe(true);
    const duplicate = result.post.slides[0].composition!;
    readArsenalComposition(duplicate);
    expect(duplicate.origin.variantHash).toBe(c.origin.variantHash);
    expect(duplicate.base).toEqual(c.base);
    const newId = result.selection!.elementId;
    expect(duplicate.elements.find(e => e.id === newId)?.text).toBe(text.text);
    const changed = executeEditorCommand(result.post, result.selection!, {
      type: "text",
      text: "Só a cópia",
    });
    expect(changed.ok).toBe(true);
    expect(
      changed.post.slides[0].composition!.elements.find(e => e.id === text.id)
        ?.text
    ).toBe(text.text);
  });
  it("changes actual rendered content fonts by semantic roles, preserving ornament, color and chunks", () => {
    const post = composed(),
      c = post.slides[0].composition!;
    const result = applyEditorTypography(
      post,
      [post.slides[0].id],
      "content",
      "Georgia"
    );
    expect(result.ok).toBe(true);
    const next = readArsenalComposition(result.post.slides[0].composition);
    for (const element of c.elements.filter(e => e.kind === "text")) {
      const newElement = next.elements.find(e => e.id === element.id)!;
      expect(newElement.fill).toBe(element.fill);
      expect(newElement.text).toBe(element.text);
      const binding = c.base.bindings.find(
        b => b.id === element.bindingId || b.targetIds.includes(element.id)
      );
      expect(newElement.fontFamily).toBe(
        binding ? "Georgia" : element.fontFamily
      );
    }
    expect(roundtrip(result.post).slides[0].composition!.elements).toEqual(
      next.elements
    );
    const plain = applyEditorTypography(
      native(),
      ["first"],
      "content",
      "Georgia"
    );
    expect(plain.post.slides[0].visualStyle).toMatchObject({
      fontFamily: "Georgia",
      subtextFontFamily: "Georgia",
    });
  });
  it("returns a recoverable failure for unsupported or invalid properties without a partial mutation", () => {
    const post = native();
    expect(
      command(post, "headline", { type: "properties", patch: { opacity: 0.5 } })
    ).toMatchObject({ ok: false, post });
    expect(
      command(post, "photo", { type: "properties", patch: { width: -1 } })
    ).toMatchObject({ ok: false, post });
  });
  it("replaces and frames a captured extra image after changing slide, rejecting deleted targets", () => {
    const post = native(),
      target = { postId: post.id, slideId: "first", slotId: "photo" };
    const later = duplicateSlide(post, 0);
    expect(mediaTargets(post).some(t => t.id === "photo")).toBe(true);
    let result = applyMediaOperation(later, target, {
      kind: "apply",
      url: "new.png",
    })!;
    result = applyMediaOperation(result, target, {
      kind: "focal",
      focalX: 0.2,
      focalY: 0.8,
    })!;
    result = applyMediaOperation(result, target, {
      kind: "prompt",
      prompt: "Meu produto",
    })!;
    expect(result.currentSlideIndex).toBe(1);
    expect(result.slides[0].extraImages![0]).toMatchObject({
      url: "new.png",
      focalX: 0.2,
      focalY: 0.8,
      imagePrompt: "Meu produto",
    });
    expect(result.slides[1].extraImages![0].url).toBe("old.png");
    expect(
      imageRequestForTarget(result, target, "Foto").aspectRatio
    ).toBeTruthy();
    expect(roundtrip(result).slides[0].extraImages![0]).toMatchObject({
      focalX: 0.2,
      focalY: 0.8,
    });
    const removed = applyMediaOperation(result, target, { kind: "remove" })!;
    expect(
      applyMediaOperation(removed, target, { kind: "apply", url: "late.png" })
    ).toBeNull();
  });
  it("preserves list structure, item identity and selection while adding, editing and moving items", () => {
    let post = composed();
    const c = post.slides[0].composition!,
      element = c.elements.find(e => e.itemId)!;
    const target = { slideId: post.slides[0].id, elementId: element.id };
    expect(resolveEditorList(post, target)?.items).toHaveLength(4);
    let result = executeEditorCommand(post, target, {
      type: "list",
      action: "add",
      text: "Novo item",
    });
    expect(result.ok).toBe(true);
    post = result.post;
    const item = resolveEditorList(post, target)!.items.at(-1)!;
    result = executeEditorCommand(post, target, {
      type: "list",
      action: "move",
      itemId: item.id,
      destination: 0,
    });
    expect(result.ok).toBe(true);
    post = result.post;
    expect(resolveEditorList(post, target)!.items[0]).toEqual(item);
    result = executeEditorCommand(post, target, {
      type: "list",
      action: "text",
      itemId: item.id,
      text: "Item editado",
    });
    expect(result.ok).toBe(true);
    post = result.post;
    result = executeEditorCommand(post, target, {
      type: "list",
      action: "remove",
      itemId: item.id,
    });
    expect(result.ok).toBe(true);
    expect(result.selection).toEqual(target);
    expect(
      resolveEditorList(roundtrip(result.post), target)!.items
    ).toHaveLength(4);
  });
  it("places and replicates logo overrides alone, preserving each slide copy and image", () => {
    const post = duplicateSlide(native(), 0),
      ids = post.slides.map(s => s.id);
    const result = setEditorLogo(post, ids, {
      url: "logo.png",
      position: "bottom-right",
      width: 90,
      opacity: 0.7,
    });
    expect(result.ok).toBe(true);
    expect(result.post.slides.map(s => s.headline)).toEqual(
      post.slides.map(s => s.headline)
    );
    expect(result.post.slides.map(s => s.extraImages)).toEqual(
      post.slides.map(s => s.extraImages)
    );
    const target = { slideId: ids[0], elementId: "logo" };
    const placed = executeEditorCommand(result.post, target, {
      type: "properties",
      patch: { x: 10, y: 20 },
    });
    expect(placed.ok).toBe(true);
    expect(placed.post.slides[0].logo).toMatchObject({
      position: "custom",
      x: 10,
      y: 20,
    });
    expect(roundtrip(placed.post).slides[0].logo).toEqual(
      placed.post.slides[0].logo
    );
    const removed = executeEditorCommand(placed.post, target, {
      type: "remove",
    });
    expect(removed.ok).toBe(true);
    expect(resolveEditorSelection(removed.post, target)).toBeUndefined();
    expect(removed.post.slides[1].logo?.url).toBe("logo.png");
    const comp = composed(),
      brand = setEditorLogo(comp, [comp.slides[0].id], { url: "brand.png" });
    expect(brand.ok).toBe(true);
    expect(brand.selection?.elementId).toBe(COMPOSITION_LOGO_ID);
    const hidden = command(brand.post, COMPOSITION_LOGO_ID, {
      type: "visibility",
      visible: false,
    });
    expect(hidden.ok).toBe(true);
    validateArsenalSaveModel(roundtrip(hidden.post));
  });
  it("applies contextual legibility effects and preserves native decorative transformations", () => {
    let post = native();
    post.showBadge = true;
    post.badgeText = "Oferta";
    const result = command(post, "headline", {
      type: "properties",
      patch: { effect: "shadow", effectColor: "#ff0000", sizeScale: 1.2 },
    });
    expect(result.ok).toBe(true);
    expect(result.post.slides[0].visualStyle).toMatchObject({
      headlineEffect: "shadow",
      headlineEffectColor: "#ff0000",
      headlineSizeScale: 1.2,
    });
    const badge = command(post, "badge", {
      type: "properties",
      patch: { scaleX: 1.5, scaleY: 1.5, rotation: 10 },
    });
    expect(badge.ok).toBe(true);
    expect(badge.post.slides[0].nativeDecorationTransforms?.badge).toEqual({
      scaleX: 1.5,
      scaleY: 1.5,
      rotation: 10,
    });
    const comp = composed(),
      text = comp.slides[0].composition!.elements.find(e => e.kind === "text")!;
    const effect = command(comp, text.id, {
      type: "properties",
      patch: { effect: "outline", effectColor: "#ff0000" },
    });
    expect(effect.ok).toBe(true);
    const c = roundtrip(effect.post).slides[0].composition!;
    expect(c.version === 3 && c.effects[text.id]).toMatchObject({
      effect: "outline",
      color: "#ff0000",
    });
  });
  it("persists background framing and overlay controls in both document models", () => {
    const post = native(),
      result = command(post, "background", {
        type: "properties",
        patch: {
          fitMode: "contain",
          overlayMode: "solid",
          overlayColor: "#123456",
          overlayOpacity: 0.25,
        },
      });
    expect(result.ok).toBe(true);
    const saved = roundtrip(result.post).slides[0];
    expect(saved.bgPlacement?.fitMode).toBe("contain");
    expect(saved.visualStyle).toMatchObject({
      overlayMode: "solid",
      overlayColor: "#123456",
      overlayOpacity: 0.25,
    });
    const comp = command(composed(), COMPOSITION_BACKGROUND_ID, {
      type: "properties",
      patch: { fitMode: "contain", overlayOpacity: 0.25 },
    });
    expect(comp.ok).toBe(true);
    const c = roundtrip(comp.post).slides[0].composition!;
    expect(c.version === 3 && c.customBackground).toMatchObject({
      fitMode: "contain",
      overlayOpacity: 0.25,
    });
  });
  it("reapplies palette colors after reopening while preserving manual fills and pinned catalogue identity", () => {
    let post = composed();
    const c = post.slides[0].composition!,
      texts = c.elements.filter(e => e.kind === "text" && e.bindingId),
      manual = texts[0],
      automatic = texts[1];
    post = executeEditorCommand(
      post,
      { slideId: post.slides[0].id, elementId: manual.id },
      { type: "properties", patch: { fill: "#aa0011" } }
    ).post;
    let result = applyEditorPalette(post, [post.slides[0].id], {
      text: "#123abc",
    });
    expect(result.ok).toBe(true);
    post = roundtrip(result.post);
    let next = post.slides[0].composition!;
    expect(next.elements.find(e => e.id === manual.id)?.fill).toBe("#aa0011");
    expect(next.elements.find(e => e.id === automatic.id)?.fill).toBe(
      "#123abc"
    );
    result = applyEditorPalette(post, [post.slides[0].id], { text: "#abc123" });
    expect(result.ok).toBe(true);
    post = roundtrip(result.post);
    next = post.slides[0].composition!;
    expect(next.elements.find(e => e.id === automatic.id)?.fill).toBe(
      "#abc123"
    );
    expect(next.elements.find(e => e.id === manual.id)?.fill).toBe("#aa0011");
    expect(next.origin.variantHash).toBe(c.origin.variantHash);
    expect(next.base).toEqual(c.base);
    post = executeEditorCommand(
      post,
      { slideId: post.slides[0].id, elementId: automatic.id },
      { type: "properties", patch: { fill: "#abc123" } }
    ).post;
    result = applyEditorPalette(post, [post.slides[0].id], { text: "#111222" });
    expect(result.ok).toBe(true);
    expect(
      result.post.slides[0].composition!.elements.find(
        e => e.id === automatic.id
      )?.fill
    ).toBe("#abc123");
  });
  it("rejects showing or unlocking an object while its ancestor still imposes that state", () => {
    let post = composed();
    const c = post.slides[0].composition!;
    const group = c.groups.find(group =>
      c.elements.some(element => element.parentId === group.id)
    )!;
    const child = c.elements.find(element => element.parentId === group.id)!;
    const target = { slideId: post.slides[0].id, elementId: child.id };
    post = command(post, group.id, { type: "visibility", visible: false }).post;
    post = command(post, group.id, { type: "lock", locked: true }).post;
    const layer = resolveEditorSelection(post, target)!;
    expect(layer).toMatchObject({
      visible: false,
      locked: true,
      hiddenByAncestorId: group.id,
      lockedByAncestorId: group.id,
      capabilities: { visibility: false, lock: false },
    });
    expect(layer.visibilityUnavailableReason).toContain(group.label);
    expect(layer.lockUnavailableReason).toContain(group.label);
    const shown = executeEditorCommand(post, target, {
      type: "visibility",
      visible: true,
    });
    expect(shown).toMatchObject({
      ok: false,
      reason: layer.visibilityUnavailableReason,
    });
    expect(shown.post).toBe(post);
    const unlocked = executeEditorCommand(post, target, {
      type: "lock",
      locked: false,
    });
    expect(unlocked).toMatchObject({
      ok: false,
      reason: layer.lockUnavailableReason,
    });
    expect(unlocked.post).toBe(post);
    expect(
      post.slides[0].composition!.elementStates?.[child.id]
    ).toBeUndefined();
    post = command(post, group.id, { type: "visibility", visible: true }).post;
    post = command(post, group.id, { type: "lock", locked: false }).post;
    const available = resolveEditorSelection(post, target)!;
    expect(available).toMatchObject({
      visible: true,
      locked: false,
      capabilities: { visibility: true, lock: true },
    });
    expect(available.visibilityUnavailableReason).toBeUndefined();
    expect(available.lockUnavailableReason).toBeUndefined();
    post = executeEditorCommand(post, target, {
      type: "visibility",
      visible: false,
    }).post;
    post = executeEditorCommand(post, target, {
      type: "lock",
      locked: true,
    }).post;
    expect(
      executeEditorCommand(post, target, { type: "visibility", visible: true })
        .ok
    ).toBe(true);
    expect(
      executeEditorCommand(post, target, { type: "lock", locked: false }).ok
    ).toBe(true);
  });
  it("projects one native badge and edits the content actually shown without changing another slide", () => {
    let post = duplicateSlide(native(), 0);
    post.showStep = true;
    post.showBadge = true;
    post.badgeText = "   ";
    const target = { slideId: post.slides[0].id, elementId: "badge" };
    let layer = resolveEditorSelection(post, target)!;
    expect(layer).toMatchObject({
      text: "1",
      label: "Etapa do slide",
      capabilities: { editText: true },
    });
    const result = executeEditorCommand(post, target, {
      type: "text",
      text: "PASSO UM",
    });
    expect(result.ok).toBe(true);
    post = result.post;
    expect(post.slides[0].step).toBe("PASSO UM");
    expect(post.slides[1].step).toBe("1");
    expect(post.badgeText).toBe("   ");
    post = {
      ...post,
      slides: post.slides.map((slide, index) =>
        index
          ? slide
          : { ...slide, visualStyle: { showBadge: true, badgeText: "OFERTA" } }
      ),
    };
    layer = resolveEditorSelection(post, target)!;
    expect(layer).toMatchObject({
      text: "OFERTA",
      label: "Selo",
      capabilities: { editText: true },
    });
    const edited = executeEditorCommand(post, target, {
      type: "text",
      text: "NOVIDADE",
    });
    expect(edited.ok).toBe(true);
    expect(edited.post.slides[0].visualStyle?.badgeText).toBe("NOVIDADE");
    expect(edited.post.slides[0].step).toBe("PASSO UM");
    expect(edited.post.badgeText).toBe("   ");
    expect(
      projectEditorLayers(edited.post, target.slideId).filter(
        layer => layer.id === "badge"
      )
    ).toHaveLength(1);
    expect(roundtrip(edited.post).slides[0].visualStyle?.badgeText).toBe(
      "NOVIDADE"
    );
    const single = native();
    single.showBadge = true;
    single.showStep = true;
    single.badgeText = "";
    expect(
      resolveEditorSelection(single, {
        slideId: single.slides[0].id,
        elementId: "badge",
      })
    ).toBeUndefined();
  });
});

it("restaura a cor automática somente do texto escolhido", () => {
  const post = structuredClone(INITIAL_POST);
  post.palette = { ...post.palette, background: "#111111", headlineColor: "#111111", subtextColor: "#ff3344" };
  post.manualHeadlineColor = true;
  post.manualSubtextColor = true;
  const result = executeEditorCommand(post, { slideId: post.slides[0].id, elementId: "headline" }, { type: "properties", patch: { fill: null } });
  expect(result.ok).toBe(true);
  const style = result.post.slides[0].visualStyle!;
  expect(style.manualHeadlineColor).toBe(false);
  expect(style.palette?.headlineColor).not.toBe("#111111");
  expect(style.palette?.headlineColor).not.toBe("null");
  expect(style.palette?.subtextColor).toBe("#ff3344");
  expect(result.post.slides[1]).toEqual(post.slides[1]);
});
