import type { ReferenceReconstructionSpecV2 } from "@shared/referenceReconstruction";

export function visualComparisonPass(comparison: {
  overallSimilarity: number;
  regions: Array<{ similarity: number }>;
}): boolean {
  return comparison.overallSimilarity >= 0.65 && comparison.regions.every(region => region.similarity >= 0.4);
}

async function readPixels(dataUrl: string, width: number, height: number): Promise<Uint8ClampedArray> {
  const response = await fetch(dataUrl);
  const bitmap = await createImageBitmap(await response.blob());
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Não foi possível comparar as imagens no navegador.");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return context.getImageData(0, 0, width, height).data;
}

function regionSimilarity(
  source: Uint8ClampedArray,
  rendered: Uint8ClampedArray,
  width: number,
  height: number,
  box: { x: number; y: number; width: number; height: number },
): number {
  const x0 = Math.max(0, Math.floor(box.x));
  const y0 = Math.max(0, Math.floor(box.y));
  const x1 = Math.min(width, Math.ceil(box.x + box.width));
  const y1 = Math.min(height, Math.ceil(box.y + box.height));
  if (x1 <= x0 || y1 <= y0) return 0;
  const stride = Math.max(1, Math.round(Math.min(width, height) / 250));
  let error = 0;
  let count = 0;
  for (let y = y0; y < y1; y += stride) {
    for (let x = x0; x < x1; x += stride) {
      const index = (y * width + x) * 4;
      const colorError = (Math.abs(source[index] - rendered[index]) + Math.abs(source[index + 1] - rendered[index + 1]) + Math.abs(source[index + 2] - rendered[index + 2])) / 765;
      const sourceEdge = Math.abs(source[index] - source[Math.min(source.length - 4, index + 4)]) / 255;
      const renderedEdge = Math.abs(rendered[index] - rendered[Math.min(rendered.length - 4, index + 4)]) / 255;
      error += colorError * 0.8 + Math.abs(sourceEdge - renderedEdge) * 0.2;
      count += 1;
    }
  }
  return Number(Math.max(0, 1 - error / Math.max(1, count)).toFixed(3));
}

export async function compareReferenceScene(input: {
  referenceDataUrl: string;
  renderDataUrl: string;
  scene: ReferenceReconstructionSpecV2;
  sceneHash: string;
}): Promise<{
  sceneHash: string;
  overallSimilarity: number;
  regions: Array<{ layerId: string; similarity: number }>;
  comparedAt: string;
}> {
  const width = input.scene.source.widthPx;
  const height = input.scene.source.heightPx;
  const [source, rendered] = await Promise.all([
    readPixels(input.referenceDataUrl, width, height),
    readPixels(input.renderDataUrl, width, height),
  ]);
  return {
    sceneHash: input.sceneHash,
    overallSimilarity: regionSimilarity(source, rendered, width, height, { x: 0, y: 0, width, height }),
    regions: input.scene.layers.map(layer => ({
      layerId: layer.id,
      similarity: regionSimilarity(source, rendered, width, height, layer),
    })),
    comparedAt: new Date().toISOString(),
  };
}
