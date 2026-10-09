import { describe, expect, it } from "vitest";
import { INITIAL_POST, type CanvasPostModel } from "../components/types";
import {
  captureInitialVisuals,
  composePost,
  restoreInitialVisual,
  fitAssistedEdit,
  canvasHeight,
  COMPOSITIONS,
  fitPostToAspectRatio,
} from "./guidedComposition";
import { createArsenalFixtureComposition } from "./arsenalFixture";
import { normalizeCanvasModel, canvasModelToSavePayload } from "./saveAdapter";
import {
  createHistory,
  pushHistory,
  undoHistory,
  redoHistory,
} from "./canvasHistory";

const fixture = (): CanvasPostModel => ({
  ...structuredClone(INITIAL_POST),
  aspectRatio: "5:6",
  bgImage: "current-image.png",
  slides: [
    {
      id: "a",
      step: "",
      headline: "50% de desconto ou metade do dobro?",
      subtext: "Como descobrir se a oferta de um produto é real",
      headlineRich: [
        {
          text: "50% de desconto ou metade do dobro?",
          color: "#ff99aa",
          sizeScale: 3,
          underline: true,
        },
      ],
      headlinePos: { x: -40, y: 290 },
      subtextPos: { x: 2, y: 305 },
      extraTexts: [{ id: "note", text: "Nota importante", x: 3, y: 20 }],
      extraImages: [
        {
          id: "sticker",
          url: "sticker.png",
          x: 5,
          y: 5,
          width: 20,
          height: 20,
        },
      ],
    },
    {
      id: "b",
      step: "2",
      headline: "Compare os preços",
      subtext: "Consulte o histórico.",
    },
  ],
});

describe("guided composition", () => {
  for (const ratio of ["1:1", "4:5", "5:6", "9:16"] as const)
    for (const { id } of COMPOSITIONS) {
      it(`${id} fits and preserves content in ${ratio}`, () => {
        const post = { ...fixture(), aspectRatio: ratio };
        const before = structuredClone(post);
        const result = composePost(post, id);
        expect(post).toEqual(before);
        // Image-first may reject dense copy on the shortest format; never clips it.
        if (!result.post) {
          expect(id).toBe("image");
          return;
        }
        const slide = result.post.slides[0];
        expect(slide.headline).toBe(post.slides[0].headline);
        expect(slide.subtext).toBe(post.slides[0].subtext);
        expect(result.post.caption).toBe(post.caption);
        expect(result.post.bgImage).toBe(post.bgImage);
        expect(slide.extraTexts).toEqual(post.slides[0].extraTexts);
        expect(slide.extraImages).toEqual(post.slides[0].extraImages);
        expect(slide.headlineRich).toEqual([]);
        expect(slide.subtextPos!.y).toBeGreaterThan(slide.headlinePos!.y);
        expect(
          slide.guidedComposition!.readingArea.y +
            slide.guidedComposition!.readingArea.height
        ).toBeLessThan(canvasHeight(ratio));
        expect(slide.headlineScale! * 23).toBeGreaterThanOrEqual(22);
        expect(slide.subtextScale! * 12).toBeGreaterThanOrEqual(12);
        expect(result.post.slides[1]).toMatchObject(post.slides[1]);
        expect(composePost(post, id)).toEqual(result);
      });
    }
  it("rejects excessive copy without losing it or shrinking below readable limits", () => {
    const post = fixture();
    post.slides[0].subtext = "Uma mensagem muito longa. ".repeat(200);
    expect(composePost(post, "headline").error).toBeTruthy();
    expect(
      fitAssistedEdit(post, {
        headline: "Título",
        subtext: post.slides[0].subtext,
        caption: "Nova legenda",
      }).error
    ).toBeTruthy();
    expect(post.slides[0].subtext).toContain("Uma mensagem muito longa.");
  });
  it("persists a stable, asset-free initial reference across edits and reopen", () => {
    const original = captureInitialVisuals(fixture());
    const initial = original.slides[0].initialVisual;
    const composed = composePost(original, "balanced").post!;
    composed.slides[0].headline = "Meu texto atualizado";
    composed.slides[0].bgImage = "new.png";
    const payload = canvasModelToSavePayload(composed, {
      inputType: "text",
      inputContent: "Teste",
    });
    const reopened = captureInitialVisuals(
      normalizeCanvasModel(JSON.parse(JSON.stringify(payload.canvasModel)))
    );
    expect(reopened.slides[0].initialVisual).toEqual(
      JSON.parse(JSON.stringify(initial))
    );
    expect(reopened.slides[0].guidedComposition).toEqual(
      composed.slides[0].guidedComposition
    );
    const restored = restoreInitialVisual(reopened).post!;
    expect(restored.slides[0].headline).toBe("Meu texto atualizado");
    expect(restored.slides[0].bgImage).toBe("new.png");
    expect(restored.slides[0].visualStyle?.fontFamily).toBe(
      original.fontFamily
    );
    expect(JSON.stringify(initial)).not.toContain("current-image.png");
  });
  it("applies and undoes a complete recovery in one history entry", () => {
    const post = captureInitialVisuals(fixture());
    const next = composePost(post, "balanced").post!;
    const history = pushHistory(createHistory(post), next);
    expect(undoHistory(history).present).toEqual(post);
    expect(redoHistory(undoHistory(history)).present).toEqual(next);
  });
  it("commits current draft words and caption together and keeps other slides untouched", () => {
    const post = captureInitialVisuals(fixture());
    const draft = {
      headline: "Minha mensagem",
      subtext: "Meu apoio",
      caption: "Minha legenda",
    };
    const next = fitAssistedEdit(post, draft).post!;
    expect(next.slides[0]).toMatchObject({
      headline: draft.headline,
      subtext: draft.subtext,
    });
    expect(next.caption).toBe(draft.caption);
    expect(next.slides[1]).toBe(post.slides[1]);
  });
});

