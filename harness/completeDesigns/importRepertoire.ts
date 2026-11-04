/** Explicit staging command. New immutable drafts; never activates a production revision. */
import fs from "node:fs/promises";
import path from "node:path";
import { arsenalHash } from "../../shared/arsenalContent";
import { componentDefinitionV1Schema } from "../../shared/componentAssembly";
import { resolveDesignFamilyRepertoires } from "../../shared/designRepertoire";
import { getDb } from "../../server/db";
import { prepareComponentDraft } from "../../server/designCatalog/componentStore";
import { filterCompleteDesignRows } from "../../server/designCatalog/completeDesignStore";
import {
  withCatalogStaging,
  validateCatalogSnapshot,
  readCatalogSnapshot,
  readCatalogManifest,
  readCatalogDefinition,
} from "../../server/designCatalog/versionedCatalog";

import { parseRepertoireImportMode } from "./repertoireImportMode";

const mode = parseRepertoireImportMode(process.argv.slice(2));
const root = path.resolve(mode.packagePath);
const progress = (
  stage: string,
  counts: Record<string, string | number> = {}
) => console.log(JSON.stringify({ stage, ...counts }));
const manifest = JSON.parse(
  await fs.readFile(path.join(root, "manifest.json"), "utf8")
);
if (
  manifest.format !== "postspark.catalog-repertoire" ||
  manifest.version !== 3
)
  throw new Error("Unsupported repertoire package");
const rows = JSON.parse(
  await fs.readFile(path.join(root, "catalog-rows.json"), "utf8")
);
validateCatalogSnapshot({ rows }, true);
if (
  arsenalHash(rows) !== manifest.snapshotHash ||
  rows.length !== manifest.definitions
)
  throw new Error("Repertoire manifest mismatch");
const definitions = rows.map((r: any) =>
  componentDefinitionV1Schema.parse(r.definition)
);
const sourceIds = new Set<string>(manifest.rows.map((r: any) => r.sourceId));
if (definitions.some((d: any) => sourceIds.has(d.id)))
  throw new Error("Import must not overwrite an original definition");
const localCards = filterCompleteDesignRows(rows, {
  aspectRatio: "4:5",
  postMode: "carousel",
  slideCount: 5,
  text: "",
  experimental: true,
});
const expected = resolveDesignFamilyRepertoires(localCards, {
  slideCount: 5,
  contentMode: "compose",
});
if (expected.length !== manifest.familyCandidates)
  throw new Error("Repertoire local eligibility mismatch");
