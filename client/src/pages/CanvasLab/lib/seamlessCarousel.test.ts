import { describe, it, expect } from "vitest";
import {
  applySeamlessPanoramaToPost,
  removeSeamlessPanoramaFromPost,
  detectActiveSeamlessPanorama,
  type SeamlessPanoramaMeta,
} from "./seamlessCarousel";
import { INITIAL_POST, type CanvasPostModel } from "../components/types";
import { computeCoverCrop } from "./backgroundPlacement";
import { createArsenalFixtureComposition } from "./arsenalFixture";

const mockPanorama5: SeamlessPanoramaMeta = {
  id: "test-pano-5",
  name: "Test Pano 5",
  slideCount: 5,
  width: 5400,
  height: 1350,
  url: "/images/backgrounds/seamless-carousel/test-pano-5.webp",
  previewUrl: "/images/backgrounds/seamless-carousel/test-pano-5_preview.webp",
  series: "Editorial",
  defaultOverlayOpacity: 0,
  fallbackBgColor: "#F4EFE6",
  isDark: false,
};

const mockPanorama7: SeamlessPanoramaMeta = {
  id: "test-pano-7",
  name: "Test Pano 7",
  slideCount: 7,
  width: 7560,
  height: 1350,
  url: "/images/backgrounds/seamless-carousel/test-pano-7.webp",
  previewUrl: "/images/backgrounds/seamless-carousel/test-pano-7_preview.webp",
  series: "Arte Conceitual",
  defaultOverlayOpacity: 0.25,
  fallbackBgColor: "#120E1A",
  isDark: true,
};

