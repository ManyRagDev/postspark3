import { describe, expect, it } from "vitest";
import {
  computeBackgroundGeometry,
  computeCoverCrop,
  createDefaultPlacement,
} from "./backgroundPlacement";
import {
  INITIAL_POST,
  type CanvasPostModel,
} from "../components/types";
import {
  setCurrentSlideBackground,
  setCurrentSlideBackgroundPlacement,
} from "./documentCommands";
import { normalizeCanvasModel } from "./saveAdapter";

describe("backgroundPlacement - Etapa 6", () => {
  const imageWidth = 1920;
  const imageHeight = 1080;
  const baseWidth = 1080;
  const baseHeight = 1080; // proporção 1:1 quadrada

  describe("computeCoverCrop", () => {
    it("calcula crop proporcional centralizado para cover em container 1:1", () => {
      // Imagem 16:9 em container 1:1 corta as laterais
      const crop = computeCoverCrop(imageWidth, imageHeight, baseWidth, baseHeight);
      expect(crop.height).toBe(1080);
      expect(crop.width).toBe(1080);
      // Ponto focal central (0.5): (1920 - 1080) * 0.5 = 420
      expect(crop.x).toBe(420);
      expect(crop.y).toBe(0);
    });

    it("respeita o ponto focal para ancorar o corte na esquerda ou direita", () => {
      // Focal point x: 0 (ancorado à esquerda)
      const cropLeft = computeCoverCrop(imageWidth, imageHeight, baseWidth, baseHeight, { x: 0, y: 0.5 });
      expect(cropLeft.x).toBe(0);

      // Focal point x: 1 (ancorado à direita)
      const cropRight = computeCoverCrop(imageWidth, imageHeight, baseWidth, baseHeight, { x: 1, y: 0.5 });
      expect(cropRight.x).toBe(840); // 1920 - 1080 = 840
    });
  });

  describe("computeBackgroundGeometry", () => {
    it("modo cover preenche todo o container", () => {
      const layout = computeBackgroundGeometry({
        imageWidth,
        imageHeight,
        baseWidth,
        baseHeight,
        placement: { fitMode: "cover" },
      });

      expect(layout.x).toBe(0);
      expect(layout.y).toBe(0);
      expect(layout.width).toBe(1080);
      expect(layout.height).toBe(1080);
      expect(layout.crop).toBeDefined();
      expect(layout.crop?.width).toBe(1080);
    });

    it("modo contain exibe a imagem inteira sem cortes com letterbox centralizado", () => {
      const layout = computeBackgroundGeometry({
        imageWidth,
        imageHeight,
        baseWidth,
        baseHeight,
        placement: { fitMode: "contain" },
      });

      // Sem cortes na imagem original
      expect(layout.crop).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
      // Escala: 1080 / 1920 = 0.5625 -> width: 1080, height: 608
      expect(layout.width).toBe(1080);
      expect(layout.height).toBe(608);
      expect(layout.x).toBe(0);
      expect(layout.y).toBe(236); // (1080 - 608) / 2 = 236 (centralizado verticalmente)
    });

    it("modo original preserva dimensões naturais 1:1", () => {
      const layout = computeBackgroundGeometry({
        imageWidth: 600,
        imageHeight: 400,
        baseWidth,
        baseHeight,
        placement: { fitMode: "original" },
      });

      expect(layout.crop).toEqual({ x: 0, y: 0, width: 600, height: 400 });
      expect(layout.width).toBe(600);
      expect(layout.height).toBe(400);
      expect(layout.x).toBe(240); // (1080 - 600) / 2
      expect(layout.y).toBe(340); // (1080 - 400) / 2
    });

    it("aplica suporte ao brutal split com metade inferior ou superior", () => {
      const layout = computeBackgroundGeometry({
        imageWidth,
        imageHeight,
        baseWidth,
        baseHeight,
        splitBgPos: "bottom",
        isBrutalSplit: true,
        placement: { fitMode: "cover" },
      });

      expect(layout.height).toBe(540); // metade de 1080
      expect(layout.y).toBe(540); // começa na metade inferior
      expect(layout.crop?.height).toBe(960); // 1920 / 2 = 960
      expect(layout.crop?.width).toBe(1920); // largura total da imagem 16:9
    });

    it("aplica transformações de arrasto manual sobre o layout computado", () => {
      const layout = computeBackgroundGeometry({
        imageWidth,
        imageHeight,
        baseWidth,
        baseHeight,
        placement: { fitMode: "cover" },
        transformOverride: { x: 50, y: -20, scaleX: 1.2, scaleY: 1.2, rotation: 5 },
      });

      expect(layout.x).toBe(50);
      expect(layout.y).toBe(-20);
      expect(layout.scaleX).toBe(1.2);
      expect(layout.scaleY).toBe(1.2);
      expect(layout.rotation).toBe(5);
    });
  });

  describe("Isolamento por slide e persistência", () => {
    it("alterar o enquadramento de um slide não contamina os outros slides", () => {
      const post: CanvasPostModel = {
        ...INITIAL_POST,
        slides: [
          { id: "s1", step: "1", headline: "A", subtext: "A", bgImage: "img-1.jpg" },
          { id: "s2", step: "2", headline: "B", subtext: "B", bgImage: "img-2.jpg" },
        ],
        currentSlideIndex: 0,
      };

      const updated = setCurrentSlideBackgroundPlacement(post, {
        fitMode: "contain",
        focalPoint: { x: 0.2, y: 0.2 },
      });

      expect(updated.slides[0].bgPlacement?.fitMode).toBe("contain");
      expect(updated.slides[0].bgPlacement?.focalPoint?.x).toBe(0.2);
      // Slide 2 permanece intocado
      expect(updated.slides[1].bgPlacement).toBeUndefined();
    });

    it("round-trip de normalização via saveAdapter preserva bgPlacement", () => {
      const postWithPlacement: CanvasPostModel = {
        ...INITIAL_POST,
        bgPlacement: { fitMode: "contain" },
        slides: [
          {
            id: "s1",
            step: "1",
            headline: "Capa",
            subtext: "Sub",
            bgImage: "https://site.com/photo.jpg",
            bgPlacement: { fitMode: "original", focalPoint: { x: 0.8, y: 0.8 } },
          },
        ],
      };

      const normalized = normalizeCanvasModel(postWithPlacement);
      expect(normalized.bgPlacement?.fitMode).toBe("contain");
      expect(normalized.slides[0].bgPlacement?.fitMode).toBe("original");
      expect(normalized.slides[0].bgPlacement?.focalPoint?.x).toBe(0.8);
    });
  });
});
