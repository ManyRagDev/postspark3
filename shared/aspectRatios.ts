/** Formats offered for new posts. 5:6 is retained only for historical documents. */
export const generationAspectRatios = ["1:1", "4:5", "9:16"] as const;
export const storedAspectRatios = ["1:1", "4:5", "5:6", "9:16"] as const;
export type StoredAspectRatio = (typeof storedAspectRatios)[number];
export const aspectRatioDimensions: Record<
  StoredAspectRatio,
  { width: number; height: number }
> = {
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
  "5:6": { width: 1080, height: 1296 },
  "9:16": { width: 1080, height: 1920 },
};
export function aspectRatioHeight(
  ratio: StoredAspectRatio,
  width = 360
): number {
  const size = aspectRatioDimensions[ratio];
  return (width * size.height) / size.width;
}
export function isPortraitRatio(ratio: string): boolean {
  return ratio === "4:5" || ratio === "5:6";
}