describe("seamlessCarousel", () => {
  it("calcula focalX proporcionalmente exato para cada slide coberto", () => {
    // Post com 5 slides
    const postWith5Slides: CanvasPostModel = {
      ...INITIAL_POST,
      slides: [
        { id: "s1", headline: "1", subtext: "1", step: "1" },
        { id: "s2", headline: "2", subtext: "2", step: "2" },
        { id: "s3", headline: "3", subtext: "3", step: "3" },
        { id: "s4", headline: "4", subtext: "4", step: "4" },
        { id: "s5", headline: "5", subtext: "5", step: "5" },
      ],
    };

    const applied = applySeamlessPanoramaToPost(postWith5Slides, mockPanorama5);

    expect(applied.slides[0].bgImage).toBe(mockPanorama5.url);
    expect(applied.slides[0].bgPlacement?.focalPoint?.x).toBe(0 / 4); // 0.00
    expect(applied.slides[1].bgPlacement?.focalPoint?.x).toBe(1 / 4); // 0.25
    expect(applied.slides[2].bgPlacement?.focalPoint?.x).toBe(2 / 4); // 0.50
    expect(applied.slides[3].bgPlacement?.focalPoint?.x).toBe(3 / 4); // 0.75
    expect(applied.slides[4].bgPlacement?.focalPoint?.x).toBe(4 / 4); // 1.00

    expect(applied.overlayOpacity).toBe(0);
    expect(applied.palette.background).toBe("#F4EFE6");
  });

  it("corta naturalmente quando carrossel tem MENOS slides que o panorama (M < N)", () => {
    // Carrossel de 4 slides recebendo panorama de 7 slides
    const postWith4Slides: CanvasPostModel = {
      ...INITIAL_POST,
      slides: [
        { id: "s1", headline: "1", subtext: "1", step: "1" },
        { id: "s2", headline: "2", subtext: "2", step: "2" },
        { id: "s3", headline: "3", subtext: "3", step: "3" },
        { id: "s4", headline: "4", subtext: "4", step: "4" },
      ],
    };

    const applied = applySeamlessPanoramaToPost(postWith4Slides, mockPanorama7);

    expect(applied.slides.length).toBe(4);
    // Slides 0 a 3 recebem as 4 primeiras fatias do panorama de 7
    expect(applied.slides[0].bgImage).toBe(mockPanorama7.url);
    expect(applied.slides[0].bgPlacement?.focalPoint?.x).toBe(0 / 6);
    expect(applied.slides[1].bgPlacement?.focalPoint?.x).toBe(1 / 6);
    expect(applied.slides[2].bgPlacement?.focalPoint?.x).toBe(2 / 6);
    expect(applied.slides[3].bgPlacement?.focalPoint?.x).toBe(3 / 6);
  });

  it("deixa slides excedentes sem imagem de fundo quando carrossel tem MAIS slides que o panorama (M > N)", () => {
    // Carrossel de 6 slides recebendo panorama de 5 slides
    const postWith6Slides: CanvasPostModel = {
      ...INITIAL_POST,
      slides: [
        { id: "s1", headline: "1", subtext: "1", step: "1" },
        { id: "s2", headline: "2", subtext: "2", step: "2" },
        { id: "s3", headline: "3", subtext: "3", step: "3" },
        { id: "s4", headline: "4", subtext: "4", step: "4" },
        { id: "s5", headline: "5", subtext: "5", step: "5" },
        { id: "s6", headline: "6", subtext: "6", step: "6" },
      ],
    };

    const applied = applySeamlessPanoramaToPost(postWith6Slides, mockPanorama5);

    expect(applied.slides[0].bgImage).toBe(mockPanorama5.url);
    expect(applied.slides[4].bgImage).toBe(mockPanorama5.url);
    // O 6º slide (índice 5) fica sem imagem de fundo
    expect(applied.slides[5].bgImage).toBe("");
    expect(applied.slides[5].bgPlacement).toBeUndefined();
  });

  it("remove panorama seamless corretamente de todos os slides", () => {
    const postWith5Slides: CanvasPostModel = {
      ...INITIAL_POST,
      slides: [
        { id: "s1", headline: "1", subtext: "1", step: "1" },
        { id: "s2", headline: "2", subtext: "2", step: "2" },
      ],
    };

    const applied = applySeamlessPanoramaToPost(postWith5Slides, mockPanorama5);
    expect(applied.slides[0].bgImage).toBe(mockPanorama5.url);

    const cleared = removeSeamlessPanoramaFromPost(applied);
    expect(cleared.slides[0].bgImage).toBe("");
    expect(cleared.slides[1].bgImage).toBe("");
  });

  it("detectActiveSeamlessPanorama identifica corretamente o panorama ativo", () => {
    const postWith5Slides: CanvasPostModel = {
      ...INITIAL_POST,
      slides: [
        { id: "s1", headline: "1", subtext: "1", step: "1" },
        { id: "s2", headline: "2", subtext: "2", step: "2" },
      ],
    };

    const applied = applySeamlessPanoramaToPost(postWith5Slides, mockPanorama5);
    const detected = detectActiveSeamlessPanorama(applied, [mockPanorama5, mockPanorama7]);

    expect(detected).not.toBeNull();
    expect(detected?.panorama.id).toBe("test-pano-5");
    expect(detected?.startOffset).toBe(0);
  });

  it("garante continuidade contínua de corte (1080px por fatia) entre slides sucessivos", () => {
    const postWith5Slides: CanvasPostModel = {
      ...INITIAL_POST,
      slides: [
        { id: "s1", headline: "1", subtext: "1", step: "1" },
        { id: "s2", headline: "2", subtext: "2", step: "2" },
        { id: "s3", headline: "3", subtext: "3", step: "3" },
        { id: "s4", headline: "4", subtext: "4", step: "4" },
        { id: "s5", headline: "5", subtext: "5", step: "5" },
      ],
    };

    const applied = applySeamlessPanoramaToPost(postWith5Slides, mockPanorama5);

    // Panorama 5400x1350 para viewport 360x450 (ratio 4:5):
    // Cada fatia no asset original tem 1080x1350px.
    const cuts = applied.slides.map(slide => {
      const focal = slide.bgPlacement?.focalPoint ?? { x: 0.5, y: 0.5 };
      return computeCoverCrop(mockPanorama5.width, mockPanorama5.height, 360, 450, focal);
    });

    expect(cuts[0]).toEqual({ x: 0, y: 0, width: 1080, height: 1350 });
    expect(cuts[1]).toEqual({ x: 1080, y: 0, width: 1080, height: 1350 });
    expect(cuts[2]).toEqual({ x: 2160, y: 0, width: 1080, height: 1350 });
    expect(cuts[3]).toEqual({ x: 3240, y: 0, width: 1080, height: 1350 });
    expect(cuts[4]).toEqual({ x: 4320, y: 0, width: 1080, height: 1350 });

    // Cada corte deve começar exatamente onde o anterior terminou (continuidade perfeita)
    for (let i = 1; i < cuts.length; i++) {
      expect(cuts[i].x).toBe(cuts[i - 1].x + cuts[i - 1].width);
    }
  });

  it("aplica focalX contínuo em composições do Arsenal V2 elevando para V3", () => {
    const postWithCompositions: CanvasPostModel = {
      ...INITIAL_POST,
      slides: [
        { id: "s1", headline: "1", subtext: "1", step: "1", composition: createArsenalFixtureComposition() },
        { id: "s2", headline: "2", subtext: "2", step: "2", composition: createArsenalFixtureComposition() },
        { id: "s3", headline: "3", subtext: "3", step: "3", composition: createArsenalFixtureComposition() },
      ],
    };

    const applied = applySeamlessPanoramaToPost(postWithCompositions, mockPanorama5);

    // Todas as composições devem ser promovidas para V3 com focalX contínuo
    expect(applied.slides[0].composition?.version).toBe(3);
    expect((applied.slides[0].composition as any)?.customBackground?.focalX).toBe(0 / 4);
    expect((applied.slides[1].composition as any)?.customBackground?.focalX).toBe(1 / 4);
    expect((applied.slides[2].composition as any)?.customBackground?.focalX).toBe(2 / 4);

    // Imagem do customBackground deve ser a URL do panorama
    expect((applied.slides[0].composition as any)?.customBackground?.imageUrl).toBe(mockPanorama5.url);
    expect((applied.slides[1].composition as any)?.customBackground?.imageUrl).toBe(mockPanorama5.url);
  });
});
