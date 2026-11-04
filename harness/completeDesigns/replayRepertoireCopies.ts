/** Reapply journaled copy to a new immutable repertoire, with no model or DB access. */
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { arsenalHash } from "../../shared/arsenalContent";
import { componentDefinitionV1Schema } from "../../shared/componentAssembly";
import { instantiateCompleteDesign } from "../../shared/completeDesignGeneration";
import { readArsenalComposition } from "../../shared/designArsenal";
import { resolveArsenalGeometry } from "../../shared/arsenalGeometry";
import { partitionArsenalReadinessIssues } from "../../shared/arsenalReadiness";
import { createComponentTextMeasurer } from "../../server/ai/componentTextMeasurer";
import {
  renderReviewScenes,
  closeReviewRenderer,
} from "../../server/ai/workflows/proposalRenderer";

const root = path.resolve(process.argv[2]),
  previous = path.resolve(process.argv[3]),
  journal = path.resolve(process.argv[4]);
const read = async (file: string) =>
  JSON.parse(await fs.readFile(file, "utf8"));
const current = await read(path.join(root, "manifest.json")),
  prior = await read(path.join(previous, "manifest.json"));
const trace = await read(path.join(journal, "trace.json"));
const out = path.join(root, "real-copy-replay");
await fs.mkdir(out, { recursive: true });
const load = async (asset: { sha256: string }) =>
  fs.readFile(path.join(root, "assets", asset.sha256));
const rows: any[] = [];
try {
  for (const file of await fs.readdir(path.join(journal, "operations"))) {
    const operation = await read(path.join(journal, "operations", file));
    if (!operation.operationKey.endsWith(":candidate")) continue;
    const candidate = operation.result,
      slot = Number(candidate.proposalId.split("-").at(-1));
    const definitions = [];
    for (const scene of candidate.compositions) {
      const oldId = scene.origin.componentAssembly.componentIds[0];
      const old = componentDefinitionV1Schema.parse(
        await read(path.join(previous, "definitions", `${oldId}.json`))
      );
      const row = prior.rows.find(
        (r: any) => r.componentId === oldId || r.variantIds.includes(oldId)
      );
      const next = current.rows.find((r: any) => r.sourceId === row.sourceId);
      const pkg = await read(path.join(root, next.package));
      const variant = old.completeDesign?.designGuidance?.carouselVariant;
      const definition = pkg.components.find((d: any) => {
        const v = d.completeDesign?.designGuidance?.carouselVariant;
        return variant?.version === 3
          ? v?.version === 3 &&
              v.role === variant.role &&
              v.function === variant.function &&
              v.contentMode === variant.contentMode
          : !v;
      });
      if (!definition) throw new Error(`Missing successor for ${oldId}`);
      definitions.push(componentDefinitionV1Schema.parse(definition));
    }
    const measureText = await createComponentTextMeasurer(
      definitions[0].assets,
      load
    );
    const compositions = definitions.map((definition, slide) => {
      const resolved = readArsenalComposition(
        resolveArsenalGeometry(
          instantiateCompleteDesign({
            definition,
            values: candidate.copy.slides[slide].values,
            mediaPrompts: candidate.copy.slides[slide].mediaPrompts,
            runId: trace.id,
            slot,
            slide,
            planHash: arsenalHash(candidate.copy),
            experimental: true,
          }),
          { measureText, allowReduction: true, elasticReduction: true }
        )
      );
      // Same bounded fit persistence as proposalGraph.inspectScenes: editing and
      // reopening may resolve with reduction disabled, so keep the accepted fit.
      for (const e of resolved.elements) {
        const i = resolved.base.instances.find(i => i.id === e.id);
        if (
          e.kind === "text" &&
          i &&
          e.fontSize < resolved.pieces[i.pieceHash].fontSize
        )
          resolved.overrides[e.id] = {
            ...resolved.overrides[e.id],
            fontSize: e.fontSize,
          };
      }
      return resolved;
    });
    const renders = await renderReviewScenes({
      compositions,
      definitions,
      actor: "local-real-copy-replay",
      loadAssetBytes: load,
      deadlineMs: Date.now() + 60000,
    });
    const originalCall = trace.calls.find((c: any) => {
      if (
        c.label !== "proposal_review_initial" ||
        !Array.isArray(c.messages?.[1]?.content)
      )
        return false;
      try {
        return (
          arsenalHash(JSON.parse(c.messages[1].content[0].text).copy) ===
          arsenalHash({
            ...candidate.copy,
            slides: candidate.copy.slides.map((s: any) => ({
              values: s.values,
            })),
          })
        );
      } catch {
        return false;
      }
    });
    const oldImages =
      originalCall?.messages[1].content.filter(
        (b: any) => b.type === "image_url"
      ) ?? [];
    for (const [slide, scene] of renders.entries()) {
      const name = `slot-${slot}-slide-${slide}`;
      const bytes = Buffer.from(scene.dataUri.split(",")[1], "base64");
      await fs.writeFile(path.join(out, `${name}.png`), bytes);
      await fs.writeFile(
        path.join(out, `${name}.scene.json`),
        JSON.stringify(compositions[slide], null, 2)
      );
      const before = oldImages[slide]
        ? Buffer.from(oldImages[slide].image_url.url.split(",")[1], "base64")
        : undefined;
      if (before)
        await fs.writeFile(path.join(out, `${name}.before.png`), before);
      rows.push({
        slot,
        slide,
        family: definitions[slide].completeDesign!.family,
        originalComponentId:
          candidate.compositions[slide].origin.componentAssembly
            .componentIds[0],
        componentId: definitions[slide].id,
        componentHash: definitions[slide].hash,
        image: `real-copy-replay/${name}.png`,
        imageSha256: createHash("sha256").update(bytes).digest("hex"),
        originalImageSha256: before
          ? createHash("sha256").update(before).digest("hex")
          : null,
        copyHash: arsenalHash(candidate.copy.slides[slide]),
        ...partitionArsenalReadinessIssues(compositions[slide].issues),
      });
    }
    console.log(
      JSON.stringify({
        slot,
        rendered: renders.length,
        issues: compositions.flatMap(c => c.issues),
      })
    );
  }
} finally {
  await closeReviewRenderer();
  await fs.writeFile(
    path.join(out, "report.json"),
    JSON.stringify(
      {
        journal,
        previousPackage: previous,
        package: root,
        copy: "Exact journaled final candidate values, unchanged; successor selected by source/role/function/mode.",
        renderer: "CanvasPostStage",
        externalCalls: 0,
        rows,
      },
      null,
      2
    )
  );
}
