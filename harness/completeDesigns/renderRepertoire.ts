/** Local renderer verification with native sample content; never calls a generation model. */
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { assemblyIdentity } from "../../shared/componentAssembly";
import { arsenalHash } from "../../shared/arsenalContent";
import {
  completeDesignFields,
  instantiateCompleteDesign,
} from "../../shared/completeDesignGeneration";
import { resolveArsenalGeometry } from "../../shared/arsenalGeometry";
import { createComponentTextMeasurer } from "../../server/ai/componentTextMeasurer";
import {
  renderReviewScenes,
  closeReviewRenderer,
} from "../../server/ai/workflows/proposalRenderer";
import { partitionArsenalReadinessIssues } from "../../shared/arsenalReadiness";
import type { ComponentPackage } from "../componentArsenal/extract";

const root = path.resolve(process.argv[2]),
  out = path.join(root, "renders");
await fs.mkdir(out, { recursive: true });
const manifest = JSON.parse(
  await fs.readFile(path.join(root, "manifest.json"), "utf8")
);
const familyIndex = process.argv.indexOf("--family"),
  onlyFamily = familyIndex < 0 ? undefined : process.argv[familyIndex + 1];
const load = async (a: { sha256: string }) =>
  fs.readFile(path.join(root, "assets", a.sha256));
const report: any[] = [];
try {
  for (const row of manifest.rows) {
    if (onlyFamily && row.family !== onlyFamily) continue;
    const pkg: ComponentPackage = JSON.parse(
      await fs.readFile(path.join(root, row.package), "utf8")
    );
    const definitions = pkg.components.filter(
      d =>
        !d.completeDesign?.designGuidance?.carouselVariant ||
        ("contentMode" in d.completeDesign.designGuidance.carouselVariant &&
          d.completeDesign.designGuidance.carouselVariant.contentMode ===
            "compose")
    );
    const measureText = await createComponentTextMeasurer(
      definitions[0].assets,
      load
    );
    const compositions = definitions.map((definition, slide) => {
      const variant =
        definition.completeDesign?.designGuidance?.carouselVariant;
      const functional =
        variant?.version === 3 &&
        ["reading", "synthesis"].includes(variant.function);
      const values = completeDesignFields(definition).map(f => {
        const unit = pkg.authorship.units.find(u => u.source === f.source);
        if (functional && row.family === "mosaic-grid" && f.role === "label")
          return {
            fieldId: f.id,
            value: String(Number(f.source.split(":")[2]) + 1).padStart(2, "0"),
          };
        if (!unit)
          throw new Error(`Missing sample: ${definition.id}:${f.source}`);
        let value: string | string[] =
          f.kind === "list" ? (unit.sampleItems ?? []) : unit.sampleText;
        if (functional && row.family === "mosaic-grid" && f.role === "body") {
          const ordinal = Number(f.source.split(":")[2]);
          value =
            variant.function === "reading"
              ? [
                  "Observe o contexto. Separe o que você sabe do que ainda precisa verificar.",
                  "Experimente uma mudança pequena e acompanhe o resultado antes de ampliar.",
                  "Compartilhe o aprendizado com clareza e registre o próximo passo.",
                ][ordinal]
              : [
                  "Observe antes de decidir.",
                  "Experimente com intenção.",
                  "Compartilhe o que aprendeu.",
                ][ordinal];
        }
        if (
          functional &&
          row.family === "paper-window-requested" &&
          f.role === "body"
        )
          value =
            variant.function === "reading"
              ? "Observe o que mudou desde a última tentativa. Separe os fatos das hipóteses e escolha um ajuste pequeno. Depois, acompanhe o resultado para decidir se vale a pena continuar."
              : "Escolha um ajuste pequeno, acompanhe o resultado e registre o que aprendeu.";
        return { fieldId: f.id, value };
      });
      return resolveArsenalGeometry(
        instantiateCompleteDesign({
          definition,
          values,
          mediaPrompts: [],
          runId: assemblyIdentity(["repertoire-local-review", row.sourceHash]),
          slot: 0,
          slide,
          planHash: arsenalHash(values),
          experimental: true,
        }),
        { measureText, allowReduction: true }
      );
    });
    const scenes = await renderReviewScenes({
      compositions,
      definitions,
      actor: "local-catalog-repertoire-review",
      loadAssetBytes: load,
      deadlineMs: Date.now() + 60000,
    });
    for (const [index, scene] of Array.from(scenes.entries())) {
      const definition = definitions[index],
        bytes = Buffer.from(scene.dataUri.split(",")[1], "base64");
      await fs.writeFile(path.join(out, `${definition.id}.png`), bytes);
      await fs.writeFile(
        path.join(out, `${definition.id}.scene.json`),
        JSON.stringify(compositions[index], null, 2)
      );
      const issues = partitionArsenalReadinessIssues(
        compositions[index].issues
      );
      report.push({
        sourceId: row.sourceId,
        sourceHash: row.sourceHash,
        id: definition.id,
        hash: definition.hash,
        family: row.family,
        variant:
          definition.completeDesign?.designGuidance?.carouselVariant ?? null,
        image: `renders/${definition.id}.png`,
        imageSha256: createHash("sha256").update(bytes).digest("hex"),
        ...issues,
      });
    }
    console.log(
      JSON.stringify({
        family: row.family,
        rendered: scenes.length,
        blocking: report
          .filter(r => r.sourceId === row.sourceId)
          .reduce((sum, r) => sum + r.blocking.length, 0),
      })
    );
  }
} finally {
  await closeReviewRenderer();
  await fs.writeFile(
    path.join(root, "render-report.json"),
    JSON.stringify(
      {
        renderer: "CanvasPostStage",
        content:
          "Native authored samples; controlled longer support copy for Window/Mosaic reading and synthesis. Other fields retain the source sample.",
        externalModelCalls: 0,
        media:
          "Unprovided native media remains explicitly empty; no replacement image was generated.",
        rows: report,
      },
      null,
      2
    )
  );
}
