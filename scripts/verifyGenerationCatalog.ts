/** Read-only catalog evidence. No model calls, catalog writes or publication.
 * pnpm exec tsx --env-file=.env scripts/verifyGenerationCatalog.ts [--ids uuid,uuid]
 *   [--inventory path] [--output path] [--repeat]
 * The real renderer may read private catalog font bytes using the configured server environment.
 */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve, relative, sep, extname } from "node:path";
import { createHash } from "node:crypto";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { buildDraftPreview } from "../harness/componentArsenal/preview";
import type { ComponentPackage } from "../harness/componentArsenal/extract";
import type { DesignReferenceEvidence } from "../harness/completeDesigns/report";
import { createComponentTextMeasurer } from "../server/ai/componentTextMeasurer";
import {
  closeReviewRenderer,
  renderReviewScenes,
} from "../server/ai/workflows/proposalRenderer";
import { arsenalHash } from "../shared/arsenalContent";
import {
  componentDefinitionV1Schema,
  componentHash,
} from "../shared/componentAssembly";
import {
  type ArsenalAsset,
  readArsenalComposition,
  type ArsenalComposition,
} from "../shared/designArsenal";
import { auditArsenalGeometry } from "../shared/arsenalGeometry";
import { partitionArsenalReadinessIssues } from "../shared/arsenalReadiness";

const defaults = [
  "07d30535-8c7a-42d4-8535-f2ba1ceb3aa3",
  "75b3575d-ce16-4372-8723-39bfe0dce76e",
  "ec753c09-136a-43bf-8e67-fa1ca20952cf",
  "e22a5e36-0ec1-4868-800a-9480cb741bdd",
  "227fb412-701d-4a2f-884e-25e76ac32439",
  "4a76a167-6ad6-4e6b-8312-feb88b8b5c52",
];
function option(name: string, fallback: string) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--"))
    throw new Error(`Missing ${name} value`);
  return value;
}
const ids = option("--ids", defaults.join(",")).split(",");
if (
  !ids.length ||
  ids.length > 30 ||
  ids.some(id => !/^[a-f0-9-]{36}$/.test(id)) ||
  new Set(ids).size !== ids.length
)
  throw new Error("Expected 1–30 distinct component UUIDs");
const inventoryPath = resolve(
  option(
    "--inventory",
    "artifacts/complete-designs/whole-catalog-final-2026-10-06-r2/inventory.json"
  )
);
const root = dirname(inventoryPath);
const output = resolve(option("--output", "/tmp/postspark-generation-catalog"));
const repeat = process.argv.includes("--repeat");
function withinRoot(path: string) {
  const target = resolve(root, path),
    local = relative(root, target);
  if (local === ".." || local.startsWith(`..${sep}`) || local.startsWith(sep))
    throw new Error("Catalog path escapes inventory directory");
  return target;
}
const sha256 = (value: Buffer) =>
  createHash("sha256").update(value).digest("hex");
const inventoryBytes = await readFile(inventoryPath);
const inventory = JSON.parse(inventoryBytes.toString("utf8")) as {
  rows: Array<{
    package?: string;
    componentIds?: string[];
    previews?: Array<{ id: string; hash: string }>;
    references?: DesignReferenceEvidence;
  }>;
};
await mkdir(output, { recursive: true });
// Generated pixels prove slot fill/crop/clip only. No reference poster is used as slot media.
const fixture = createCanvas(960, 720),
  fixtureContext = fixture.getContext("2d");
const gradient = fixtureContext.createLinearGradient(0, 0, 960, 720);
gradient.addColorStop(0, "#075985");
gradient.addColorStop(1, "#fbbf24");
fixtureContext.fillStyle = gradient;
fixtureContext.fillRect(0, 0, 960, 720);
for (let y = 0; y < 720; y += 120)
  for (let x = 0; x < 960; x += 120) {
    if ((x / 120 + y / 120) % 2) {
      fixtureContext.fillStyle = "#ffffff35";
      fixtureContext.fillRect(x, y, 120, 120);
    }
  }
fixtureContext.strokeStyle = "#ffffff";
fixtureContext.lineWidth = 12;
fixtureContext.strokeRect(20, 20, 920, 680);
fixtureContext.beginPath();
fixtureContext.arc(480, 360, 135, 0, Math.PI * 2);
fixtureContext.stroke();
const fixtureBytes = fixture.toBuffer("image/png"),
  fixtureUrl = `data:image/png;base64,${fixtureBytes.toString("base64")}`;
await writeFile(resolve(output, "media-fixture.png"), fixtureBytes);
const report = {
  schemaVersion: 2,
  createdAt: new Date().toISOString(),
  inventoryPath,
  inventorySha256: sha256(inventoryBytes),
  renderer: "CanvasPostStage",
  repeatedFreshContexts: repeat,
  modelCalls: 0,
  publicationWrites: 0,
  mediaFixture: {
    file: "media-fixture.png",
    sha256: sha256(fixtureBytes),
    purpose:
      "Synthetic slot fill/crop/clip evidence; photography quality unverified",
  },
  limitation:
    "Local immutable packages and real renderer only. This report does not approve visuals, publication, remote catalog identity, save/reopen, or end-to-end generation.",
  candidates: [] as Array<Record<string, unknown>>,
};
const contact = createCanvas(1600, ids.length * 560),
  context = contact.getContext("2d");
