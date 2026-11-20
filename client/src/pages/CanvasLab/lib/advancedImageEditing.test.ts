import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { randomUUID } from "node:crypto";
import { INITIAL_POST } from "../components/types";
import {
  advancedImageTargets,
  applyAdvancedImageResult,
  restoreAdvancedImage,
} from "./advancedImageEditing";
import {
  canvasModelToSavePayload,
  savedPostToCanvasModel,
} from "./saveAdapter";
import {
  createHistory,
  pushHistory,
  undoHistory,
  redoHistory,
} from "./canvasHistory";
import { duplicateSlide } from "./documentCommands";
import { createArsenalFixtureComposition } from "./arsenalFixture";
import { putArsenalComposition } from "./arsenalComposition";
import { applyMediaOperation, mediaTargets } from "./mediaSlots";
const original = `/api/post-media/00000000-0000-0000-0000-000000000001/${"a".repeat(64)}`;
const edited = original.replace("a".repeat(64), "b".repeat(64));
const result = {
  requestId: randomUUID(),
  imageData: "unused",
  format: "png" as const,
  sourceSha256: "a".repeat(64),
  resultSha256: "b".repeat(64),
  sourceDimensions: { width: 600, height: 600 },
  resultDimensions: { width: 600, height: 600 },
};
const adjust = {
  kind: "adjust" as const,
  brightness: 8,
  contrast: 2,
  saturation: 0,
};
const oldDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
beforeAll(() =>
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { createElement: () => createCanvas(20, 20) },
  })
);
afterAll(() => {
  if (oldDocument) Object.defineProperty(globalThis, "document", oldDocument);
  else Reflect.deleteProperty(globalThis, "document");
});
function native() {
  const post = structuredClone(INITIAL_POST);
  post.slides[0].extraImages = [
    {
      id: "image",
      url: original,
      x: 12.125,
      y: 33.75,
      width: 160,
      height: 160,
      rotation: 12,
      opacity: 0.8,
    },
  ];
  return post;
}
describe("advanced image document mutations", () => {
  it("edits a brand logo independently of an image using the same source", () => {
    const post = native();
    post.slides[0].logo = {
      url: original,
      position: "custom",
      x: 17.25,
      y: 22.5,
      width: 90,
      height: 30,
      opacity: 0.85,
    };
    const target = advancedImageTargets(post).find(t => t.label === "Logo")!;
    const next = applyAdvancedImageResult(
      post,
      target,
      { inputUrl: original, resultUrl: edited },
      result,
      adjust
    )!;
    expect(next.slides[0].logo).toEqual({
      ...post.slides[0].logo,
      url: edited,
    });
    expect(next.slides[0].extraImages![0].url).toBe(original);
    const locked = structuredClone(post);
    locked.slides[0].elementStates = { logo: { locked: true } };
    expect(
      applyAdvancedImageResult(
        locked,
        target,
        { inputUrl: original, resultUrl: edited },
        result,
        adjust
      )
    ).toBeNull();
  });
  it("changes only the chosen instance, with one undo/redo and original receipts surviving save/reopen", () => {
    const post = duplicateSlide(native(), 0);
    const target = advancedImageTargets(post).find(t => t.url === original)!;
    const next = applyAdvancedImageResult(
      post,
      target,
      { inputUrl: original, resultUrl: edited },
      result,
      adjust
    )!;
    const editedSlide = next.slides.find(s => s.id === target.slideId)!;
    expect(editedSlide.extraImages![0]).toEqual({
      ...post.slides.find(s => s.id === target.slideId)!.extraImages![0],
      url: edited,
    });
    expect(
      next.slides.find(s => s.id !== target.slideId)!.extraImages![0].url
    ).toBe(original);
    let history = pushHistory(createHistory(post), next);
    history = undoHistory(history);
    expect(history.present.slides).toEqual(post.slides);
    history = redoHistory(history);
    expect(history.present.slides).toEqual(next.slides);
    const payload = canvasModelToSavePayload(next, {
      inputType: "text",
      inputContent: "Test",
    });
    const reopened = savedPostToCanvasModel({
      id: 123,
      canvas_model: JSON.parse(JSON.stringify(payload.canvasModel)),
    });
    expect(reopened.advancedImageAssets?.[edited].originalUrl).toBe(original);
    const restored = restoreAdvancedImage(reopened, {
      ...target,
      url: edited,
    })!;
    expect(
      restored.slides.find(s => s.id === target.slideId)!.extraImages![0].url
    ).toBe(original);
  });
  it("refuses deleted/replaced/locked targets and never redirects to another slide", () => {
    const post = native(),
      target = advancedImageTargets(post).find(t => t.slotId === "image")!;
    expect(
      applyAdvancedImageResult(
        { ...post, id: "different" },
        target,
        { inputUrl: original, resultUrl: edited },
        result,
        adjust
      )
    ).toBeNull();
    const locked = structuredClone(post);
    locked.slides[0].elementStates = { image: { locked: true } };
    expect(
      applyAdvancedImageResult(
        locked,
        target,
        { inputUrl: original, resultUrl: edited },
        result,
        adjust
      )
    ).toBeNull();
    const changed = structuredClone(post);
    changed.slides[0].extraImages![0].url = "different";
    expect(
      applyAdvancedImageResult(
        changed,
        target,
        { inputUrl: original, resultUrl: edited },
        result,
        adjust
      )
    ).toBeNull();
  });
  it("updates canonical composition media/projections and preserves framing, pinned definition and text", () => {
    let post = putArsenalComposition(
      structuredClone(INITIAL_POST),
      createArsenalFixtureComposition()
    );
    const element = post.slides[0].composition!.elements.find(
      e => e.kind === "media"
    )!;
    const mt = {
      postId: post.id,
      slideId: post.slides[0].id,
      slotId: element.id,
    };
    post = applyMediaOperation(post, mt, { kind: "apply", url: original })!;
    post = applyMediaOperation(post, mt, {
      kind: "focal",
      focalX: 0.2,
      focalY: 0.8,
    })!;
    const target = advancedImageTargets(post).find(
      t => t.slotId === element.id
    )!;
    const next = applyAdvancedImageResult(
      post,
      target,
      { inputUrl: original, resultUrl: edited },
      result,
      adjust
    )!;
    expect(next.slides[0].composition!.media[element.id]).toMatchObject({
      url: edited,
      focalX: 0.2,
      focalY: 0.8,
    });
    expect(next.slides[0].composition!.origin).toEqual(
      post.slides[0].composition!.origin
    );
    expect(
      next.slides[0].composition!.elements.filter(e => e.kind === "text")
    ).toEqual(
      post.slides[0].composition!.elements.filter(e => e.kind === "text")
    );
    const restored = restoreAdvancedImage(next, { ...target, url: edited })!;
    expect(mediaTargets(restored).find(t => t.id === element.id)).toMatchObject(
      { url: original, focalX: 0.2, focalY: 0.8 }
    );
  });
  it.each([
    [600, 0.2, 0.8],
    [540, 0.5, 0.5],
  ])(
    "keeps the focal point for a format-only trim and centers a real trim (%i px)",
    (resultWidth, focalX, focalY) => {
      let post = putArsenalComposition(
        structuredClone(INITIAL_POST),
        createArsenalFixtureComposition()
      );
      const slotId = post.slides[0].composition!.elements.find(
        e => e.kind === "media"
      )!.id;
      const reference = { postId: post.id, slideId: post.slides[0].id, slotId };
      post = applyMediaOperation(post, reference, {
        kind: "apply",
        url: original,
      })!;
      post = applyMediaOperation(post, reference, {
        kind: "focal",
        focalX: 0.2,
        focalY: 0.8,
      })!;
      const target = advancedImageTargets(post).find(t => t.slotId === slotId)!;
      const next = applyAdvancedImageResult(
        post,
        target,
        { inputUrl: original, resultUrl: edited },
        { ...result, resultDimensions: { width: resultWidth, height: 600 } },
        { kind: "trim" }
      )!;
      expect(mediaTargets(next).find(t => t.id === slotId)).toMatchObject({
        url: edited,
        focalX,
        focalY,
      });
    }
  );
});

it("projects the chosen asset for preview without receipts, persisted pixels or changes to another instance", async () => {
  const { projectAdvancedImagePreview } = await import(
    "./advancedImageEditing"
  );
  const post = duplicateSlide(native(), 0),
    before = structuredClone(post);
  const target = advancedImageTargets(post).find(t => t.url === original)!;
  const preview = {
    document: post,
    target,
    operation: adjust,
    result: { ...result, imageData: "data:image/png;base64,preview" },
  };
  const projected = projectAdvancedImagePreview(post, preview)!;
  expect(post).toEqual(before);
  expect(projected.advancedImageAssets).toEqual(post.advancedImageAssets);
  expect(
    projected.slides.find(s => s.id === target.slideId)!.extraImages![0]
  ).toEqual({
    ...post.slides.find(s => s.id === target.slideId)!.extraImages![0],
    url: preview.result.imageData,
  });
  expect(projected.slides.find(s => s.id !== target.slideId)).toEqual(
    post.slides.find(s => s.id !== target.slideId)
  );
  expect(
    projectAdvancedImagePreview(structuredClone(post), preview)
  ).toBeNull();
  expect(projectAdvancedImagePreview(post, null)).toBeNull();
});
