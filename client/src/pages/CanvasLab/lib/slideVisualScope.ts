import type { CanvasPostModel, CarouselSlideItem } from "../components/types";

type SlideVisualPatch = Pick<Partial<CarouselSlideItem>, "bgImage" | "bgPlacement" | "bgTransform" | "splitBgPosition">;

/** Escopo explícito para propriedades visuais que pertencem a cada slide. */
export function applySlideVisualPatch(
  post: CanvasPostModel,
  patch: SlideVisualPatch,
  allSlides: boolean,
): Partial<CanvasPostModel> {
  if (post.slides.length === 0) return patch;

  // String vazia é a remoção explícita: undefined voltaria ao fundo global legado.
  const slidePatch = "bgImage" in patch && patch.bgImage === undefined
    ? { ...patch, bgImage: "" }
    : patch;
  const slides = post.slides.map((slide, index) =>
    allSlides || index === post.currentSlideIndex ? { ...slide, ...slidePatch } : slide,
  );

  return allSlides ? { ...patch, slides } : { slides };
}
