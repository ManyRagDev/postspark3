import type { OrchestratedGenerationInput } from "@shared/generationRequest";
import { resolveProposalMediaReferences } from "./proposalMedia";
export async function resolveGenerationVisualImages(
  input: OrchestratedGenerationInput,
  owner: string,
  signal?: AbortSignal
) {
  const images = Array.from(
    new Set([
      ...(input.sources ?? [])
        .filter(s => s.kind === "image" && s.purpose === "visual_reference")
        .map(s => s.value),
      ...(input.executionBrief?.brandInput?.referenceImageUrl
        ? [input.executionBrief.brandInput.referenceImageUrl]
        : []),
    ])
  );
  if (images.length > 4) throw new Error("Use até quatro referências visuais.");
  const originals = await resolveProposalMediaReferences(
    images.map(v => (v.startsWith("data:") ? { dataUri: v } : { url: v })),
    owner,
    undefined,
    {},
    signal
  );
  const pixels = originals.map(i =>
    "url" in i ? i.url : `data:${i.mimeType};base64,${i.b64Json}`
  ) as string[];
  if (pixels.reduce((n, s) => n + s.length, 0) > 16_000_000)
    throw new Error("As referências visuais excedem o limite.");
  return { images: pixels };
}
export async function resolveGenerationVisualSites(
  input: OrchestratedGenerationInput
) {
  const urls = Array.from(
    new Set(
      (input.sources ?? [])
        .filter(s => s.kind === "url" && s.purpose === "visual_reference")
        .map(s => s.value)
    )
  );
  const { extractStyleFromUrlWithMeta } = await import("../../styleExtractor");
  const results = [];
  for (const url of urls) {
    const result = await extractStyleFromUrlWithMeta(url);
    results.push({ url, ...result });
  }
  return { sites: results };
}
