import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { uploadArsenalAsset } from "../../../server/designCatalog/arsenalAssets";
import { prepareComponentDraft } from "../../../server/designCatalog/componentStore";
import {
  withCatalogStaging,
  readCatalogManifest,
  readCatalogSnapshot,
  readCatalogDefinition,
} from "../../../server/designCatalog/versionedCatalog";
import { publishEditorialCatalog } from "../../../server/designCatalog/editorialCatalog";
import { editorialCatalogDocumentSchema } from "../../../shared/editorialIntent";
import {
  componentDefinitionV1Schema,
  componentHash,
} from "../../../shared/componentAssembly";
import { arsenalHash } from "../../../shared/arsenalContent";
import { getDb } from "../../../server/db";

const root = process.argv[2] ?? "artifacts/acervo82/pilot/build-06";
const actor = JSON.parse(
  await fs.readFile(".acervo82-local/test-account.json", "utf8")
).id;
const inventory = JSON.parse(
  await fs.readFile(path.join(root, "inventory.json"), "utf8")
);
assert.equal(inventory.sourceCount, 6);
assert.equal(inventory.blocked, 0);
assert(
  inventory.rows.every((r: any) =>
    r.previews.every((p: any) => !p.blockingIssues.length)
  )
);
const carousel = JSON.parse(
  await fs.readFile(path.join(root, "carousel-sets/manifest.json"), "utf8")
);
assert.equal(carousel.rows.length, 30);
const defs = [];
for (const row of carousel.rows) {
  const d = componentDefinitionV1Schema.parse(
    JSON.parse(
      await fs.readFile(path.join(root, "carousel-sets", row.document), "utf8")
    )
  );
  assert.equal(d.id, row.id);
  assert.equal(componentHash(d), row.hash);
  assert(d.completeDesign?.family?.startsWith("acervo82-"));
  if (row.blocking?.length) throw new Error("pilot_carousel_blocked");
  defs.push(d);
}
const identity = arsenalHash(defs.map(d => ({ id: d.id, hash: d.hash })));
let prior: any;
try {
  prior = JSON.parse(
    await fs.readFile("artifacts/acervo82/pilot/staged.json", "utf8")
  );
} catch (e: any) {
  if (e.code !== "ENOENT") throw e;
}
if (prior) {
  assert.equal(prior.identity, identity);
  await readCatalogManifest(prior.revision);
  console.log(JSON.stringify({ reused: true, ...prior }));
  process.exit(0);
}
const assets = new Map(defs.flatMap(d => d.assets).map(a => [a.id, a]));
for (const asset of assets.values()) {
  const stored = await uploadArsenalAsset(
    await fs.readFile(path.join(root, "assets", asset.sha256)),
    { license: asset.license, weight: asset.weight },
    actor
  );
  assert.equal(arsenalHash(stored), arsenalHash(asset));
}
const before = await getDb().rpc("catalog_manifest");
if (before.error) throw before.error;
// Preserve earlier local trial revisions, retiring only superseded definitions
// from this pilot and this actor. No historical document or release is deleted.
const old = await getDb()
  .from("design_components")
  .select("id,definition")
  .eq("actor_id", actor);
if (old.error) throw old.error;
const families = new Set(defs.map(d => d.completeDesign!.family));
const superseded = old.data
  .filter(
    (r: any) =>
      families.has(r.definition.completeDesign?.family) &&
      !defs.some(d => d.id === r.id)
  )
  .map((r: any) => r.id);
if (superseded.length) {
  const r = await getDb()
    .from("design_components")
    .update({ status: "archived" })
    .in("id", superseded)
    .eq("actor_id", actor);
  if (r.error) throw r.error;
}
const candidates = await getDb()
  .from("catalog_revisions")
  .select("revision")
  .order("revision", { ascending: false })
  .limit(20);
if (candidates.error) throw candidates.error;
let revision: string | undefined;
for (const row of candidates.data) {
  const snapshot = await readCatalogSnapshot(String(row.revision));
  if (
    arsenalHash(
      snapshot.rows
        .map((r: any) => ({ id: r.component_id, hash: r.definition_hash }))
        .sort((a: any, b: any) => a.id.localeCompare(b.id))
    ) ===
    arsenalHash(
      defs
        .map(d => ({ id: d.id, hash: d.hash }))
        .sort((a, b) => a.id.localeCompare(b.id))
    )
  ) {
    revision = String(row.revision);
    break;
  }
}
if (!revision)
  revision = (
    await withCatalogStaging(async () => {
      for (const d of defs) await prepareComponentDraft(d, actor);
      return defs.map(d => d.id);
    })
  ).revision;
const manifest = await readCatalogManifest(revision),
  snapshot = await readCatalogSnapshot(revision);
assert.equal(
  snapshot.rows.filter((r: any) => r.design_components.status !== "archived")
    .length,
  30
);
for (const d of defs)
  assert.equal(
    (await readCatalogDefinition(revision, d.id, d.hash)).hash,
    d.hash
  );
const vocabulary = JSON.parse(
  await fs.readFile("harness/completeDesigns/editorialCatalogSeed.json", "utf8")
).intents;
const base = defs.filter(
  d => !d.completeDesign!.designGuidance?.carouselVariant
);
const intentMap: Record<string, string[]> = {
  "acervo82-reference-03": [
    "afirmar_mensagem",
    "apresentar_com_imagem",
    "comentar_imagem",
    "convidar_participacao",
  ],
  "acervo82-r9-03": ["comparar_alternativas", "esclarecer_equivoco"],
  "acervo82-r9-11": [
    "afirmar_mensagem",
    "estimular_reflexao",
    "explicar_raciocinio",
    "anunciar_novidade",
  ],
  "acervo82-r9-20": ["destacar_dado", "explicar_raciocinio"],
  "acervo82-concept-06": ["afirmar_mensagem", "anunciar_novidade"],
  "acervo82-concept-10": [
    "afirmar_mensagem",
    "explicar_raciocinio",
    "estimular_reflexao",
  ],
};
const document = editorialCatalogDocumentSchema.parse({
  version: 1,
  intents: vocabulary,
  designs: base.map(d => ({
    sourceId: d.id,
    sourceHash: d.hash,
    intentIds: intentMap[d.completeDesign!.family],
    rationale: `Capacidades nativas verificadas no piloto ${d.completeDesign!.family}: ${d.description}. Intenções indicam possibilidades, sem limitar temas e sem transformar o texto da referência em prova factual.`,
  })),
});
await fs.writeFile(
  "designs/acervo82/pilot/editorial.json",
  JSON.stringify(document, null, 2) + "\n"
);
const editorial = await publishEditorialCatalog(revision, document);
const after = await getDb().rpc("catalog_manifest");
if (after.error) throw after.error;
assert.equal(after.data.revision, before.data.revision);
const receipt = {
  actor,
  revision,
  identity,
  definitions: defs.length,
  sources: base.length,
  assets: assets.size,
  manifest,
  editorialRevision: editorial.revision,
  activeRevisionUnchanged: true,
};
await fs.writeFile(
  "artifacts/acervo82/pilot/staged.json",
  JSON.stringify(receipt, null, 2) + "\n"
);
console.log(JSON.stringify(receipt));
