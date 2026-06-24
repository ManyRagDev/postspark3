import type { CarouselSlide, PostVariation } from "@shared/postspark";
import type { LayoutTarget } from "@/store/editorStore";

export interface PostEditorBindings {
  layoutTarget: LayoutTarget;
  isMagnetActive: boolean;
  setLayoutTarget(target: LayoutTarget): void;
  updateVariation(patch: Partial<PostVariation>): void;
  updateSlide(index: number, patch: Partial<CarouselSlide>): void;
  removeImageElement(id: string): void;
}
