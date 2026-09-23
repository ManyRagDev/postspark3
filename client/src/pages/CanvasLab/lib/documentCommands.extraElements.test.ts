import { describe, expect, it } from "vitest";
import type { CanvasPostModel } from "../components/types";
import {
  freshId,
  freshUUID,
  duplicateExtraElement,
  removeExtraElement,
  reorderExtraElement,
  updateExtraElement,
  setExtraElementOpacity,
  setExtraElementRotation,
} from "./documentCommands";

function makePostWithExtras(): CanvasPostModel {
  return {
    id: "test-post-extras",
    familyId: "editorial-poster",
    familyName: "Editorial de Luxo",
    aspectRatio: "1:1",
    headlineAlign: "left",
    bodyAlign: "left",
    badgeText: "",
    headline: "Headline root",
    subtext: "Subtext root",
    caption: "",
    fontFamily: "Playfair Display",
    overlayOpacity: 0.55,
    logoPosition: "top-right",
    palette: { background: "#120D0A", text: "#F8F4EE", accent: "#E5A93C" },
    currentSlideIndex: 0,
    slides: [
      {
        id: "s1",
        step: "SLIDE 01",
        headline: "Slide 1",
        subtext: "Body 1",
        extraTexts: [
          { id: "tx-1", text: "Primeiro Texto", x: 100, y: 200, width: 300, rotation: 0, opacity: 1 },
          { id: "tx-2", text: "Segundo Texto", x: 150, y: 250, width: 200, rotation: 15, opacity: 0.8 },
        ],
        extraImages: [
          { id: "im-1", url: "https://placehold.co/100", x: 50, y: 50, width: 100, height: 100, rotation: 0, opacity: 1 },
          { id: "im-2", url: "https://placehold.co/200", x: 80, y: 80, width: 200, height: 200, rotation: 45, opacity: 0.5 },
        ],
      },
      {
        id: "s2",
        step: "SLIDE 02",
        headline: "Slide 2",
        subtext: "Body 2",
        extraTexts: [{ id: "tx-3", text: "Texto Slide 2", x: 50, y: 50 }],
        extraImages: [],
      },
    ],
  };
}

