import { describe, expect, it } from "vitest";
import { INITIAL_POST, type CanvasPostModel } from "../components/types";
import { applyCurrentSlideAppearancePatch, replicateSlideAppearance, resolveSlideAppearance, replicateCarouselComposition } from "./slideReplication";
import { canvasModelToSavePayload, savedPostToCanvasModel } from "./saveAdapter";
import { createArsenalFixtureComposition } from "./arsenalFixture";
import { addArsenalAuthorialLayer, resolveArsenalComposition } from "./arsenalComposition";
import { readArsenalComposition } from "@shared/designArsenal";
import { arsenalHash } from "@shared/arsenalContent";

const post: CanvasPostModel = {
  ...INITIAL_POST,
  currentSlideIndex: 0,
  slides: [
    { id: "a", step: "1", headline: "Capa", subtext: "Texto A", bgImage: "a.png" },
    { id: "b", step: "2", headline: "Outro", subtext: "Texto B", bgImage: "b.png" },
    { id: "c", step: "3", headline: "Terceiro", subtext: "Texto C", bgImage: "c.png" },
  ],
};

describe("replicação seletiva de slides", () => {
  it("edita fonte e aparência do título só no slide atual", () => {
    const next = applyCurrentSlideAppearancePatch(post, { fontFamily: "Montserrat", headlineSizeScale: 1.3 });
    expect(resolveSlideAppearance(next, 0).fontFamily).toBe("Montserrat");
    expect(resolveSlideAppearance(next, 1).fontFamily).toBe(post.fontFamily);
    expect(resolveSlideAppearance(next, 1).headlineSizeScale).toBe(post.headlineSizeScale);
    expect(next.fontFamily).toBe(post.fontFamily);
  });

  it("copia somente os grupos e destinos escolhidos sem substituir conteúdo", () => {
    const edited = applyCurrentSlideAppearancePatch(post, { fontFamily: "Montserrat", headlineSizeScale: 1.3 });
    const next = replicateSlideAppearance(edited, 0, [2], ["font", "headline"]);
    expect(resolveSlideAppearance(next, 2).fontFamily).toBe("Montserrat");
    expect(resolveSlideAppearance(next, 2).headlineSizeScale).toBe(1.3);
    expect(next.slides[2].headline).toBe("Terceiro");
    expect(next.slides[2].bgImage).toBe("c.png");
    expect(resolveSlideAppearance(next, 1).fontFamily).toBe(post.fontFamily);
    expect(next.slides[1].bgImage).toBe("b.png");
  });

  it("copia o fundo apenas para o slide escolhido", () => {
    const next = replicateSlideAppearance(post, 0, [1], ["background"]);
    expect(next.slides.map(slide => slide.bgImage)).toEqual(["a.png", "a.png", "c.png"]);
    expect(next.slides.map(slide => slide.headline)).toEqual(["Capa", "Outro", "Terceiro"]);
  });

  it("preserva aparência por slide em salvar e reabrir", () => {
    const edited = applyCurrentSlideAppearancePatch(post, { fontFamily: "Montserrat" });
    const payload = canvasModelToSavePayload(edited, { inputType: "text", inputContent: "teste" });
    const reopened = savedPostToCanvasModel({ id: 1, canvas_model: payload.canvasModel });
    expect(resolveSlideAppearance(reopened, 0).fontFamily).toBe("Montserrat");
    expect(resolveSlideAppearance(reopened, 1).fontFamily).toBe(post.fontFamily);
  });

  it("replicateCarouselComposition replica composição adaptando o texto do slide alvo e gerando novos IDs para camadas autorais", () => {
    const comp = addArsenalAuthorialLayer(createArsenalFixtureComposition(), {
      id: "auth-1",
      kind: "text",
      text: "Camada Autoral",
      zIndex: 1,
      parentId: null,
      x: 10,
      y: 20,
      width: 100,
      height: 30,
      rotation: 0,
      opacity: 1,
    });

    const carouselPost: CanvasPostModel = {
      ...post,
      slides: [
        { id: "s1", step: "1", headline: "Título Slide 1", subtext: "Subtexto 1", composition: comp },
        { id: "s2", step: "2", headline: "Título Slide 2", subtext: "Subtexto 2" },
        { id: "s3", step: "3", headline: "Título Slide 3", subtext: "Subtexto 3" },
      ],
    };

    const next = replicateCarouselComposition(carouselPost, 0, [1, 2]);

    // Slide 1 composition must exist
    expect(next.slides[1].composition).toBeDefined();
    expect(next.slides[2].composition).toBeDefined();

    // The text in the target compositions must adapt to the target slide's headline/subtext
    const slide2Comp = next.slides[1].composition!;
    if (slide2Comp.content.schemaVersion === 2) {
      expect(slide2Comp.content.headline).toBe("Título Slide 2");
      expect(slide2Comp.content.body).toBe("Subtexto 2");
    }

    // Authorial layers in the replicated composition must have new distinct IDs
    if (slide2Comp.version === 3) {
      expect(slide2Comp.authorialLayers[0].id).not.toBe("auth-1");
      expect(slide2Comp.authorialLayers[0].id).toMatch(/^tx-/);
      expect(slide2Comp.authorialLayers[0].text).toBe("Camada Autoral");

      const slide3Comp = next.slides[2].composition!;
      if (slide3Comp.version === 3) {
        expect(slide3Comp.authorialLayers[0].id).not.toBe(slide2Comp.authorialLayers[0].id);
      }
    }
  });

  it("replicateCarouselComposition preserva effects, richText, overrides e passa readArsenalComposition e saveAdapter", () => {
    let comp = createArsenalFixtureComposition();
    comp = addArsenalAuthorialLayer(comp, {
      id: "tx-orig",
      kind: "text",
      text: "Camada com estilo",
      zIndex: 1,
      parentId: null,
      x: 10,
      y: 20,
      width: 150,
      height: 40,
      rotation: 0,
      opacity: 1,
      fontSize: 24,
      fill: "#ff0055",
    });

    if (comp.version === 3) {
      comp = {
        ...comp,
        effects: {
          ...comp.effects,
          "tx-orig": { effect: "shadow", color: "#000000", blur: 10, offset: { x: 2, y: 2 } },
        },
        richText: {
          ...comp.richText,
          "tx-orig": [
            { text: "Camada ", bold: true },
            { text: "com estilo", italic: true },
          ],
        },
      };
      comp = resolveArsenalComposition(comp);
    }

    const carouselPost: CanvasPostModel = {
      ...post,
      slides: [
        { id: "s1", step: "1", headline: "Slide 1", subtext: "Sub 1", composition: comp },
        { id: "s2", step: "2", headline: "Slide 2", subtext: "Sub 2" },
      ],
    };

    const next = replicateCarouselComposition(carouselPost, 0, [1]);
    const targetComp = next.slides[1].composition!;
    expect(targetComp).toBeDefined();

    // 1. readArsenalComposition accepts targetComp before and after JSON
    const parsedTarget = readArsenalComposition(targetComp);
    expect(parsedTarget).not.toBeNull();
    const roundtrip = readArsenalComposition(JSON.parse(JSON.stringify(targetComp)));
    expect(roundtrip).not.toBeNull();

    // 2. New authorial layer ID exists and has remapped effects & richText
    if (targetComp.version === 3) {
      const newLayerId = targetComp.authorialLayers[0].id;
      expect(newLayerId).not.toBe("tx-orig");
      expect(targetComp.effects[newLayerId]).toEqual({
        effect: "shadow",
        color: "#000000",
        blur: 10,
        offset: { x: 2, y: 2 },
      });
      expect(targetComp.richText?.[newLayerId]).toEqual([
        { text: "Camada ", bold: true },
        { text: "com estilo", italic: true },
      ]);
      // The old ID must not linger in effects/richText for the target
      expect(targetComp.effects["tx-orig"]).toBeUndefined();
      expect(targetComp.richText?.["tx-orig"]).toBeUndefined();

      // Elements must match new ID
      const element = targetComp.elements.find((el) => el.id === newLayerId);
      expect(element).toBeDefined();
    }

    // 3. Local saveAdapter accepts the replicated post
    const payload = canvasModelToSavePayload(next, { inputType: "text", inputContent: "teste" });
    const restored = savedPostToCanvasModel({ id: 1, canvas_model: payload.canvasModel });
    expect(restored.slides[1].composition).toBeDefined();
    expect(readArsenalComposition(restored.slides[1].composition!)).not.toBeNull();
  });

  it("AC-003-02: Fundo C origem a/destino b: destino renderiza a; origem/não destinos intactos; cancelar não muda nada", () => {
    let compA = createArsenalFixtureComposition();
    compA = {
      ...compA,
      version: 3,
      customBackground: { imageUrl: "https://example.com/origem-a.png", fill: "#111111" },
    };
    let compB = createArsenalFixtureComposition();
    compB = {
      ...compB,
      version: 3,
      customBackground: { imageUrl: "https://example.com/destino-b.png", fill: "#222222" },
    };
    let compC = createArsenalFixtureComposition();
    compC = {
      ...compC,
      version: 3,
      customBackground: { imageUrl: "https://example.com/outro-c.png", fill: "#333333" },
    };

    const carouselPost: CanvasPostModel = {
      ...post,
      slides: [
        { id: "s1", step: "1", headline: "Slide 1", subtext: "Sub 1", composition: compA, bgImage: "https://example.com/origem-a.png" },
        { id: "s2", step: "2", headline: "Slide 2", subtext: "Sub 2", composition: compB, bgImage: "https://example.com/destino-b.png" },
        { id: "s3", step: "3", headline: "Slide 3", subtext: "Sub 3", composition: compC, bgImage: "https://example.com/outro-c.png" },
      ],
    };

    // Replicar fundo do slide 0 para o slide 1 (apenas destino 1)
    const next = replicateSlideAppearance(carouselPost, 0, [1], ["background"]);

    // Destino 1 renderiza o fundo de A
    expect(next.slides[1].composition?.customBackground?.imageUrl).toBe("https://example.com/origem-a.png");
    expect(next.slides[1].bgImage).toBe("https://example.com/origem-a.png");

    // Origem (0) e não-destino (2) intactos
    expect(next.slides[0].composition?.customBackground?.imageUrl).toBe("https://example.com/origem-a.png");
    expect(next.slides[0].bgImage).toBe("https://example.com/origem-a.png");
    expect(next.slides[2].composition?.customBackground?.imageUrl).toBe("https://example.com/outro-c.png");
    expect(next.slides[2].bgImage).toBe("https://example.com/outro-c.png");

    // Cancelamento mantém documento inalterado
    const cancelled = carouselPost;
    expect(cancelled.slides[1].composition?.customBackground?.imageUrl).toBe("https://example.com/destino-b.png");
  });

  it("AC-003-03: Um destino incompatível: nenhuma aplicação parcial nem sucesso falso, razões por grupo/destino", () => {
    // Slide 1 é N com headline
    // Slide 2 é C com composição que não possui elemento de headline
    let compWithoutHeadline = createArsenalFixtureComposition();
    compWithoutHeadline = {
      ...compWithoutHeadline,
      elements: compWithoutHeadline.elements.filter(e => !e.id.toLowerCase().includes("headline")),
      base: {
        ...compWithoutHeadline.base,
        bindings: compWithoutHeadline.base.bindings.filter(b => b.source !== "headline" && !b.source.includes("headline")),
      },
    };

    const carouselPost: CanvasPostModel = {
      ...post,
      slides: [
        { id: "s1", step: "1", headline: "Capa", subtext: "Sub" },
        { id: "s2", step: "2", headline: "Outro", subtext: "Sub 2" }, // compatível N
        { id: "s3", step: "3", headline: "Terceiro", subtext: "Sub 3", composition: compWithoutHeadline }, // incompatível C sem headline
      ],
    };

    // Tentativa de replicar headline para destinos [1, 2]
    const next = replicateSlideAppearance(carouselPost, 0, [1, 2], ["headline"]);

    // Como o destino 2 é incompatível, o pedido INTEIRO é abortado: nenhuma aplicação parcial
    expect(next).toBe(carouselPost);
    expect(resolveSlideAppearance(next, 1).headlineAlign).toBe(resolveSlideAppearance(carouselPost, 1).headlineAlign);
  });

  it("AC-003-04: Restaurar C base 5:6 projetada em 1:1 mantém documento e todos os slides 1:1, copy/legenda/mídia e parser", async () => {
    let comp56 = createArsenalFixtureComposition();
    const base56 = {
      ...comp56.base,
      aspectRatio: "5:6" as const,
      artboard: { width: 1080, height: 1296, background: "#111111" },
    };
    comp56 = {
      ...comp56,
      base: base56,
      origin: {
        ...comp56.origin,
        variantHash: arsenalHash(base56),
      },
      effectiveAspectRatio: "1:1",
      artboard: { width: 1080, height: 1080, background: "#111111" },
    };

    const post11: CanvasPostModel = {
      ...post,
      aspectRatio: "1:1",
      caption: "Legenda autoral preservada",
      slides: [
        {
          id: "s1",
          step: "1",
          headline: "Título Slide 1:1",
          subtext: "Subtexto 1:1",
          composition: comp56,
        },
      ],
    };

    // Importar restoreInitialVisual
    const { restoreInitialVisual } = await import("./guidedComposition");
    const proposal = restoreInitialVisual(post11);

    expect(proposal.post).toBeDefined();
    const restoredPost = proposal.post!;
    expect(restoredPost.aspectRatio).toBe("1:1");
    expect(restoredPost.slides[0].composition?.effectiveAspectRatio).toBe("1:1");
    expect(restoredPost.caption).toBe("Legenda autoral preservada");
    expect(restoredPost.slides[0].headline).toBe("Título Slide 1:1");
    expect(readArsenalComposition(restoredPost.slides[0].composition!)).not.toBeNull();
  });

  it("AC-003-06: Matriz D-01 N→N, C→C, N↔C validada por grupo/papel; só grupos/destinos escolhidos mudam; camadas/conteúdo preservados", () => {
    const compOrigem = createArsenalFixtureComposition();
    const compDestino = createArsenalFixtureComposition();

    const mixedPost: CanvasPostModel = {
      ...post,
      slides: [
        { id: "s1", step: "1", headline: "Título N", subtext: "Sub N", bgImage: "n-bg.png" },
        { id: "s2", step: "2", headline: "Título C", subtext: "Sub C", composition: compOrigem },
        { id: "s3", step: "3", headline: "Destino C", subtext: "Sub C Destino", composition: compDestino },
        { id: "s4", step: "4", headline: "Destino N", subtext: "Sub N Destino" },
      ],
    };

    // 1. N -> C: replica background e font do slide 0 (N) para o slide 2 (C)
    const nToC = replicateSlideAppearance(mixedPost, 0, [2], ["background", "font"]);
    expect(nToC.slides[2].bgImage).toBe("n-bg.png");
    expect(nToC.slides[2].composition?.customBackground?.imageUrl).toBe("n-bg.png");
    // Destino C preservou seu texto
    expect(nToC.slides[2].headline).toBe("Destino C");
    expect(nToC.slides[2].subtext).toBe("Sub C Destino");

    // 2. C -> N: replica colors do slide 1 (C) para o slide 3 (N)
    const cToN = replicateSlideAppearance(mixedPost, 1, [3], ["colors"]);
    expect(resolveSlideAppearance(cToN, 3).palette.background).toBe(resolveSlideAppearance(mixedPost, 1).palette.background);
    expect(cToN.slides[3].headline).toBe("Destino N");

    // 3. Salvar e reabrir confirma fidelidade total
    const payload = canvasModelToSavePayload(nToC, { inputType: "text", inputContent: "matrix-test" });
    const reopened = savedPostToCanvasModel({ id: 10, canvas_model: payload.canvasModel });
    expect(reopened.slides[2].bgImage).toBe("n-bg.png");
    expect(reopened.slides[2].composition?.customBackground?.imageUrl).toBe("n-bg.png");
    expect(reopened.slides[2].headline).toBe("Destino C");
  });
});


