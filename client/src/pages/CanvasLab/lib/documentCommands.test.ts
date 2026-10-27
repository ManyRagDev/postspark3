import { describe, expect, it } from "vitest";
import type { CanvasPostModel } from "../components/types";
import {
  applyPatchToAllSlides,
  applyPatchToCurrentSlide,
  cloneSlide,
  duplicateSlide,
  removeSlide,
  reorderSlides,
  resolveCoverSlide,
  setCurrentSlideBackground,
} from "./documentCommands";
import { createArsenalFixtureComposition } from "./arsenalFixture";
import { addArsenalAuthorialLayer, overrideArsenalElement } from "./arsenalComposition";
import { readArsenalComposition } from "@shared/designArsenal";

function makePost(overrides: Partial<CanvasPostModel> = {}): CanvasPostModel {
  return {
    id: "test-post",
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
      { id: "s1", step: "SLIDE 01", headline: "Slide 1", subtext: "Body 1" },
      { id: "s2", step: "SLIDE 02", headline: "Slide 2", subtext: "Body 2" },
      { id: "s3", step: "SLIDE 03", headline: "Slide 3", subtext: "Body 3" },
    ],
    ...overrides,
  };
}

describe("documentCommands", () => {
  it("applies a patch only to the current slide (no root write, no cross-talk)", () => {
    const post = makePost({ currentSlideIndex: 1 });
    const next = applyPatchToCurrentSlide(post, { headline: "NOVO SLIDE 2" });

    expect(next.slides[1].headline).toBe("NOVO SLIDE 2");
    expect(next.slides[0].headline).toBe("Slide 1");
    expect(next.slides[2].headline).toBe("Slide 3");
    // Root global não é alterado
    expect(next.headline).toBe("Headline root");
    // Imutável
    expect(post.slides[1].headline).toBe("Slide 2");
  });

  it("applies a patch to all slides explicitly", () => {
    const post = makePost();
    const next = applyPatchToAllSlides(post, { bgImage: "https://x/y.png" });
    expect(next.slides.every((s) => s.bgImage === "https://x/y.png")).toBe(true);
    // Root global não é alterado
    expect(next.bgImage).toBeUndefined();
  });

  it("isolates background per slide", () => {
    const post = makePost({ currentSlideIndex: 0 });
    const next = setCurrentSlideBackground(post, { bgImage: "bg-1", bgTransform: { x: 1, y: 2, scaleX: 2, scaleY: 2 } });

    expect(next.slides[0].bgImage).toBe("bg-1");
    expect(next.slides[1].bgImage).toBeUndefined();
    expect(next.bgImage).toBeUndefined();
  });

  it("duplicate generates fresh internal IDs and deep-clones nested elements", () => {
    const post = makePost({
      slides: [
        {
          id: "s1",
          step: "SLIDE 01",
          headline: "Original",
          subtext: "Body",
          extraTexts: [{ id: "tx-1", text: "A", fontWeight: "bold" }],
          extraImages: [{ id: "im-1", url: "u", x: 0, y: 0, width: 10, height: 10 }],
        },
      ],
    });

    const next = duplicateSlide(post, 0);
    expect(next.slides).toHaveLength(2);

    const copy = next.slides[1];
    expect(copy.id).not.toBe("s1");
    expect(copy.extraTexts?.[0].id).not.toBe("tx-1");
    expect(copy.extraImages?.[0].id).not.toBe("im-1");

    // Referências aninhadas não são compartilhadas
    expect(copy.extraTexts).not.toBe(post.slides[0].extraTexts);
    expect(copy.extraTexts?.[0]).not.toBe(post.slides[0].extraTexts?.[0]);

    // Nenhum ID duplicado no documento
    const ids = next.slides.flatMap((s) => [
      s.id,
      ...(s.extraTexts?.map((t) => t.id) ?? []),
      ...(s.extraImages?.map((i) => i.id) ?? []),
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("never removes the last slide", () => {
    const single = makePost({ slides: [makePost().slides[0]] });
    const next = removeSlide(single, 0);
    expect(next.slides).toHaveLength(1);
  });

  it("reorder keeps stable IDs and updates order", () => {
    const post = makePost();
    const next = reorderSlides(post, 2, 0);
    expect(next.slides.map((s) => s.id)).toEqual(["s3", "s1", "s2"]);
    expect(next.slides[0].headline).toBe("Slide 3");
  });

  it("resolveCoverSlide always returns the first slide", () => {
    const post = makePost({ currentSlideIndex: 2 });
    expect(resolveCoverSlide(post).headline).toBe("Slide 1");
  });

  it("duplica slide com composição Arsenal V3 gerando novos IDs para camadas autorais e remapeando overrides", () => {
    let comp = addArsenalAuthorialLayer(createArsenalFixtureComposition(), {
      id: "orig-layer-1",
      kind: "text",
      text: "Camada Original",
      zIndex: 1,
      parentId: null,
      x: 15,
      y: 25,
      width: 120,
      height: 40,
      rotation: 0,
      opacity: 1,
    });
    // Add an override to orig-layer-1
    comp = overrideArsenalElement(comp, "orig-layer-1", { fontSize: 28 });

    const post = makePost({
      slides: [
        {
          id: "s1",
          step: "SLIDE 01",
          headline: "Slide 1",
          subtext: "Corpo 1",
          composition: comp,
        },
      ],
    });

    const next = duplicateSlide(post, 0);
    expect(next.slides).toHaveLength(2);

    const s0Comp = next.slides[0].composition!;
    const s1Comp = next.slides[1].composition!;

    expect(s1Comp).toBeDefined();
    expect(s1Comp).not.toBe(s0Comp); // deep cloned

    if (s1Comp.version === 3 && s0Comp.version === 3) {
      expect(s1Comp.authorialLayers[0].id).not.toBe("orig-layer-1");
      expect(s1Comp.authorialLayers[0].id).toMatch(/^tx-/);
      expect(s1Comp.authorialLayers[0].text).toBe("Camada Original");

      // Verify that the override was remapped to the new layer ID
      const newLayerId = s1Comp.authorialLayers[0].id;
      expect(s1Comp.overrides[newLayerId]).toBeDefined();
      expect(s1Comp.overrides[newLayerId].fontSize).toBe(28);
      expect(s1Comp.overrides["orig-layer-1"]).toBeUndefined();
    }
  });

  it("opera carrossel misto (slides com e sem composição) preservando integridade em reorder e remove", () => {
    const comp = createArsenalFixtureComposition();
    const post = makePost({
      slides: [
        { id: "s1", step: "1", headline: "Arsenal", subtext: "A", composition: comp },
        { id: "s2", step: "2", headline: "Legado 1", subtext: "B" },
        { id: "s3", step: "3", headline: "Legado 2", subtext: "C" },
      ],
    });

    // Reorder: move slide 0 to position 2
    const reordered = reorderSlides(post, 0, 2);
    expect(reordered.slides.map(s => s.id)).toEqual(["s2", "s3", "s1"]);
    expect(reordered.slides[2].composition).toBeDefined();
    expect(reordered.slides[0].composition).toBeUndefined();

    // Remove slide 1 (which is s3)
    const removed = removeSlide(reordered, 1);
    expect(removed.slides.map(s => s.id)).toEqual(["s2", "s1"]);
    expect(removed.slides[1].composition).toBeDefined();
    expect(removed.slides[0].composition).toBeUndefined();
  });

  it("AC-02 / P02: gerencia índices e slide ativo corretamente em duplicate, remove e reorder", () => {
    const post = makePost({
      currentSlideIndex: 1,
      slides: [
        { id: "s1", step: "1", headline: "Slide 1", subtext: "A" },
        { id: "s2", step: "2", headline: "Slide 2", subtext: "B" },
      ],
    });

    // P02 / AC-02: duplicar o último slide seleciona a cópia criada na posição 2
    const duped = duplicateSlide(post, 1);
    expect(duped.slides).toHaveLength(3);
    expect(duped.currentSlideIndex).toBe(2);
    expect(duped.slides[2].id).not.toBe("s2");

    // P02 / AC-02: excluir o último slide ativo escolhe o anterior no índice 0
    const removedLast = removeSlide(post, 1);
    expect(removedLast.slides).toHaveLength(1);
    expect(removedLast.currentSlideIndex).toBe(0);
    expect(removedLast.slides[0].id).toBe("s1");

    // AC-02: excluir slide antes do ativo preserva o ID ativo
    const threeSlides = makePost({
      currentSlideIndex: 1,
      slides: [
        { id: "s0", step: "0", headline: "S0", subtext: "A" },
        { id: "s1", step: "1", headline: "S1", subtext: "B" },
        { id: "s2", step: "2", headline: "S2", subtext: "C" },
      ],
    });
    const removedBefore = removeSlide(threeSlides, 0);
    expect(removedBefore.slides.map(s => s.id)).toEqual(["s1", "s2"]);
    expect(removedBefore.currentSlideIndex).toBe(0); // apontando para s1!

    // AC-02: excluir slide depois do ativo preserva o ID ativo
    const removedAfter = removeSlide(threeSlides, 2);
    expect(removedAfter.slides.map(s => s.id)).toEqual(["s0", "s1"]);
    expect(removedAfter.currentSlideIndex).toBe(1); // apontando para s1!

    // AC-02: excluir ativo no início escolhe sucessor no mesmo índice
    threeSlides.currentSlideIndex = 0;
    const removedActiveFirst = removeSlide(threeSlides, 0);
    expect(removedActiveFirst.slides.map(s => s.id)).toEqual(["s1", "s2"]);
    expect(removedActiveFirst.currentSlideIndex).toBe(0); // apontando para o sucessor s1!

    // AC-02: comando com índice inválido é no-op
    expect(removeSlide(threeSlides, -1)).toBe(threeSlides);
    expect(removeSlide(threeSlides, 99)).toBe(threeSlides);
    expect(duplicateSlide(threeSlides, -1)).toBe(threeSlides);
    expect(duplicateSlide(threeSlides, 99)).toBe(threeSlides);
    expect(reorderSlides(threeSlides, -1, 0)).toBe(threeSlides);
    expect(reorderSlides(threeSlides, 0, 99)).toBe(threeSlides);
    expect(reorderSlides(threeSlides, 1, 1)).toBe(threeSlides);
  });

  it("AC-01 / P11: composição autoral duplicada passa pelo parser canônico sem erros", () => {
    let comp = addArsenalAuthorialLayer(createArsenalFixtureComposition(), {
      id: "auth-1",
      kind: "text",
      text: "Camada Validada",
      zIndex: 10,
      parentId: null,
      x: 20,
      y: 30,
      width: 150,
      height: 50,
      rotation: 0,
      opacity: 1,
    });
    comp = overrideArsenalElement(comp, "auth-1", { fontSize: 22 });
    const post = makePost({
      slides: [
        { id: "s1", step: "1", headline: "H1", subtext: "S1", composition: comp },
      ],
    });

    const duplicated = duplicateSlide(post, 0);
    expect(duplicated.slides).toHaveLength(2);

    const dupComp = duplicated.slides[1].composition!;
    expect(dupComp).toBeDefined();

    // Inversão do oráculo de defeito P11: NÃO pode lançar erro ao ler composição duplicada!
    expect(() => readArsenalComposition(dupComp)).not.toThrow();

    // Serialização JSON roundtrip
    const jsonParsed = JSON.parse(JSON.stringify(dupComp));
    expect(() => readArsenalComposition(jsonParsed)).not.toThrow();
  });

  it("RC-01 / BUG-CL-021: cloneSlide e duplicateSlide isolam referências de todos os objetos e arrays aninhados", () => {
    const post: CanvasPostModel = makePost({
      extraTexts: [{ id: "tx-root", text: "Root Text", textRich: [{ text: "Root", bold: true }] }],
      slides: [
        {
          id: "n",
          step: "1",
          headline: "N",
          subtext: "Sub N",
          headlineRich: [{ text: "Título", bold: true }],
          subtextRich: [{ text: "Subtexto", italic: true }],
          headlinePos: { x: 12, y: 23 },
          subtextPos: { x: 15, y: 40 },
          bgPlacement: {
            fitMode: "custom",
            crop: { x: 0, y: 0, width: 100, height: 100 },
            transform: { x: 5, y: 5, scaleX: 1.2, scaleY: 1.2 },
          },
          bgTransform: { x: 10, y: 20, scaleX: 1.5, scaleY: 1.5 },
          extraTexts: [{ id: "tx-n", text: "Extra", textRich: [{ text: "Extra", bold: true }] }],
          extraImages: [{ id: "im-n", url: "https://example.com/img.png", x: 10, y: 20, width: 80, height: 80 }],
          extraShapes: [{ id: "sh-1", x: 0, y: 0, width: 50, height: 50, color: "#ff0000" }],
          initialVisual: {
            version: 1,
            aspectRatio: "1:1",
            visualStyle: { fontFamily: "Arial" },
            geometry: { headlinePos: { x: 12, y: 23 } },
          },
          guidedComposition: {
            version: 1,
            id: "headline",
            readingArea: { y: 10, height: 100, color: "#000000" },
          },
          visualStyle: { fontFamily: "Inter", headlineAlign: "left" },
        },
        {
          id: "n2",
          step: "2",
          headline: "N2",
          subtext: "Sub N2",
          extraTexts: [], // Remoção explícita
        },
        {
          id: "n3",
          step: "3",
          headline: "N3",
          subtext: "Sub N3",
          // extraTexts ausente -> herda do root
        },
      ],
    });

    const next = duplicateSlide(post, 0);
    expect(next.slides).toHaveLength(4);
    const a = next.slides[0];
    const b = next.slides[1];

    expect(b.id).not.toBe(a.id);
    expect(b.extraTexts![0].id).not.toBe(a.extraTexts![0].id);
    expect(b.extraImages![0].id).not.toBe(a.extraImages![0].id);

    // Todas as referências de objetos aninhados devem ser estritamente independentes
    expect(b.extraTexts![0].textRich).not.toBe(a.extraTexts![0].textRich);
    expect(b.headlineRich).not.toBe(a.headlineRich);
    expect(b.subtextRich).not.toBe(a.subtextRich);
    expect(b.headlinePos).not.toBe(a.headlinePos);
    expect(b.subtextPos).not.toBe(a.subtextPos);
    expect(b.bgPlacement!.crop).not.toBe(a.bgPlacement!.crop);
    expect(b.bgPlacement!.transform).not.toBe(a.bgPlacement!.transform);
    expect(b.bgTransform).not.toBe(a.bgTransform);
    expect(b.initialVisual).not.toBe(a.initialVisual);
    expect(b.guidedComposition).not.toBe(a.guidedComposition);
    expect(b.extraShapes).not.toBe(a.extraShapes);
    expect(b.visualStyle).not.toBe(a.visualStyle);

    // Mutação na cópia não afeta a origem
    b.extraTexts![0].textRich![0].text = "CÓPIA";
    b.headlineRich![0].text = "Título Cópia";
    b.headlinePos!.x = 999;
    b.bgPlacement!.crop!.x = 55;
    expect(a.extraTexts![0].textRich![0].text).toBe("Extra");
    expect(a.headlineRich![0].text).toBe("Título");
    expect(a.headlinePos!.x).toBe(12);
    expect(a.bgPlacement!.crop!.x).toBe(0);

    // Teste com clone de slide com extraTexts: [] (remoção explícita permanece [])
    const dupN2 = cloneSlide(next.slides[2], post, 2);
    expect(dupN2.extraTexts).toEqual([]);

    // Teste com clone de slide com extraTexts ausente (herda do root e aprofunda cópia)
    const dupN3 = cloneSlide(next.slides[3], post, 3);
    expect(dupN3.extraTexts).toHaveLength(1);
    expect(dupN3.extraTexts![0].id).not.toBe(post.extraTexts![0].id);
    expect(dupN3.extraTexts![0].textRich).not.toBe(post.extraTexts![0].textRich);
    dupN3.extraTexts![0].textRich![0].text = "Mutado no Clone";
    expect(post.extraTexts![0].textRich![0].text).toBe("Root");
  });
});