describe("recovery edge cases", () => {
  it("keeps empty rich-text overrides after save so root formatting cannot return", () => {
    const post = fixture();
    post.headlineRich = [
      { text: post.slides[0].headline, sizeScale: 5, color: "#ff00ff" },
    ];
    const proposal = composePost(post, "balanced").post!;
    const reopened = normalizeCanvasModel(JSON.parse(JSON.stringify(proposal)));
    expect(reopened.slides[0].headlineRich).toEqual([]);
    expect(reopened.headlineRich?.[0].sizeScale).toBe(5);
  });
  it("editing only the caption never changes the composition", () => {
    const post = fixture();
    const next = fitAssistedEdit(post, {
      headline: post.slides[0].headline,
      subtext: post.slides[0].subtext,
      caption: "Nova legenda",
    }).post!;
    expect(next.slides).toBe(post.slides);
    expect(next.caption).toBe("Nova legenda");
  });
});

describe("format projection", () => {
  it("preserves manual edits when returning to the gallery in the same format", () => {
    const post = composePost(fixture(), "balanced").post!;
    post.slides[0].headlinePos = { x: 70, y: 90 };
    expect(fitPostToAspectRatio(post, post.aspectRatio).post).toBe(post);
  });
  it("reflows guided slides without changing copy or the active slide", () => {
    const post = composePost(fixture(), "balanced").post!;
    const next = fitPostToAspectRatio(post, "9:16").post!;
    expect(next.aspectRatio).toBe("9:16");
    expect(next.currentSlideIndex).toBe(post.currentSlideIndex);
    expect(next.slides[0].headline).toBe(post.slides[0].headline);
    expect(next.slides[0].guidedComposition!.readingArea.y).toBeGreaterThan(
      post.slides[0].guidedComposition!.readingArea.y
    );
    expect(post.aspectRatio).toBe("5:6");
  });
  it("rejects the entire format change if a slide cannot fit", () => {
    const post = composePost(fixture(), "balanced").post!;
    post.slides[0].subtext = "Conteúdo extenso. ".repeat(300);
    const before = structuredClone(post);
    expect(fitPostToAspectRatio(post, "1:1").error).toContain("Slide 1");
    expect(post).toEqual(before);
  });

  it("projeta slides com composição Arsenal para outro aspecto de tela preservando o modelo original", () => {
    const comp = createArsenalFixtureComposition();
    const initialRatio = comp.effectiveAspectRatio;
    const post: CanvasPostModel = {
      ...fixture(),
      aspectRatio: initialRatio,
      slides: [
        { ...fixture().slides[0], composition: comp },
      ],
    };

    const next = fitPostToAspectRatio(post, "9:16").post!;
    expect(next.aspectRatio).toBe("9:16");
    expect(next.slides[0].composition).toBeDefined();
    expect(next.slides[0].composition!.effectiveAspectRatio).toBe("9:16");

    // Original post is not mutated
    expect(post.aspectRatio).toBe(initialRatio);
    expect(post.slides[0].composition!.effectiveAspectRatio).toBe(initialRatio);
  });
});

