import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { convertRecipeBytes } from "./convertRecipe";
import { uploadArsenalAsset } from "../../server/designCatalog/arsenalAssets";
import { prepareArsenalDraft } from "../../server/designCatalog/arsenalStore";
import { createClient } from "@supabase/supabase-js";
import { arsenalImportSchema } from "../../shared/arsenalCatalog";
import { arsenalHash } from "../../shared/arsenalContent";

const args = process.argv.slice(2),
  apply = args.includes("--apply"),
  actor = process.env.ARSENAL_IMPORT_ACTOR;
const source = path.resolve(
  args.find(a => !a.startsWith("--")) ??
    "artifacts/design-recreation/family-library-2026-10-01T02-59-27-361Z/manifest.json"
);
const out = path.resolve(
  process.env.ARSENAL_IMPORT_OUTPUT ??
    `artifacts/arsenal-v2/import-${new Date().toISOString().replace(/[:.]/g, "-")}`
);
if (apply) {
  if (!actor)
    throw new Error(
      "--apply exige ARSENAL_IMPORT_ACTOR da conta administrativa autenticada"
    );
  const r = await createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  ).auth.admin.getUserById(actor);
  if (r.error || r.data.user?.app_metadata?.role !== "admin")
    throw new Error(
      "Ator administrativo não confirmado; nenhum import foi aplicado"
    );
}
await fs.mkdir(path.join(out, "packages"), { recursive: true });
await fs.mkdir(path.join(out, "assets"), { recursive: true });
const manifest = JSON.parse(await fs.readFile(source, "utf8")),
  base = path.dirname(source);
if (manifest.format !== "postspark.private-design-collection")
  throw new Error(
    "Manifesto não reconhecido; forneça a coleção real com proveniência"
  );
const rows = [];
const pending: Array<{
  itemId: string;
  converted: Awaited<ReturnType<typeof convertRecipeBytes>>;
  row: Record<string, any>;
}> = [];
for (const item of manifest.items) {
  for (const variant of item.variants ?? []) {
    const file = path.resolve(base, variant.recipe);
    if (!file.startsWith(base + path.sep))
      throw new Error("Caminho de receita fora da coleção");
    try {
      const bytes = await fs.readFile(file),
        hash = createHash("sha256").update(bytes).digest("hex");
      if (hash !== variant.sha256)
        throw new Error("Hash do manifesto divergente; fonte preservada");
      const converted = await convertRecipeBytes(bytes, undefined, item.id),
        p = converted.package;
      const packageFile = `packages/${p.blueprintId}.json`;
      for (const asset of converted.assetFiles) {
        await fs.writeFile(
          path.join(out, "assets", asset.manifest.sha256),
          asset.bytes
        );
        if (apply)
          await uploadArsenalAsset(
            asset.bytes,
            { license: asset.manifest.license, weight: asset.manifest.weight },
            actor!
          );
      }
      await fs.writeFile(
        path.join(out, packageFile),
        JSON.stringify(p, null, 2) + "\n"
      );
      const row = {
        sourceFile: file,
        sourceFileHash: hash,
        sourcePreview: variant.preview,
        sourceStatus: item.status,
        sourceFormat: variant.format,
        targetFormat: p.definition.variants[0].aspectRatio,
        package: packageFile,
        versionId: undefined as string | undefined,
        status: "draft_prepared",
        approval: "pending",
        automaticGenerationEligible: false,
        requiresMedia: p.definition.variants[0].bindings.some(
          b => b.kind === "media"
        ),
        assetFiles: converted.assetFiles.map(a => ({
          manifest: a.manifest,
          path: `assets/${a.manifest.sha256}`,
          sourceFamily: a.sourceFamily,
          sourceUrl: a.sourceUrl,
        })),
      };
      rows.push(row);
      pending.push({ itemId: item.id, converted, row });
    } catch (e) {
      rows.push({
        sourceFile: file,
        status: "requires_authorship",
        reason: e instanceof Error ? e.message : String(e),
        approval: "pending",
        automaticGenerationEligible: false,
      });
    }
  }
}
// Native formats are variants of ONE immutable version. Mixed/failed references stay separate drafts.
for (const itemId of Array.from(new Set(pending.map(p => p.itemId)))) {
  const group = pending.filter(p => p.itemId === itemId),
    first = group[0].converted.package;
  const seed = createHash("sha256")
    .update("arsenal-library:" + "recipe-v3-arsenal-v2-v1" + ":" + itemId)
    .digest("hex");
  const blueprintId =
    seed.slice(0, 8) +
    "-" +
    seed.slice(8, 12) +
    "-4" +
    seed.slice(13, 16) +
    "-8" +
    seed.slice(17, 20) +
    "-" +
    seed.slice(20, 32);
  const definitions = group.map(p => p.converted.package.definition);
  const p = arsenalImportSchema.parse({
    ...first,
    blueprintId,
    pieces: Object.assign({}, ...group.map(p => p.converted.package.pieces)),
    definition: {
      ...first.definition,
      variants: definitions.flatMap(d => d.variants),
      assets: Array.from(
        new Map(definitions.flatMap(d => d.assets).map(a => [a.id, a])).values()
      ),
      provenance: {
        ...first.definition.provenance,
        sourceFileHash: arsenalHash(
          definitions.map(d => d.provenance.sourceFileHash)
        ),
        sourceRecipeHash: arsenalHash(
          definitions.map(d => d.provenance.sourceRecipeHash)
        ),
        notes: definitions
          .flatMap(d => [
            `Fonte ${d.provenance.sourceFileHash} / receita ${d.provenance.sourceRecipeHash}`,
            ...d.provenance.notes,
          ])
          .slice(0, 40),
      },
    },
  });
  const packageFile = "packages/" + blueprintId + ".json";
  await fs.writeFile(
    path.join(out, packageFile),
    JSON.stringify(p, null, 2) + "\n"
  );
  try {
    const versionId = apply
      ? (await prepareArsenalDraft(p, actor!)).entry.id
      : undefined;
    for (const entry of group) {
      entry.row.package = packageFile;
      entry.row.versionId = versionId;
      entry.row.status = apply ? "draft_imported" : "draft_prepared";
    }
  } catch (e) {
    for (const entry of group) {
      entry.row.status = "import_failed";
      entry.row.reason = e instanceof Error ? e.message : String(e);
    }
  }
}
const report = {
  format: "postspark.arsenal.import-report",
  version: 1,
  dryRun: !apply,
  sourceManifest: source,
  sourceManifestHash: createHash("sha256")
    .update(await fs.readFile(source))
    .digest("hex"),
  sourceCount: rows.length,
  prepared: rows.filter(
    r => r.status === "draft_prepared" || r.status === "draft_imported"
  ).length,
  imported: rows.filter(r => r.status === "draft_imported").length,
  approved: 0,
  eligible: 0,
  rows,
};
await fs.writeFile(
  path.join(out, "report.json"),
  JSON.stringify(report, null, 2) + "\n"
);
console.log(
  JSON.stringify({
    output: out,
    sourceCount: report.sourceCount,
    prepared: report.prepared,
    imported: report.imported,
    approved: 0,
    eligible: 0,
  })
);