context.fillStyle = "#17191e";
context.fillRect(0, 0, contact.width, contact.height);
function invariant(scene: ArsenalComposition) {
  return {
    artboard: scene.artboard,
    groups: scene.groups,
    pieces: scene.pieces,
    assets: scene.assets,
    projection: scene.projection,
  };
}
try {
  for (const [index, id] of ids.entries()) {
    const row = inventory.rows.find(row => row.componentIds?.includes(id));
    if (!row?.package)
      throw new Error(`Component missing from inventory: ${id}`);
    const packageBytes = await readFile(withinRoot(row.package));
    const pkg = JSON.parse(packageBytes.toString("utf8")) as ComponentPackage;
    if (arsenalHash(pkg.sourceSnapshot.recipe) !== pkg.source.recipeHash)
      throw new Error(`Source recipe hash mismatch: ${id}`);
    const definition = componentDefinitionV1Schema.parse(
      pkg.components.find(c => c.id === id)
    );
    if (
      !definition.completeDesign ||
      componentHash(definition) !== definition.hash ||
      row.previews?.find(p => p.id === id)?.hash !== definition.hash
    )
      throw new Error(`Immutable component hash mismatch: ${id}`);
    const measureText = await createComponentTextMeasurer(
      definition.assets,
      async asset => {
        const local = pkg.assetFiles.find(
          file => file.manifest.sha256 === asset.sha256
        );
        if (!local) throw new Error(`Local font missing: ${id}:${asset.id}`);
        return readFile(withinRoot(local.relativePath));
      }
    );
    const secondCopy = Object.fromEntries(
      pkg.authorship.units.map(unit => [
        unit.source,
        unit.kind === "list"
          ? ["Observe o contexto.", "Escolha com cuidado.", "Revise o resultado."].slice(0, unit.cardinality?.max ?? 3)
          : unit.role === "headline"
          ? unit.layerIds.length >= 3 ? "O sol traz um novo dia" : "Café com cuidado"
          : unit.role === "body"
            ? "Uma pausa para conversar."
            : unit.role === "callToAction"
              ? "Venha conhecer"
              : "EDIÇÃO ESPECIAL",
      ])
    );
    const before = arsenalHash(definition);
    const scenarios = ["source-copy", "second-copy"] as const;
    const compositions = scenarios.map(scenario => {
      const preview = buildDraftPreview(
        { ...pkg, components: [definition] },
        "original",
        measureText,
        scenario === "source-copy" ? {} : secondCopy,
        id
      );
      const composition = structuredClone(preview.composition);
      for (const element of composition.elements.filter(
        element => element.kind === "media" && !element.imageAssetId
      ))
        composition.media[element.id] = {
          kind: "user",
          url: fixtureUrl,
          focalX: 0.5,
          focalY: 0.5,
        };
      return readArsenalComposition(composition);
    });
    if (
      before !== arsenalHash(definition) ||
      arsenalHash(invariant(compositions[0])) !==
        arsenalHash(invariant(compositions[1]))
    )
      throw new Error(
        `Copy changed immutable design properties: ${id}: ${Object.keys(
          invariant(compositions[0])
        )
          .filter(
            key =>
              arsenalHash(
                (invariant(compositions[0]) as Record<string, unknown>)[key]
              ) !==
              arsenalHash(
                (invariant(compositions[1]) as Record<string, unknown>)[key]
              )
          )
          .join(",")}`
      );
    const input = {
      compositions,
      definitions: [definition, definition],
      actor: "00000000-0000-4000-8000-000000000001",
      deadlineMs: Date.now() + 60_000,
      loadAssetBytes: async (asset: ArsenalAsset) => {
        const file = pkg.assetFiles.find(f => f.manifest.id === asset.id);
        if (!file) throw new Error(`Local asset missing: ${asset.id}`);
        return readFile(withinRoot(file.relativePath));
      },
    };
    const scenes = await renderReviewScenes(input);
    const repeated = repeat
      ? await renderReviewScenes({ ...input, deadlineMs: Date.now() + 60_000 })
      : undefined;
    if (
      scenes.length !== 2 ||
      (repeated &&
        scenes.some((scene, i) => scene.dataUri !== repeated[i]?.dataUri))
    )
      throw new Error(`Incomplete or nondeterministic render: ${id}`);
    const evidence = async (relativePath:string, suffix:string, expectedHash?:string) => {
      const bytes=await readFile(withinRoot(relativePath)),hash=sha256(bytes);
      if(expectedHash&&hash!==expectedHash)throw new Error(`Reference evidence hash mismatch: ${id}:${suffix}`);
      const file=`${id}-${suffix}${extname(relativePath)||".png"}`;
      await writeFile(resolve(output,file),bytes);
      return {bytes,file,sha256:hash};
    };
    const original=row.references?.original
      ? await evidence(row.references.original.relativePath,"original",row.references.original.sha256)
      : undefined;
    // Old inventories copied a reconstruction under references/<recipe hash>.
    // Keep it available, explicitly labelled historical; it is never an original.
    const historical=row.references?.historicalPreview
      ? await evidence(row.references.historicalPreview.relativePath,"historical-preview",row.references.historicalPreview.sha256)
      : !row.references
        ? await evidence(`references/${pkg.source.fileHash}${extname(pkg.source.previewPath)||".png"}`,"historical-preview")
        : undefined;
    const candidate = {
      id,
      label: definition.label,
      package: row.package,
      packageSha256: sha256(packageBytes),
      componentHash: definition.hash,
      sourceRecipeHash: pkg.source.recipeHash,
      sourceRecipeFileHash: pkg.source.fileHash,
      references: {
        originalStatus:original?"verified":row.references?.originalStatus??"unavailable",
        ...(original?{original:{file:original.file,sha256:original.sha256,width:row.references!.original!.width,height:row.references!.original!.height,fileName:row.references!.original!.fileName}}:{}),
        ...(historical?{historicalPreview:{file:historical.file,sha256:historical.sha256,label:"Historical reconstruction; not the downloaded original"}}:{}),
        hashProvenance:"Original image hashes, historical preview hashes and recipe JSON hashes are separate evidence identities",
      },
      aspectRatio: definition.fragment.aspectRatio,
      immutableDesignPropertiesPreserved: true,
      fonts: definition.assets.filter(a=>a.family).map(a => ({
        id: a.id,
        sha256: a.sha256,
        family: a.family,
        weight: a.weight,
      })),
      authoredImages:definition.assets.filter(a=>a.mimeType.startsWith("image/")).map(a=>({id:a.id,sha256:a.sha256})),
      mediaSlots: definition.fragment.mediaSlots ?? [],
      renders: scenes.map((scene, i) => ({
        scenario: scenarios[i],
        file: `${id}-${scenarios[i]}.png`,
        pngSha256: sha256(Buffer.from(scene.dataUri.split(",")[1], "base64")),
        compositionHash: arsenalHash(compositions[i]),
        width: scene.width,
        height: scene.height,
        geometryIssues: auditArsenalGeometry(compositions[i], measureText),
        technicalReadiness: partitionArsenalReadinessIssues(compositions[i].issues),
        compileIssues: compositions[i].issues,
        nativeText: compositions[i].elements
          .filter(e => e.kind === "text")
          .map(e => ({ id: e.id, bindingId: e.bindingId, text: e.text })),
        mediaFilled: compositions[i].elements
          .filter(e => e.kind === "media" && !e.imageAssetId)
          .every(e => compositions[i].media[e.id]?.url === fixtureUrl),
      })),
    };
    report.candidates.push(candidate);
    const images = [
      original?.bytes,
      historical?.bytes,
      ...scenes.map(scene =>
        Buffer.from(scene.dataUri.split(",")[1], "base64")
      ),
    ];
    for(const [i,scene] of scenes.entries())await writeFile(resolve(output,`${id}-${scenarios[i]}.png`),Buffer.from(scene.dataUri.split(",")[1],"base64"));
    const labels=[original?"Original — verified bytes":"Original unavailable",historical?"Historical recipe reconstruction":"No historical reconstruction",...scenarios];
    for (const [column, bytes] of images.entries()) {
      if(bytes){const image = await loadImage(bytes),
        scale = Math.min(380 / image.width, 480 / image.height);
      const x = column * 400 + (400 - image.width * scale) / 2,
        y = index * 560 + 34;
      context.drawImage(image, x, y, image.width * scale, image.height * scale);
      }
      context.fillStyle = "#ffffff";
      context.font = "14px sans-serif";
      context.fillText(
        labels[column],
        column * 400 + 10,
        index * 560 + 22
      );
    }
    context.fillStyle = "#ffffff";
    context.font = "13px sans-serif";
    context.fillText(
      `${id} · ${definition.label} · ${definition.fragment.aspectRatio}`,
      10,
      index * 560 + 538
    );
    await writeFile(
      resolve(output, "REPORT.json"),
      JSON.stringify(report, null, 2)
    );
    console.log(
      JSON.stringify({
        id,
        renders: candidate.renders.map(r => ({
          scenario: r.scenario,
          geometryIssues: r.geometryIssues.length,
          compileIssues: r.compileIssues.length,
          blocking: r.technicalReadiness.blocking.length,
          diagnostics: r.technicalReadiness.diagnostics.length,
          hash: r.pngSha256,
        })),
      })
    );
  }
  await writeFile(
    resolve(output, "CONTACT.png"),
    contact.toBuffer("image/png")
  );
  console.log(
    JSON.stringify({
      output,
      candidates: report.candidates.length,
      report: "REPORT.json",
      contact: "CONTACT.png",
      modelCalls: 0,
      publicationWrites: 0,
    })
  );
} finally {
  await closeReviewRenderer();
}