if (mode.kind === "verify-local") {
  console.log(
    JSON.stringify({
      verified: true,
      definitions: definitions.length,
      familyCandidates: expected.length,
      remoteCalls: 0,
    })
  );
} else {
  const db = getDb();
  if (mode.kind === "stage") {
    progress("administrator-read-start");
    const admin = await db
      .from("profiles")
      .select("role")
      .eq("id", mode.actor)
      .single();
    if (admin.error || admin.data?.role !== "admin")
      throw new Error("Import requires an existing administrator");
    progress("administrator-read-complete");
  }
  progress("active-manifest-read-start");
  const before = await db.rpc("catalog_manifest");
  if (before.error) throw before.error;
  progress("active-manifest-read-complete", {
    revision: String(before.data.revision),
  });
  progress("originals-read-start", { total: sourceIds.size });
  const originals = await db
    .from("design_components")
    .select("id,definition_hash,status")
    .in("id", Array.from(sourceIds));
  if (originals.error) throw originals.error;
  for (const row of manifest.rows)
    if (
      !originals.data?.some(
        (d: any) =>
          d.id === row.sourceId && d.definition_hash === row.sourceHash
      )
    )
      throw new Error(`Original hash not present: ${row.sourceId}`);
  progress("originals-read-complete", { total: sourceIds.size });
  let revision: string;
  if (mode.kind === "stage") {
    progress("stage-start", { total: definitions.length });
    // Assets are exactly those already verified for the original definitions.
    // The staging transaction verifies their manifests; this command uploads no bytes.
    const staged = await withCatalogStaging(async () => {
      const results = [];
      for (let i = 0; i < definitions.length; i += 4) {
        results.push(
          ...(await Promise.all(
            definitions
              .slice(i, i + 4)
              .map((d: any) => prepareComponentDraft(d, mode.actor))
          ))
        );
        console.log(
          JSON.stringify({
            stage: "immutable-drafts",
            processed: results.length,
            total: definitions.length,
          })
        );
      }
      progress("stage-commit-start", { total: results.length });
      return results;
    });
    revision = staged.revision;
    progress("stage-returned", { revision });
  } else {
    revision = mode.revision;
  }
  // Confirm the remote immutable revision exists even if the read-through
  // snapshot/definition caches already contain this revision locally.
  progress("revision-manifest-read-start", { revision });
  const remoteManifest = await readCatalogManifest(revision);
  progress("revision-manifest-read-complete", { revision });
  progress("snapshot-read-start", { revision });
  const snapshot = await readCatalogSnapshot(revision);
  if (arsenalHash(snapshot) !== remoteManifest.hash)
    throw new Error("Remote revision snapshot hash mismatch");
  progress("snapshot-read-complete", { revision, rows: snapshot.rows.length });
  const selected = filterCompleteDesignRows(snapshot.rows, {
    aspectRatio: "4:5",
    postMode: "carousel",
    slideCount: 5,
    text: "",
    experimental: true,
  });
  const families = resolveDesignFamilyRepertoires(selected, {
    slideCount: 5,
    contentMode: "compose",
  });
  for (const family of expected)
    if (
      !families.some(
        f => f.sourceId === family.sourceId && f.signature === family.signature
      )
    )
      throw new Error(
        `Staged repertoire readback mismatch: ${family.sourceId}`
      );
  for (const row of manifest.rows)
    if (
      !snapshot.rows.some(
        r =>
          r.component_id === row.sourceId &&
          r.definition_hash === row.sourceHash
      )
    )
      throw new Error(`Original missing from staged snapshot: ${row.sourceId}`);
  progress("definitions-readback-start", {
    revision,
    total: definitions.length,
  });
  for (let i = 0; i < definitions.length; i += 8) {
    await Promise.all(
      definitions.slice(i, i + 8).map(async (d: any) => {
        const hydrated = componentDefinitionV1Schema.parse(
          await readCatalogDefinition(revision, d.id, d.hash)
        );
        if (arsenalHash(hydrated) !== arsenalHash(d))
          throw new Error(`Definition readback mismatch: ${d.id}`);
      })
    );
    progress("definitions-readback-progress", {
      revision,
      processed: Math.min(i + 8, definitions.length),
      total: definitions.length,
    });
  }
  progress("definitions-readback-complete", {
    revision,
    total: definitions.length,
  });
  progress("active-manifest-recheck-start");
  const after = await db.rpc("catalog_manifest");
  if (after.error) throw after.error;
  if (
    after.data.revision !== before.data.revision ||
    after.data.hash !== before.data.hash ||
    after.data.dirty !== before.data.dirty
  )
    throw new Error(
      "Active catalog changed during this command; inspect before proceeding"
    );
  const report = {
    version: 1,
    stagedRevision: revision,
    readOnly: mode.kind === "verify-staged",
    activeUnchangedDuringCommand: true,
    isActiveRevision: String(after.data.revision) === revision,
    activeRevision: after.data.revision,
    definitions: definitions.length,
    familyCandidates: expected.length,
    sourceHashesPreserved: true,
    readbackVerified: true,
    activated: false,
    assetUploads: 0,
    modelCalls: 0,
  };
  progress("active-manifest-recheck-complete", {
    revision: String(after.data.revision),
  });
  if (mode.kind === "stage")
    await fs.writeFile(
      path.join(root, "staging-report.json"),
      JSON.stringify(report, null, 2)
    );
  console.log(JSON.stringify(report));
}
