/** Curatorial authoring only. Never imported by the request worker. */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { arsenalHash } from "../../shared/arsenalContent";
import {
  type ComponentDefinitionV1,
  compactComponentCard,
  assemblyIdentity,
} from "../../shared/componentAssembly";
import { authorCarouselVisualVariant } from "../../server/designCatalog/carouselVisualVariants";
import {
  completeDesignFields,
  instantiateCompleteDesign,
} from "../../shared/completeDesignGeneration";
import { resolveArsenalGeometry } from "../../shared/arsenalGeometry";
import { partitionArsenalReadinessIssues } from "../../shared/arsenalReadiness";
import { createComponentTextMeasurer } from "../../server/ai/componentTextMeasurer";
import { renderReviewScenes } from "../../server/ai/workflows/proposalRenderer";
import type { ArsenalAsset } from "../../shared/designArsenal";
export function authorCarouselSet(source: ComponentDefinitionV1) {
  return {
    source,
    children: (["compose", "literal"] as const).flatMap(mode =>
      (["development", "closing"] as const).map(role =>
        authorCarouselVisualVariant(source, role, mode === "compose")
      )
    ),
  };
}
export async function buildCarouselSets(
  sources: ComponentDefinitionV1[],
  output: string,
  loadAssetBytes: (asset: ArsenalAsset) => Promise<Buffer>
) {
  await mkdir(output, { recursive: true });
  const photo = createCanvas(600, 400),
    ctx = photo.getContext("2d");
  ctx.fillStyle = "#D6D8D7";
  ctx.fillRect(0, 0, 600, 400);
  ctx.fillStyle = "#333333";
  ctx.font = "24px sans-serif";
  ctx.fillText("Área de foto preservada", 100, 200);
  const photoUri = `data:image/png;base64,${photo.toBuffer("image/png").toString("base64")}`;
  const rows: any[] = [];
  for (const source of sources) {
    const sourceBefore = arsenalHash(source);
    try {
      const set = authorCarouselSet(source),
        definitions = [source, ...set.children];
      const measureText = await createComponentTextMeasurer(
        source.assets,
        loadAssetBytes
      );
      for (const definition of definitions) {
        const values = completeDesignFields(definition).map(f => ({
          fieldId: f.id,
          value:
            f.kind === "list"
              ? [
                  "Café coado na hora.",
                  "Uma pausa para conversar.",
                  "Conheça nosso espaço.",
                ].slice(0, f.cardinality?.max ?? 3)
              : f.role === "headline"
                ? "Uma pausa que aproxima"
                : f.role === "body"
                  ? "Café coado na hora, de segunda a sexta. Um espaço para conversar e aproveitar o dia."
                  : f.role === "callToAction"
                    ? "Venha conhecer"
                    : "CAFÉ HORIZONTE",
        }));
        const composition = resolveArsenalGeometry(
          instantiateCompleteDesign({
            definition,
            values,
            mediaPrompts: [],
            runId: assemblyIdentity("carousel-curation-v2"),
            slot: 0,
            slide: 0,
            planHash: arsenalHash("curatorial-fixture-v1"),
            experimental: true,
          }),
          { measureText, allowReduction: true }
        );
        for (const slot of composition.base.mediaSlots ?? [])
          if (!composition.elements.find(e => e.id === slot.id)?.imageAssetId)
            composition.media[slot.id] = {
              kind: "user",
              url: photoUri,
              focalX: 0.5,
              focalY: 0.5,
            };
        const readiness = partitionArsenalReadinessIssues(composition.issues);
        const variant =
          definition.completeDesign?.designGuidance?.carouselVariant;
        const briefing = {
          sourceId: source.id,
          sourceHash: source.hash,
          componentId: definition.id,
          componentHash: definition.hash,
          variant,
          criteria: [
            "Preservar capa original, cores, fontes, mídias e fundo aprovado da janela Mac",
            "Leitura com menos decoração; encerramento com CTA somente em compose",
            "Conferir legibilidade, colisões, cortes, listas e slots de mídia",
          ],
          fixture:
            "Café Horizonte; texto controlado, sem avaliação semântica de IA",
          renderer: "CanvasPostStage",
        };
        const scenes = await renderReviewScenes({
          compositions: [composition],
          definitions: [definition],
          actor: "local-curation",
          loadAssetBytes,
          deadlineMs: Date.now() + 60000,
        });
        const bytes = Buffer.from(scenes[0].dataUri.split(",")[1], "base64");
        const png = `${definition.id}.png`,
          document = `${definition.id}.json`,
          scene = `${definition.id}.scene.json`;
        await writeFile(join(output, png), bytes);
        await writeFile(
          join(output, document),
          JSON.stringify(definition, null, 2)
        );
        await writeFile(
          join(output, scene),
          JSON.stringify(composition, null, 2)
        );
        rows.push({
          sourceId: source.id,
          sourceHash: source.hash,
          family: source.completeDesign!.family,
          id: definition.id,
          hash: definition.hash,
          role: variant?.role ?? "cover",
          contentMode:
            variant?.version === 2 ? variant.contentMode : "original",
          assets: definition.assets,
          png,
          pngHash: createHash("sha256").update(bytes).digest("hex"),
          document,
          scene,
          card: compactComponentCard(definition),
          briefing,
          briefingHash: arsenalHash(briefing),
          blocking: readiness.blocking,
          diagnostics: readiness.diagnostics,
          desiredStatus: variant ? "draft" : "unchanged",
          review: "pending_visual_inspection",
        });
      }
      if (arsenalHash(source) !== sourceBefore)
        throw new Error("source_mutated");
    } catch (e) {
      rows.push({
        sourceId: source.id,
        sourceHash: source.hash,
        family: source.completeDesign!.family,
        blocking: [e instanceof Error ? e.message : "curation_failed"],
      });
    }
  }
  const manifest = {
    version: 2,
    createdAt: new Date().toISOString(),
    modelCalls: 0,
    remoteWrites: 0,
    rows,
  };
  await writeFile(
    join(output, "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );
  return manifest;
}
