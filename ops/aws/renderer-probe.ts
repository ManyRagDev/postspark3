/** Real offline CanvasLab rendering inside the production container; no DB or AI. */
import { readFile, writeFile } from "node:fs/promises";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import fixture from "../../client/src/pages/CanvasLab/arsenal/windowFixture.json";
import bundled from "../../shared/arsenalBundledAssets.json";
import { arsenalHash, designContentDocumentSchema } from "../../shared/arsenalContent";
import { arsenalVariantSchema, arsenalOriginSchema, arsenalPieceSchema, arsenalAssetSchema, type ArsenalComposition } from "../../shared/designArsenal";
import { resolveArsenalGeometry } from "../../shared/arsenalGeometry";
import { createComponentTextMeasurer } from "../../server/ai/componentTextMeasurer";
import { renderReviewScenes, closeReviewRenderer } from "../../server/ai/workflows/proposalRenderer";

const assets = fixture.assets.map(asset => arsenalAssetSchema.parse(asset));
const loadBytes = async (asset: (typeof assets)[number]) => {
  const entry = (bundled as Record<string, { path: string }>)[asset.id];
  if (!entry || !entry.path.startsWith("/arsenal/fonts/") || entry.path.includes(".."))
    throw new Error("Probe accepts only local bundled fonts");
  return readFile(`client/public${entry.path}`);
};
const content = designContentDocumentSchema.parse(fixture.content);
const base = arsenalVariantSchema.parse(fixture.variant);
const raw: ArsenalComposition = {
  version: 2, origin: arsenalOriginSchema.parse(fixture.origin), base,
  pieces: Object.fromEntries(Object.entries(fixture.pieces).map(([key, value]) => [key, arsenalPieceSchema.parse(value)])),
  assets, content, userContentHash: arsenalHash(content), generatedContentHash: arsenalHash(content),
  contentRevision: 0, elements: [], groups: base.groups, relations: base.relations,
  overrides: {}, richText: {}, media: {}, seed: 0, state: "needs_adjustment", issues: [],
  layoutOrigin: "catalog-variant", sourceVariantKey: base.variantKey,
  effectiveAspectRatio: base.aspectRatio, projection: { scale: 1, x: 0, y: 0 }, artboard: base.artboard,
};
const measureText = await createComponentTextMeasurer(assets, loadBytes);
const composition = resolveArsenalGeometry(raw, { measureText, allowReduction: false });
const media = createCanvas(400, 300);
const context = media.getContext("2d");
context.fillStyle = "#0d7490";
context.fillRect(0, 0, 400, 300);
context.fillStyle = "#f8fafc";
context.fillRect(60, 60, 280, 180);
const uri = media.toDataURL("image/png");
for (const element of composition.elements.filter(element => element.kind === "media"))
  composition.media[element.id] = { kind: "user", url: uri, focalX: 0.5, focalY: 0.5 };
const started = Date.now();
const slideCount = Number(process.env.POSTSPARK_PROBE_SLIDES ?? "5");
if (!Number.isInteger(slideCount) || slideCount < 1 || slideCount > 10)
  throw new Error("Probe slide count must be between 1 and 10");
try {
  const batches = await Promise.all(Array.from({ length: 3 }, () => renderReviewScenes({
    actor: "00000000-0000-4000-8000-000000000001", definitions: [],
    compositions: Array.from({ length: slideCount }, () => structuredClone(composition)),
    loadAssetBytes: loadBytes, deadlineMs: Date.now() + 90_000,
  })));
  const scenes = batches.flat();
  for (const scene of scenes) {
    const png = Buffer.from(scene.dataUri.split(",")[1], "base64");
    const decoded = await loadImage(png);
    if (png.length < 1000 || decoded.width !== 1200 || decoded.height !== 1440)
      throw new Error(`Unexpected PNG: ${decoded.width}x${decoded.height}, ${png.length} bytes`);
  }
  await writeFile(process.env.POSTSPARK_PROBE_OUTPUT ?? "/tmp/postspark-renderer-probe.png", Buffer.from(scenes[0].dataUri.split(",")[1], "base64"));
  let memoryPeakBytes: number | null = null;
  try { memoryPeakBytes = Number((await readFile("/sys/fs/cgroup/memory.peak", "utf8")).trim()); } catch {}
  console.log(JSON.stringify({ renderer: "CanvasPostStage", concurrentSequences: batches.length,
    renderedSlides: scenes.length, width: scenes[0].width, height: scenes[0].height,
    durationMs: Date.now() - started, memoryPeakBytes, aiCalls: 0, databaseCalls: 0 }));
} finally {
  await closeReviewRenderer();
}