describe("documentCommands - Extra Elements (Etapa 7)", () => {
  it("freshUUID generates standard RFC4122/UUID-v4 format and unique IDs", () => {
    const id1 = freshUUID();
    const id2 = freshUUID("tx");

    expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(id2.startsWith("tx-")).toBe(true);
    expect(id1).not.toBe(id2);

    const idWithPrefix = freshId("im");
    expect(idWithPrefix.startsWith("im-")).toBe(true);
  });

  it("duplicateExtraElement duplicates extra text with fresh UUID and offset coordinates", () => {
    const post = makePostWithExtras();
    const { post: next, newElementId } = duplicateExtraElement(post, "tx-1");

    expect(newElementId).toBeDefined();
    expect(newElementId).not.toBe("tx-1");
    expect(newElementId?.startsWith("tx-")).toBe(true);

    const slide1Texts = next.slides[0].extraTexts || [];
    expect(slide1Texts.length).toBe(3);

    const duplicated = slide1Texts.find((t) => t.id === newElementId);
    expect(duplicated).toBeDefined();
    expect(duplicated?.text).toBe("Primeiro Texto");
    expect(duplicated?.x).toBe(124); // 100 + 24
    expect(duplicated?.y).toBe(224); // 200 + 24

    // Slide 2 não é afetado
    expect(next.slides[1].extraTexts?.length).toBe(1);
    // Imutável
    expect(post.slides[0].extraTexts?.length).toBe(2);
  });

  it("duplicateExtraElement duplicates extra image with fresh UUID and offset coordinates", () => {
    const post = makePostWithExtras();
    const { post: next, newElementId } = duplicateExtraElement(post, "im-1");

    expect(newElementId).toBeDefined();
    expect(newElementId).not.toBe("im-1");
    expect(newElementId?.startsWith("im-")).toBe(true);

    const slide1Images = next.slides[0].extraImages || [];
    expect(slide1Images.length).toBe(3);

    const duplicated = slide1Images.find((img) => img.id === newElementId);
    expect(duplicated).toBeDefined();
    expect(duplicated?.url).toBe("https://placehold.co/100");
    expect(duplicated?.x).toBe(74); // 50 + 24
    expect(duplicated?.y).toBe(74); // 50 + 24
  });

  it("removeExtraElement removes extra text or image from current slide", () => {
    const post = makePostWithExtras();
    const next1 = removeExtraElement(post, "tx-1");
    expect(next1.slides[0].extraTexts?.map((t) => t.id)).toEqual(["tx-2"]);

    const next2 = removeExtraElement(next1, "im-2");
    expect(next2.slides[0].extraImages?.map((i) => i.id)).toEqual(["im-1"]);
  });

  it("reorderExtraElement moves element to front (last in Konva layer array)", () => {
    const post = makePostWithExtras();
    // tx-1 está no índice 0. Ao trazer para a frente, deve ir para o final do array
    const next = reorderExtraElement(post, "tx-1", "front");
    const ids = next.slides[0].extraTexts?.map((t) => t.id);
    expect(ids).toEqual(["tx-2", "tx-1"]);
  });

  it("reorderExtraElement moves element to back (first in Konva layer array)", () => {
    const post = makePostWithExtras();
    // tx-2 está no índice 1. Ao enviar para trás, deve ir para o início do array (índice 0)
    const next = reorderExtraElement(post, "tx-2", "back");
    const ids = next.slides[0].extraTexts?.map((t) => t.id);
    expect(ids).toEqual(["tx-2", "tx-1"]);
  });

  it("setExtraElementOpacity clamps opacity safely between 0.05 and 1.0", () => {
    const post = makePostWithExtras();

    const nextOver = setExtraElementOpacity(post, "tx-1", 1.8);
    expect(nextOver.slides[0].extraTexts?.find((t) => t.id === "tx-1")?.opacity).toBe(1);

    const nextUnder = setExtraElementOpacity(post, "tx-1", -0.5);
    expect(nextUnder.slides[0].extraTexts?.find((t) => t.id === "tx-1")?.opacity).toBe(0.05);

    const nextValid = setExtraElementOpacity(post, "tx-1", 0.42);
    expect(nextValid.slides[0].extraTexts?.find((t) => t.id === "tx-1")?.opacity).toBe(0.42);
  });

  it("setExtraElementRotation applies normalized integer degree rotation", () => {
    const post = makePostWithExtras();
    const next = setExtraElementRotation(post, "im-1", 45.4);
    expect(next.slides[0].extraImages?.find((img) => img.id === "im-1")?.rotation).toBe(45);
  });

  it("simulates Konva onTransformEnd width normalization preventing infinite matrix accumulation", () => {
    // Simula a lógica implementada no onTransformEnd do CanvasPostStage:
    // width = Math.max(40, Math.round(currentWidth * scaleX))
    // scaleX/scaleY resetados para 1 no node Konva
    const post = makePostWithExtras();
    const initialText = post.slides[0].extraTexts![0];
    const initialWidth = initialText.width!; // 300
    const simulatedScaleX = 1.5;

    const normalizedWidth = Math.max(40, Math.round(initialWidth * simulatedScaleX)); // 450
    const newRotation = 25;
    const newX = 110;
    const newY = 215;

    const updatedPost = updateExtraElement(post, initialText.id, {
      x: newX,
      y: newY,
      width: normalizedWidth,
      rotation: newRotation,
      scaleX: 1, // Reseta escala para não acumular distorções
      scaleY: 1,
    });

    const transformedText = updatedPost.slides[0].extraTexts?.find((t) => t.id === initialText.id);
    expect(transformedText?.width).toBe(450);
    expect(transformedText?.rotation).toBe(25);
    expect(transformedText?.x).toBe(110);
    expect(transformedText?.y).toBe(215);
    expect(transformedText?.scaleX).toBe(1);
    expect(transformedText?.scaleY).toBe(1);
  });
});
