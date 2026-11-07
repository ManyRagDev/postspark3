import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { arsenalHash } from "../../../shared/arsenalContent";
import {
  assemblyIdentity, componentCardV1Schema, componentDefinitionV1Schema, createComponentDefinition,
} from "../../../shared/componentAssembly";
import { ENV } from "../../../server/_core/env";
import { getDb } from "../../../server/db";
import { prepareComponentDraft } from "../../../server/designCatalog/componentStore";
import { publishEditorialCatalog, readEditorialCatalog } from "../../../server/designCatalog/editorialCatalog";
import { closeSearchEngines, prepareCatalogSearchIndex, readSearchIndex } from "../../../server/designCatalog/familySearchIndex";
import { readCatalogManifest, readCatalogSnapshot, withCatalogStaging } from "../../../server/designCatalog/versionedCatalog";

const base = "artifacts/acervo82/full";
const family = "acervo82-concept-17";
const json = async (file: string) => JSON.parse(await fs.readFile(file, "utf8"));
const activeRows = (snapshot: Awaited<ReturnType<typeof readCatalogSnapshot>>) =>
  snapshot.rows.filter(row => ["approved", "draft"].includes(row.design_components.status));
const identity = (rows: Array<{ component_id: string; definition_hash: string }>) =>
  arsenalHash(rows.map(row => ({ id: row.component_id, hash: row.definition_hash })).sort((a, b) => a.id.localeCompare(b.id)));

assert.equal(process.env.POSTSPARK_ACERVO82_LOCAL, "true");
assert.equal(process.env.GENERATION_ADMISSION_PAUSED, "true");
assert.equal(new URL(ENV.supabaseUrl).origin, "http://127.0.0.1:55481");
assert(ENV.designRetrievalDirectory);
const original = await json(`${base}/staged.json`);
const preview = await json(".acervo82-local/aura-preview.json");
assert.equal(original.sources, 82);
assert(/^artifacts\/acervo82\/full\/aura-pilot-[0-9]+$/.test(preview.directory));
const { components: [value] } = await json(`${preview.directory}/packages/${family}.json`);
const pilot = componentDefinitionV1Schema.parse(value);
assert.equal(pilot.completeDesign?.family, family);
assert.equal(pilot.hash, preview.definitionHash);
const proof = await json(`${preview.directory}/journey.json`);
assert.equal(proof.revision, preview.revision);
assert.deepEqual(proof.initial, proof.reopened);
assert.deepEqual(proof.photo, proof.reopenedPhoto);

const layers = ["texture-1", "texture-2"] as [string, string];
assert(layers.every(id => pilot.fragment.instances.some(instance =>
  instance.id === id && pilot.pieces[instance.pieceHash]?.imageAssetId
)));
const definition = createComponentDefinition({
  ...pilot,
  id: assemblyIdentity([pilot.id, "chromatic-portal-v1"]),
  completeDesign: {
    ...pilot.completeDesign!,
    authorshipRevision: (pilot.completeDesign!.authorshipRevision ?? 1) + 1,
    designGuidance: {
      ...pilot.completeDesign!.designGuidance!,
      visualFeatures: { chromaticPortal: layers },
    },
  },
});
const source = activeRows(await readCatalogSnapshot(original.revision));
assert.equal(identity(source), original.identity);
const previous = source.find(row => componentCardV1Schema.parse(row.card).completeDesign?.family === family);
assert(previous);
const expected = [
  ...source.filter(row => row.component_id !== previous.component_id),
  { component_id: definition.id, definition_hash: definition.hash },
];
const db = getDb();
const activeBefore = await db.rpc("catalog_manifest");
if (activeBefore.error) throw activeBefore.error;
const drafts = await db.from("design_components").select("id,actor_id,status,definition").eq("kind", "content");
if (drafts.error) throw drafts.error;
const superseded = drafts.data.filter(row =>
  row.id !== definition.id && row.status !== "archived" && row.definition.completeDesign?.family === family
);
assert(superseded.every(row => row.actor_id === original.actor && row.status === "draft"));
const archived: typeof superseded = [];
let revision: string | undefined;
try {
  for (const row of superseded) {
    const changed = await db.from("design_components").update({ status: "archived" })
      .eq("id", row.id).eq("actor_id", original.actor).eq("status", "draft").select("id").single();
    if (changed.error) throw changed.error;
    archived.push(row);
  }
  ({ revision } = await withCatalogStaging(() => prepareComponentDraft(definition, original.actor)));
  const snapshot = await readCatalogSnapshot(revision);
  const manifest = await readCatalogManifest(revision);
  assert.equal(identity(activeRows(snapshot)), identity(expected));
  assert.equal(manifest.summary.experimental.staticOfferCount, 82);
  const priorEditorial = await readEditorialCatalog(original.revision);
  assert(priorEditorial);
  assert(priorEditorial.document.designs.some(row => row.sourceId === previous.component_id));
  const editorial = await publishEditorialCatalog(revision, {
    ...priorEditorial.document,
    designs: priorEditorial.document.designs.map(row => row.sourceId === previous.component_id
      ? { ...row, sourceId: definition.id, sourceHash: definition.hash } : row),
  });
  await prepareCatalogSearchIndex(revision);
  const { index } = await readSearchIndex(revision, editorial, ENV.designRetrievalDirectory, 2);
  assert.equal(index.documents.length, 82);
  assert(index.documents.some(row => row.id === definition.id && row.sourceHash === definition.hash));
  const activeAfter = await db.rpc("catalog_manifest");
  if (activeAfter.error) throw activeAfter.error;
  assert.equal(activeAfter.data?.revision, activeBefore.data?.revision);
  const receipt = {
    actor: original.actor, sources: 82, revision, identity: identity(expected), indexHash: index.hash,
    from: { revision: original.revision, identity: original.identity },
    replacement: { family, id: definition.id, hash: definition.hash },
  };
  await fs.writeFile(`${base}/staged-aura.json`, JSON.stringify(receipt, null, 2), { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify(receipt));
} catch (error) {
  if (!revision) {
    for (const row of archived) {
      const restored = await db.from("design_components").update({ status: "draft" })
        .eq("id", row.id).eq("actor_id", original.actor).eq("status", "archived");
      if (restored.error) throw new AggregateError([error, restored.error], "aura_catalog_rollback_failed");
    }
  }
  throw error;
} finally {
  await closeSearchEngines();
}
