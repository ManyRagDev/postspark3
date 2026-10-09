import type { ReferenceFontAsset, ReferenceReconstructionSpecV2 } from "@shared/referenceReconstruction";

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

async function captureFont(family: string, weight: number): Promise<ReferenceFontAsset> {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&display=swap`;
  const response = await fetch(cssUrl, { mode: "cors", signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`${family}: catálogo de fontes respondeu HTTP ${response.status}.`);
  const css = await response.text();
  const blocks = Array.from(css.matchAll(/(?:\/\*\s*([^*]+)\s*\*\/\s*)?@font-face\s*\{([^}]+)\}/g), match => ({ subset: match[1]?.trim() ?? "", css: match[2] }));
  const matching = blocks.find(block => block.subset === "latin" && new RegExp(`font-weight:\\s*${weight}(?:\\s*;|\\s*$)`).test(block.css))
    ?? blocks.find(block => new RegExp(`font-weight:\\s*${weight}(?:\\s*;|\\s*$)`).test(block.css))
    ?? blocks.find(block => block.subset === "latin" && /font-weight:\s*100 900/.test(block.css));
  const fontUrl = matching?.css.match(/url\((https:\/\/[^)]+)\)/)?.[1];
  if (!fontUrl || !fontUrl.startsWith("https://fonts.gstatic.com/")) throw new Error(`${family}: o arquivo da fonte não foi encontrado no CSS aberto.`);
  const fontResponse = await fetch(fontUrl, { mode: "cors", signal: AbortSignal.timeout(15_000) });
  if (!fontResponse.ok) throw new Error(`${family}: não foi possível baixar o arquivo da fonte.`);
  const bytes = new Uint8Array(await fontResponse.arrayBuffer());
  if (!bytes.length || bytes.length > 3_000_000) throw new Error(`${family}: arquivo de fonte vazio ou grande demais.`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  const mimeType = fontUrl.includes(".woff2") ? "font/woff2" : fontUrl.includes(".woff") ? "font/woff" : "font/ttf";
  return {
    family, weight, sourceUrl: fontUrl, mimeType,
    dataUrl: `data:${mimeType};base64,${toBase64(bytes)}`,
    sha256, license: "open-source",
  };
}

export async function captureReferenceFonts(scene: ReferenceReconstructionSpecV2, concurrency = 1): Promise<{
  scene: ReferenceReconstructionSpecV2;
  failures: string[];
}> {
  const requested = new Map<string, { family: string; weight: number }>();
  scene.layers.filter(layer => layer.kind === "text" || layer.kind === "arcText").forEach(layer => {
    if (layer.fontFamily) requested.set(`${layer.fontFamily}:${layer.fontWeight}`, { family: layer.fontFamily, weight: layer.fontWeight });
  });
  const requests = Array.from(requested.values());
  const fonts: ReferenceFontAsset[] = new Array(requests.length);
  const failures: string[] = [];
  let cursor = 0;
  const worker = async () => { while (cursor < requests.length) {
    const index = cursor++;
    const request = requests[index];
    const existing = scene.fonts.find(font => font.family === request.family && font.weight === request.weight && font.dataUrl);
    if (existing) { fonts[index] = existing; continue; }
    try {
      fonts[index] = await captureFont(request.family, request.weight);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : `${request.family}: fonte indisponível.`);
      fonts[index] = { family: request.family, weight: request.weight, sourceUrl: null, mimeType: null, dataUrl: null, sha256: null, license: "unknown" };
    }
  } };
  await Promise.all(Array.from({ length: Math.min(3, Math.max(1, concurrency), requests.length) }, worker));
  return { scene: { ...scene, fonts }, failures };
}

export function unresolvedReferenceFonts(scene: ReferenceReconstructionSpecV2): string[] {
  return scene.layers.filter(layer => layer.kind === "text" || layer.kind === "arcText").flatMap(layer => {
    const asset = scene.fonts.find(font => font.family === layer.fontFamily && font.weight === layer.fontWeight && font.dataUrl);
    return asset ? [] : [`${layer.role}: ${layer.fontFamily ?? "fonte não escolhida"} ${layer.fontWeight}`];
  });
}
