import { INITIAL_POST, type CanvasPostModel } from "../../client/src/pages/CanvasLab/components/types";
import { createArsenalFixtureComposition } from "../../client/src/pages/CanvasLab/lib/arsenalFixture";
import {
  addArsenalAuthorialLayer,
  overrideArsenalElement,
  resolveArsenalComposition,
  projectArsenalFormat,
} from "../../client/src/pages/CanvasLab/lib/arsenalComposition";

const DUMMY_IMAGE_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

export function createTestComposedPost(): CanvasPostModel {
  let comp = createArsenalFixtureComposition();

  for (const e of comp.elements.filter((e) => e.kind === "text")) {
    comp = overrideArsenalElement(comp, e.id, { fontAssetId: null, fontFamily: "Arial" });
  }

  comp = addArsenalAuthorialLayer(comp, {
    id: "tx-integrated-0",
    kind: "text",
    text: "Texto Integrado OS-003-008",
    zIndex: 10,
    parentId: null,
    x: 50,
    y: 100,
    width: 320,
    height: 50,
    rotation: 0,
    opacity: 1,
    fontSize: 24,
    fill: "#ffffff",
    fontFamily: "Arial",
  });

  comp = addArsenalAuthorialLayer(comp, {
    id: "im-integrated-0",
    kind: "image",
    url: DUMMY_IMAGE_URL,
    zIndex: 5,
    parentId: null,
    x: 30,
    y: 30,
    width: 64,
    height: 64,
    rotation: 0,
    opacity: 1,
  });

  if (comp.version === 3) {
    comp = {
      ...comp,
      richText: {
        ...comp.richText,
        "tx-integrated-0": [
          { text: "Texto ", bold: true },
          { text: "Integrado OS-003-008", italic: true },
        ],
      },
    };
    comp = resolveArsenalComposition(comp);
  }

  const post = structuredClone(INITIAL_POST);
  post.id = "audit-integrated-post";
  post.fontFamily = "Arial";
  post.subtextFontFamily = "Arial";
  post.caption = "Legenda Integrada OS-003-008";
  post.hashtags = ["#postspark", "#canvaslab", "#integrada"];
  post.currentSlideIndex = 0;
  post.slides = [
    {
      id: "slide-0",
      step: "01",
      headline: "PostSpark Studio",
      subtext: "Geração e edição visual",
      composition: comp,
    },
    {
      id: "slide-1",
      step: "02",
      headline: "Segundo Slide",
      subtext: "Continuidade de carrossel",
      composition: createArsenalFixtureComposition(),
    },
  ];
  post.aspectRatio = post.slides[0].composition?.effectiveAspectRatio || "1:1";
  return post;
}

