import type { CanvasPostModel, CarouselSlideItem } from "../components/types";
import { setArsenalCustomBackground } from "./arsenalComposition";
import { resolveLegibleTextColor } from "../components/types";

export interface SeamlessPanoramaMeta {
  id: string;
  name: string;
  slideCount: number;
  width: number;
  height: number;
  url: string;
  previewUrl: string;
  series: "Editorial" | "Arte Conceitual" | string;
  defaultOverlayOpacity: number;
  fallbackBgColor: string;
  isDark: boolean;
}

/**
 * Aplica um panorama contínuo (Seamless) ao carrossel de forma pura e determinística.
 * 
 * Regras:
 * 1. Para cada slide `i` do post dentro do alcance do panorama:
 *    focalX = slideCount > 1 ? panoIndex / (slideCount - 1) : 0.5
 * 2. Se o carrossel tiver menos slides que o panorama (M < N):
 *    os slides restantes do panorama são cortados naturalmente sem problemas.
 * 3. Se o carrossel tiver mais slides que o panorama (M > N):
 *    os slides excedentes (fora do alcance) ficam limpos sem imagem de fundo (bgImage = ""),
 *    preservando ou adotando a cor de fundo harmônica do post.
 * 4. Ajusta o overlayOpacity padrão (0 para séries editoriais claras com safe zones).
 */
export function applySeamlessPanoramaToPost(
  post: CanvasPostModel,
  panorama: SeamlessPanoramaMeta,
  startSlideOffset: number = 0
): CanvasPostModel {
  const panoSlideCount = panorama.slideCount;
  const overlayOpacity = panorama.defaultOverlayOpacity;

  // Harmoniza a paleta do post com o fundo se necessário
  const nextPalette = {
    ...post.palette,
    background: panorama.fallbackBgColor || post.palette.background,
    text: resolveLegibleTextColor(panorama.fallbackBgColor || post.palette.background, post.palette.text),
  };

  const nextSlides: CarouselSlideItem[] = post.slides.map((slide, index) => {
    const panoIndex = index - startSlideOffset;
    const isCovered = panoIndex >= 0 && panoIndex < panoSlideCount;

    const currentCustomBg =
      slide.composition && slide.composition.version === 3
        ? slide.composition.customBackground
        : undefined;

    if (!isCovered) {
      // Slide fora da faixa do panorama (ex.: slide 6 em panorama de 5):
      // Fica sem imagem de fundo (apenas com a cor sólida complementar)
      if (slide.composition) {
        return {
          ...slide,
          composition: setArsenalCustomBackground(slide.composition, {
            ...currentCustomBg,
            imageUrl: undefined,
          }),
          bgImage: "",
          bgTransform: undefined,
          bgPlacement: undefined,
        };
      }
      return {
        ...slide,
        bgImage: "",
        bgTransform: undefined,
        bgPlacement: undefined,
      };
    }

    // Slide coberto pelo panorama
    const focalX = panoSlideCount > 1 ? panoIndex / (panoSlideCount - 1) : 0.5;
    const focalY = 0.5;

    if (slide.composition) {
      return {
        ...slide,
        composition: setArsenalCustomBackground(slide.composition, {
          ...currentCustomBg,
          imageUrl: panorama.url,
          fitMode: "cover",
          focalX,
          focalY,
          overlayOpacity,
        }),
        bgImage: panorama.url,
        bgTransform: undefined,
        bgPlacement: {
          fitMode: "cover",
          focalPoint: { x: focalX, y: focalY },
        },
        visualStyle: {
          ...slide.visualStyle,
          overlayOpacity,
        },
      };
    }

    return {
      ...slide,
      bgImage: panorama.url,
      bgTransform: undefined,
      bgPlacement: {
        fitMode: "cover",
        focalPoint: { x: focalX, y: focalY },
      },
      visualStyle: {
        ...slide.visualStyle,
        overlayOpacity,
      },
    };
  });

  return {
    ...post,
    bgTransform: undefined,
    bgPlacement: undefined,
    palette: nextPalette,
    overlayOpacity,
    slides: nextSlides,
  };
}

/**
 * Remove o panorama seamless de todos os slides do post, voltando a fundo limpo/sólido.
 */
export function removeSeamlessPanoramaFromPost(post: CanvasPostModel): CanvasPostModel {
  const nextSlides: CarouselSlideItem[] = post.slides.map((slide) => {
    if (slide.composition) {
      const currentCustomBg =
        slide.composition.version === 3 ? slide.composition.customBackground : undefined;
      return {
        ...slide,
        composition: setArsenalCustomBackground(slide.composition, {
          ...currentCustomBg,
          imageUrl: undefined,
        }),
        bgImage: "",
        bgTransform: undefined,
        bgPlacement: undefined,
      };
    }
    return {
      ...slide,
      bgImage: "",
      bgTransform: undefined,
      bgPlacement: undefined,
    };
  });

  return {
    ...post,
    bgTransform: undefined,
    bgPlacement: undefined,
    slides: nextSlides,
  };
}

/**
 * Detecta se o post possui atualmente um panorama Seamless aplicado.
 */
export function detectActiveSeamlessPanorama(
  post: CanvasPostModel,
  panoramas: SeamlessPanoramaMeta[]
): { panorama: SeamlessPanoramaMeta; startOffset: number } | null {
  for (const slide of post.slides) {
    const bgUrl = slide.composition?.version === 3
      ? slide.composition.customBackground?.imageUrl
      : slide.bgImage;

    if (bgUrl) {
      const match = panoramas.find((p) => p.url === bgUrl || bgUrl.includes(p.id));
      if (match) {
        // Encontra o primeiro slide com esse panorama para deduzir o startOffset
        const firstIndex = post.slides.findIndex((s) => {
          const u = s.composition?.version === 3 ? s.composition.customBackground?.imageUrl : s.bgImage;
          return u === match.url || (u && u.includes(match.id));
        });
        return {
          panorama: match,
          startOffset: Math.max(0, firstIndex),
        };
      }
    }
  }
  return null;
}
