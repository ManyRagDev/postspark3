/**
 * Build (offline local E5 inference + service read of immutable snapshot):
 * node --env-file=.env --import tsx scripts/provisionSemanticDesignIndex.ts --revision 7 --output /path/index.json
 * Publish an already reviewed bundle with explicit administrative credentials:
 * DESIGN_INDEX_DATABASE_URL=... node --import tsx scripts/provisionSemanticDesignIndex.ts --publish /path/index.json
 * Remote publication additionally requires --allow-remote. No model download or paid API call.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Client } from "pg";
import { closeSearchEngines } from "../server/designCatalog/familySearchIndex";
import { prepareSemanticCatalogIndex, readSemanticEnglishProfiles, validateSemanticDesignIndex } from "../server/designCatalog/semanticDesignIndex";

const args = process.argv.slice(2);
const value = (flag: string) => {const i = args.indexOf(flag); return i < 0 ? undefined : args[i + 1];};
async function main() {
  const publication = value("--publish");
  if (publication) {
    const index = validateSemanticDesignIndex(JSON.parse(await readFile(publication, "utf8")));
    const connectionString = process.env.DESIGN_INDEX_DATABASE_URL;
    if (!connectionString) throw new Error("Set DESIGN_INDEX_DATABASE_URL explicitly; the runtime service role cannot publish indexes.");
    const target = new URL(connectionString);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) && !args.includes("--allow-remote"))
      throw new Error("Remote index publication requires --allow-remote.");
    const db = new Client({connectionString});
    await db.connect();
    try {
      await db.query("BEGIN");
      const inserted = await db.query(`INSERT INTO postspark.design_semantic_indexes
        (index_hash,catalog_revision,editorial_hash,profile_version,model_fingerprint,model_metadata,calibration_hash,calibration_version,calibration_metadata,document_count)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(index_hash) DO NOTHING RETURNING index_hash`,
        [index.hash,index.catalogRevision,index.editorialHash,index.profileVersion,index.model.fingerprint,index.model,index.calibration.hash,index.calibration.version,index.calibration,index.documents.length]);
      if (inserted.rowCount) for (const row of index.documents) await db.query(`INSERT INTO postspark.design_semantic_documents
        (index_hash,source_id,source_hash,source_text_hash,profile_hash,row_hash,profile_text,embedding,mean_affinity,generic_excess)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [index.hash,row.sourceId,row.sourceHash,row.sourceTextHash,row.profileHash,row.rowHash,row.textEn,JSON.stringify(row.vector),row.meanAffinity,row.genericExcess]);
      const readback = await db.query<{source_id: string; row_hash: string}>("SELECT source_id,row_hash FROM postspark.design_semantic_documents WHERE index_hash=$1", [index.hash]);
      if (readback.rows.length !== index.documents.length || index.documents.some(row => !readback.rows.some(stored => stored.source_id === row.sourceId && stored.row_hash === row.rowHash)))
        throw new Error("semantic_design_published_index_conflict");
      await db.query("COMMIT");
      console.log(JSON.stringify({published: true, revision: index.catalogRevision, indexHash: index.hash, documents: index.documents.length, alreadyPresent: !inserted.rowCount}));
    } catch (error) { await db.query("ROLLBACK"); throw error; }
    finally { await db.end(); }
    return;
  }
  const revision = value("--revision"), output = value("--output");
  if (!revision || !/^\d+$/.test(revision) || !output) throw new Error("Usage: --revision NUMBER --output PATH [--profiles PATH] [--previous PATH], or --publish PATH [--allow-remote]");
  const previousFile = value("--previous");
  const index = await prepareSemanticCatalogIndex(revision, {
    profiles: await readSemanticEnglishProfiles(value("--profiles")),
    previous: previousFile ? validateSemanticDesignIndex(JSON.parse(await readFile(previousFile,"utf8"))) : undefined,
  });
  const path = resolve(output);
  await mkdir(dirname(path), {recursive: true, mode: 0o700});
  await writeFile(path, JSON.stringify(index), {flag: "wx", mode: 0o600});
  console.log(JSON.stringify({built: true, revision, indexHash: index.hash, modelFingerprint: index.model.fingerprint, documents: index.documents.length, path, paidCalls: 0}));
}
try { await main(); }
catch (error) {
  // Do not print connection options, URLs, server details, or credentials.
  console.error(error instanceof Error && !process.env.DESIGN_INDEX_DATABASE_URL ? error.message : "semantic_design_provision_failed");
  process.exitCode = 1;
} finally { await closeSearchEngines(); }
