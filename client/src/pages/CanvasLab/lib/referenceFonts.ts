import type { ReferenceReconstructionSpecV2 } from "@shared/referenceReconstruction";

const loadedFaces = new Map<string, Promise<void>>();

export function referenceFontFamily(scene: ReferenceReconstructionSpecV2, family: string | null, weight: number): string {
  if (!family) return "Arial";
  const asset = scene.fonts.find(font => font.family === family && font.weight === weight && font.sha256 && font.dataUrl);
  return asset ? `ReferenceFont_${asset.sha256!.slice(0, 24)}` : family;
}

export async function ensureReferenceFontsLoaded(scene: ReferenceReconstructionSpecV2): Promise<void> {
  await Promise.all(scene.fonts.filter(font => font.dataUrl).map(font => {
    const key = `${font.sha256 ?? font.dataUrl}:${font.family}:${font.weight}`;
    let loading = loadedFaces.get(key);
    if (!loading) {
      loading = (async () => {
        const alias = referenceFontFamily(scene, font.family, font.weight);
        const face = new FontFace(alias, `url(${font.dataUrl})`, { weight: String(font.weight) });
        await face.load();
        document.fonts.add(face);
      })();
      loadedFaces.set(key, loading);
      void loading.catch(() => loadedFaces.delete(key));
    }
    return loading;
  }));
}
