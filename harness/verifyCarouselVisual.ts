/** Offline visual verification against recorded complete designs. No provider calls.
 * Usage: node --import tsx harness/verifyCarouselVisual.ts <audit.json> <asset-dir> <output-dir>
 * Copy is replayed, not rewritten by a model. Generated photos are represented by
 * an explicit neutral placeholder so this check needs neither remote storage nor paid APIs. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { authorCarouselVisualSequence } from "../server/designCatalog/carouselVisualVariants";
import {
  completeDesignFields,
  instantiateCompleteDesign,
} from "../shared/completeDesignGeneration";
import { resolveArsenalGeometry } from "../shared/arsenalGeometry";
import { arsenalHash } from "../shared/arsenalContent";
import { createComponentTextMeasurer } from "../server/ai/componentTextMeasurer";
import { partitionArsenalReadinessIssues } from "../shared/arsenalReadiness";
import {
  renderReviewScenes,
  closeReviewRenderer,
} from "../server/ai/workflows/proposalRenderer";
import type { ComponentDefinitionV1 } from "../shared/componentAssembly";
import type { ArsenalAsset } from "../shared/designArsenal";

globalThis.fetch = async () => {
  throw new Error("offline_verification_network_forbidden");
};
const [auditFile, assetDir, outputDir] = process.argv.slice(2);
if (!auditFile || !assetDir || !outputDir)
  throw new Error("audit_asset_and_output_paths_required");
const output = resolve(outputDir);
await mkdir(output, { recursive: true });
const audits = JSON.parse(await readFile(auditFile, "utf8")).audits;
const request = audits.find(
  (a: any) => a.request.input.postMode === "carousel"
).request;
const loadAssetBytes = (asset: ArsenalAsset) =>
  readFile(resolve(assetDir, asset.sha256));
const placeholder = createCanvas(600, 400),
  photo = placeholder.getContext("2d");
photo.fillStyle = "#D6D8D7";
photo.fillRect(0, 0, 600, 400);
photo.fillStyle = "#333333";
photo.font = "24px sans-serif";
photo.textAlign = "center";
photo.fillText("Área de foto preservada", 300, 200);
const placeholderUri = `data:image/png;base64,${placeholder.toBuffer("image/png").toString("base64")}`;
const records: any[] = [];
try {
  for (const [slot, originals] of Array.from(
    (
      request.prepared.selectedDefinitions as ComponentDefinitionV1[][]
    ).entries()
  )) {
    const definitions = authorCarouselVisualSequence(originals);
    const measureText = await createComponentTextMeasurer(
      definitions.flatMap(d => d.assets),
      loadAssetBytes
    );
    const scenes = definitions.map((definition, index) => {
      const content =
        request.proposals[slot].bundle.slides[index].composition.content;
      const values = completeDesignFields(definition).map(field => {
        const original = content.blocks.find((b: any) => b.id === field.id);
        return {
          fieldId: field.id,
          value:
            original?.type === "list"
              ? original.items.map((i: any) => i.text)
              : (original?.text ??
                (field.role === "callToAction" ? "Conheça o BizuMiner" : "")),
        };
      });
      const scene = resolveArsenalGeometry(
        instantiateCompleteDesign({
          definition,
          values,
          mediaPrompts: [],
          runId: request.id,
          slot,
          slide: index,
          planHash: arsenalHash("offline-visual-policy-v1"),
          experimental: true,
        }),
        { measureText, allowReduction: true }
      );
      for (const media of scene.base.mediaSlots ?? [])
        scene.media[media.id] = {
          kind: "user",
          url: placeholderUri,
          focalX: 0.5,
          focalY: 0.5,
        };
      const readiness = partitionArsenalReadinessIssues(scene.issues);
      if (readiness.blocking.length)
        throw new Error(
          `slot:${slot}:slide:${index}:${readiness.blocking.join(",")}`
        );
      scene.issues = [];
      scene.state = "applied";
      return scene;
    });
    const rendered = await renderReviewScenes({
      compositions: scenes,
      definitions,
      actor: "offline-carousel-verification",
      loadAssetBytes,
      deadlineMs: Date.now() + 60000,
    });
    for (const scene of rendered)
      await writeFile(
        resolve(output, `proposal-${slot}-slide-${scene.slideIndex}.png`),
        Buffer.from(scene.dataUri.split(",")[1], "base64")
      );
    await writeFile(
      resolve(output, `proposal-${slot}-scenes.json`),
      JSON.stringify(scenes, null, 2)
    );
    records.push({
      slot,
      family: definitions[0].completeDesign!.family,
      coverUnchanged: definitions[0] === originals[0],
      slides: definitions.map((d, index) => ({
        role:
          index === 0
            ? "cover"
            : index === definitions.length - 1
              ? "closing"
              : "development",
        id: d.id,
        hash: d.hash,
        sourceId:
          d.completeDesign?.designGuidance?.carouselVariant?.sourceId ?? d.id,
        compositionHash: arsenalHash(scenes[index]),
        png: `proposal-${slot}-slide-${index}.png`,
        shapeCount: d.fragment.instances.filter(
          i => !["text", "media"].includes(d.pieces[i.pieceHash].kind)
        ).length,
      })),
    });
  }
} finally {
  await closeReviewRenderer();
}
const contact = createCanvas(1536, records.length * 520),
  ctx = contact.getContext("2d");
ctx.fillStyle = "#15171A";
ctx.fillRect(0, 0, contact.width, contact.height);
for (const [row, record] of records.entries())
  for (const [column, slide] of record.slides.entries()) {
    const png = await loadImage(resolve(output, slide.png)),
      x = column * 384,
      y = row * 520;
    ctx.drawImage(png, x + 8, y + 8, 368, 460);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "15px sans-serif";
    ctx.fillText(
      `${record.family.slice(0, 22)} · ${slide.role}`,
      x + 8,
      y + 492
    );
  }
await writeFile(resolve(output, "CONTACT.png"), contact.toBuffer("image/png"));
await writeFile(
  resolve(output, "verification-summary.json"),
  JSON.stringify(
    {
      sourceRequest: request.id,
      renderer: "CanvasPostStage",
      providerCalls: 0,
      copy: "Recorded values; missing closing CTA uses supplied brand invitation as fixed verification input",
      photos: "Explicit neutral placeholders; native slots preserved",
      records,
    },
    null,
    2
  )
);
console.log(
  JSON.stringify({
    output,
    proposals: records.length,
    slides: records.reduce((n, r) => n + r.slides.length, 0),
    providerCalls: 0,
    coverUnchanged: records.every(r => r.coverUnchanged),
  })
);
