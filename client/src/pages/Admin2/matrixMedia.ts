import type { RecreationRecipe } from "@shared/designRecreation";
import {
  matrixMediaAssetSchema,
  type MatrixMediaAsset,
} from "@shared/designMatrix";
import { prepareReference } from "./recipe";

export type ReferenceMediaImage = {
  layerId: string;
  image: HTMLImageElement;
  positionX: number;
  positionY: number;
};

export async function prepareMatrixMedia(
  file: File
): Promise<MatrixMediaAsset> {
  const result = await prepareReference(file);
  const bytes = Uint8Array.from(atob(result.dataUrl.split(",")[1]), c =>
    c.charCodeAt(0)
  );
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return matrixMediaAssetSchema.parse({
    dataUrl: result.dataUrl,
    width: result.width,
    height: result.height,
    sha256: Array.from(new Uint8Array(hash), b =>
      b.toString(16).padStart(2, "0")
    ).join(""),
  });
}

/** Decode before mounting the Stage so exports cannot omit a photo that is still loading. */
export async function loadMatrixMedia(
  recipe: RecreationRecipe
): Promise<ReferenceMediaImage[]> {
  return Promise.all(
    (recipe.matrix?.media ?? [])
      .filter(m => m.asset)
      .map(async slot => {
        const asset = slot.asset!;
        const image = new Image();
        image.src = asset.dataUrl;
        await image.decode();
        if (
          image.naturalWidth !== asset.width ||
          image.naturalHeight !== asset.height
        )
          throw new Error(
            `${slot.label}: dimensões da foto não correspondem ao arquivo salvo.`
          );
        return {
          layerId: slot.layerId,
          image,
          positionX: slot.positionX,
          positionY: slot.positionY,
        };
      })
  );
}
