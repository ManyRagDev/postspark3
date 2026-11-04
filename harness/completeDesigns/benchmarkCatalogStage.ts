/** Offline PostgreSQL benchmark of the actual baseline + repertoire package.
 * No provider/network calls. Input baseline is a previously captured catalog_staged_snapshot.
 * The fixture models pgvector's projected field as text; this measures staging, not activation.
 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import {
  generationReleasePostgresFixture,
  releaseOwner,
} from "../../server/ai/workflows/generationReleasePostgres.fixture";
import { arsenalHash } from "../../shared/arsenalContent";
import {
  compactComponentCard,
  componentDefinitionV1Schema,
} from "../../shared/componentAssembly";
import {
  describeComponent,
  COMPONENT_DESCRIPTOR_VERSION,
} from "../../server/designCatalog/componentStore";
import { validateCatalogSnapshot } from "../../server/designCatalog/versionedCatalog";
import { catalogStageDeltaRows } from "../../server/designCatalog/stagingDelta";

const [baselineFile, packageDirectory, reportFile] = process.argv.slice(2);
if (!baselineFile || !packageDirectory || !reportFile)
  throw new Error(
    "Usage: benchmarkCatalogStage.ts baseline.json repertoire-directory report.json"
  );
const baseline = JSON.parse(await fs.readFile(baselineFile, "utf8"));
const manifest = JSON.parse(
  await fs.readFile(path.join(packageDirectory, "manifest.json"), "utf8")
);
const packageRows = JSON.parse(
  await fs.readFile(path.join(packageDirectory, "catalog-rows.json"), "utf8")
);
assert.equal(arsenalHash(packageRows), manifest.snapshotHash);
assert.equal(packageRows.length, manifest.definitions);
const baselineRows = baseline.rows.map((row: any) => ({
  ...row,
  card:
    row.card ??
    compactComponentCard(componentDefinitionV1Schema.parse(row.definition)),
}));
validateCatalogSnapshot({ rows: baselineRows }, true);
const definitions = packageRows.map((r: any) =>
  componentDefinitionV1Schema.parse(r.definition)
);
const newDefinitions = definitions.filter((definition: any) => {
  const existing = baselineRows.find(
    (row: any) => row.component_id === definition.id
  );
  if (existing) assert.deepEqual(existing.definition, definition);
  return !existing;
});
const rows = [
  ...baselineRows,
  ...newDefinitions.map((definition: any) => ({
    component_id: definition.id,
    definition_hash: definition.hash,
    card: compactComponentCard(definition),
    definition,
    assets: [...definition.assets].sort((a, b) => a.id.localeCompare(b.id)),
    design_components: {
      status: "draft",
      definition_hash: definition.hash,
      source: definition.source,
    },
  })),
].sort((a, b) => a.component_id.localeCompare(b.component_id));
assert.equal(new Set(rows.map(r => r.component_id)).size, rows.length);
validateCatalogSnapshot({ rows }, true);
const descriptors = Object.fromEntries(
  rows.map(row => {
    const descriptor = describeComponent(
      componentDefinitionV1Schema.parse(row.definition)
    );
    return [
      row.component_id,
      {
        descriptor_version: COMPONENT_DESCRIPTOR_VERSION,
        projected: JSON.stringify(descriptor.structure),
        descriptor,
      },
    ];
  })
);
const summary = {
  approved: { staticOfferCount: 0, carouselOfferCount: 0 },
  experimental: { staticOfferCount: 0, carouselOfferCount: 0 },
};
const cardSnapshot = (items: any[]) => ({
  rows: items.map(({ definition, assets, ...row }) => row),
});
const pg = await generationReleasePostgresFixture();
let stageNotices: string[] = [];
const read = async (sql: string, params: any[] = []) =>
  (await pg.query<{ v: any }>(sql, params, {
    onNotice: notice => {
      if (notice.message.startsWith("postspark_catalog_stage_profile "))
        stageNotices.push(notice.message);
    },
  })).rows[0]?.v;
const migration = async (name: string) =>
  pg.exec(await fs.readFile(path.join("drizzle", name), "utf8"));
try {
  await pg.exec(`
    ALTER TABLE postspark.design_components ADD COLUMN source_key text, ADD COLUMN roles text[], ADD COLUMN densities text[], ADD COLUMN aspect_ratios text[];
    ALTER TABLE postspark.design_component_search_documents ADD COLUMN descriptor_version text, ADD COLUMN projected text, ADD COLUMN descriptor jsonb;
    CREATE UNIQUE INDEX stage_benchmark_search_identity ON postspark.design_component_search_documents(component_id);
    CREATE TABLE postspark.design_component_evidence(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),component_id uuid REFERENCES postspark.design_components(id),definition_hash text,kind text,decision text,actor_id uuid REFERENCES auth.users(id),metrics jsonb,created_at timestamptz DEFAULT now());
    CREATE INDEX stage_benchmark_evidence_identity ON postspark.design_component_evidence(component_id,definition_hash,kind,created_at DESC);
  `);
  await migration("0044_generation_model_config.sql");
  await migration("0045_staged_catalog_local_admission.sql");
  // Seed exact captured documents/asset manifests/cards, before installing the
  // approval trigger whose historical evidence is outside this snapshot.
  const assets = Array.from(
    new Map(rows.flatMap(r => r.assets).map(a => [a.id, a])).values()
  );
  await pg.query(
    "INSERT INTO postspark.design_catalog_assets SELECT value->>'id',value FROM jsonb_array_elements($1::jsonb)",
    [JSON.stringify(assets)]
  );
  await pg.query(
    `INSERT INTO postspark.design_components(id,definition_hash,definition,kind,status,actor_id)
    SELECT (value->>'component_id')::uuid,value->>'definition_hash',value->'definition',value->'definition'->>'kind',value->'design_components'->>'status',$2 FROM jsonb_array_elements($1::jsonb)`,
    [JSON.stringify(baseline.rows), releaseOwner]
  );
  await pg.query(
    `INSERT INTO postspark.design_component_assets SELECT (r->>'component_id')::uuid,a->>'id'
    FROM jsonb_array_elements($1::jsonb) r CROSS JOIN LATERAL jsonb_array_elements(r->'assets') a`,
    [JSON.stringify(baseline.rows)]
  );
  await pg.query(
    `INSERT INTO postspark.design_component_search_documents(component_id,definition_hash,card,descriptor_version,projected,descriptor)
    SELECT (r->>'component_id')::uuid,r->>'definition_hash',r->'card',i->>'descriptor_version',i->>'projected',i->'descriptor'
    FROM jsonb_array_elements($1::jsonb) r CROSS JOIN LATERAL (SELECT $2::jsonb->(r->>'component_id') AS i) d WHERE r->'card'<>'null'::jsonb`,
    [JSON.stringify(baseline.rows), JSON.stringify(descriptors)]
  );
  await pg.query(
    `INSERT INTO postspark.design_component_evidence(component_id,definition_hash,kind,decision,actor_id,metrics)
    SELECT (r->>'component_id')::uuid,r->>'definition_hash','technical','verified',$2,'{}'::jsonb FROM jsonb_array_elements($1::jsonb) r`,
    [JSON.stringify(baseline.rows), releaseOwner]
  );
  const guards = await fs.readFile(
    "drizzle/0037_agent_component_review.sql",
    "utf8"
  );
  await pg.exec(
    guards.slice(
      guards.indexOf(
        "CREATE FUNCTION postspark.design_component_agent_review_guard()"
      ),
      guards.indexOf("\nCOMMIT;")
    )
  );
  await pg.exec(
    "CREATE TRIGGER component_guard BEFORE INSERT OR UPDATE OR DELETE ON postspark.design_components FOR EACH ROW EXECUTE FUNCTION postspark.design_component_guard();"
  );
  await pg.query(
    "UPDATE postspark.catalog_state SET source_revision=$1 WHERE id=true",
    [baseline.sourceRevision]
  );
  const persistedBaseline = await read(
    "SELECT postspark.catalog_staged_snapshot() AS v"
  );
  assert.deepEqual(persistedBaseline.rows, baseline.rows);
  if (baseline.revisions) {
    for (const release of baseline.revisions) {
      const snapshot = release.snapshot ?? cardSnapshot(
        String(release.revision) === String(baseline.manifest.revision)
          ? baseline.rows.filter((r: any) => r.card)
          : baselineRows
      );
      assert.equal(arsenalHash(snapshot), release.hash);
      await pg.query(
        "INSERT INTO postspark.catalog_revisions(revision,source_revision,snapshot,summary,content_hash) OVERRIDING SYSTEM VALUE VALUES($1,$2,$3::jsonb,$4::jsonb,$5)",
        [
          release.revision,
          release.sourceRevision,
          JSON.stringify(snapshot),
          JSON.stringify(release.summary),
          release.hash,
        ]
      );
      const payloads = snapshot.rows.map((card: any) => ({
        ...baselineRows.find((row: any) => row.component_id === card.component_id),
        ...card,
        publicationIndex: descriptors[card.component_id],
      }));
      await pg.query(
        `INSERT INTO postspark.catalog_revision_definitions(revision,component_id,definition_hash,payload)
         SELECT $1,(value->>'component_id')::uuid,value->>'definition_hash',value FROM jsonb_array_elements($2::jsonb)`,
        [release.revision, JSON.stringify(payloads)]
      );
    }
    await pg.query(
      "SELECT setval(pg_get_serial_sequence('postspark.catalog_revisions','revision'),$1)",
      [Math.max(...baseline.revisions.map((r: any) => r.revision))]
    );
    await pg.query(
      "UPDATE postspark.catalog_state SET active_revision=$1,published_source_revision=source_revision WHERE id=true",
      [baseline.manifest.revision]
    );
  } else {
    await read(
      "SELECT postspark.catalog_publish($1,$2::jsonb,$3::jsonb,$4) AS v",
      [
        baseline.sourceRevision,
        JSON.stringify(baseline.rows),
        JSON.stringify(summary),
        arsenalHash(cardSnapshot(baseline.rows)),
      ]
    );
  }
  const before = await read("SELECT postspark.catalog_manifest() AS v");
  const args = [
    baseline.sourceRevision,
    JSON.stringify(rows),
    JSON.stringify(summary),
    arsenalHash(cardSnapshot(rows)),
    JSON.stringify(
      definitions.map((definition: any) => ({
        definition,
        actor: releaseOwner,
      }))
    ),
    JSON.stringify(descriptors),
  ];
  const sql =
    "SELECT postspark.catalog_stage($1::bigint,$2::jsonb,$3::jsonb,$4,$5::jsonb,$6::jsonb) AS v";
  // Local instrumentation only: count the volatile call made by PostgREST's
  // exact lateral/json_to_record shape. It writes inside each rolled-back trial.
  await pg.exec(`
    CREATE TEMP TABLE benchmark_stage_calls(calls integer NOT NULL);
    INSERT INTO benchmark_stage_calls VALUES(0);
    CREATE FUNCTION pg_temp.benchmark_catalog_stage(p_source_revision bigint,p_rows jsonb,p_summary jsonb,p_hash text,p_components jsonb,p_indexes jsonb)
    RETURNS bigint LANGUAGE plpgsql VOLATILE AS $$
    BEGIN
      UPDATE pg_temp.benchmark_stage_calls SET calls=calls+1;
      RETURN postspark.catalog_stage(p_source_revision,p_rows,p_summary,p_hash,p_components,p_indexes);
    END $$;
    CREATE FUNCTION pg_temp.benchmark_catalog_stage_delta(p_source_revision bigint,p_base_revision bigint,p_base_hash text,p_rows jsonb,p_summary jsonb,p_hash text,p_components jsonb,p_indexes jsonb)
    RETURNS bigint LANGUAGE plpgsql VOLATILE AS $$
    BEGIN
      UPDATE pg_temp.benchmark_stage_calls SET calls=calls+1;
      RETURN postspark.catalog_stage_delta(p_source_revision,p_base_revision,p_base_hash,p_rows,p_summary,p_hash,p_components,p_indexes);
    END $$;
  `);
  const postgrestSql = `
    WITH pgrst_source AS (
      SELECT pgrst_call.pgrst_scalar FROM (SELECT $1::json AS json_data) pgrst_payload,
      LATERAL (
        SELECT p_source_revision,p_rows,p_summary,p_hash,p_components,p_indexes
        FROM json_to_record(pgrst_payload.json_data)
          AS _(p_source_revision bigint,p_rows jsonb,p_summary jsonb,p_hash text,p_components jsonb,p_indexes jsonb)
        LIMIT 1
      ) pgrst_body,
      LATERAL (
        SELECT pg_temp.benchmark_catalog_stage(
          p_source_revision:=pgrst_body.p_source_revision,p_rows:=pgrst_body.p_rows,
          p_summary:=pgrst_body.p_summary,p_hash:=pgrst_body.p_hash,
          p_components:=pgrst_body.p_components,p_indexes:=pgrst_body.p_indexes
        ) pgrst_scalar
      ) pgrst_call
    )
    SELECT coalesce(json_agg(t.pgrst_scalar)->0,'null') AS v
    FROM (SELECT * FROM pgrst_source LIMIT $2 OFFSET $3) t`;
  const deltaPostgrestSql = `
    WITH pgrst_source AS (
      SELECT pgrst_call.pgrst_scalar FROM (SELECT $1::json AS json_data) pgrst_payload,
      LATERAL (
        SELECT p_source_revision,p_base_revision,p_base_hash,p_rows,p_summary,p_hash,p_components,p_indexes
        FROM json_to_record(pgrst_payload.json_data)
          AS _(p_source_revision bigint,p_base_revision bigint,p_base_hash text,p_rows jsonb,p_summary jsonb,p_hash text,p_components jsonb,p_indexes jsonb)
        LIMIT 1
      ) pgrst_body,
      LATERAL (
        SELECT pg_temp.benchmark_catalog_stage_delta(
          p_source_revision:=pgrst_body.p_source_revision,p_base_revision:=pgrst_body.p_base_revision,p_base_hash:=pgrst_body.p_base_hash,
          p_rows:=pgrst_body.p_rows,p_summary:=pgrst_body.p_summary,p_hash:=pgrst_body.p_hash,
          p_components:=pgrst_body.p_components,p_indexes:=pgrst_body.p_indexes
        ) pgrst_scalar
      ) pgrst_call
    )
    SELECT coalesce(json_agg(t.pgrst_scalar)->0,'null') AS v
    FROM (SELECT * FROM pgrst_source LIMIT $2 OFFSET $3) t`;
  const measurements = [];
  for (const version of baseline.revisions
    ? ["0048", "0049", "0049-new-only", "0049-postgrest-new-only", "0050-postgrest-profile-new-only", "0051-postgrest-delta-new-only"]
    : ["0045", "0047"]) {
    if (version === "0047")
      await migration("0047_catalog_stage_batch_performance.sql");
    if (version === "0048") {
      await migration("0047_catalog_stage_batch_performance.sql");
      await migration("0048_catalog_snapshot_batch_performance.sql");
    }
    if (version === "0049")
      await migration("0049_catalog_stage_row_validation.sql");
    if (version.startsWith("0050"))
      await migration("0050_catalog_stage_timing.sql");
    const useDelta = version.startsWith("0051");
    if (useDelta) await migration("0051_catalog_stage_delta.sql");
    const snapshotStart = performance.now();
    assert.deepEqual(
      await read("SELECT postspark.catalog_staged_snapshot() AS v"),
      { sourceRevision: baseline.sourceRevision, rows: baseline.rows }
    );
    const snapshotReadMs = Math.round(performance.now() - snapshotStart);
    await pg.exec("BEGIN; SET LOCAL statement_timeout='60s'; SET LOCAL client_min_messages=log");
    stageNotices = [];
    const supplied = version.endsWith("new-only") ? newDefinitions : definitions;
    const measuredArgs = [...args];
    measuredArgs[4] = JSON.stringify(
      supplied.map((definition: any) => ({ definition, actor: releaseOwner }))
    );
    const usePostgrest = version.includes("postgrest");
    const deltaBase = useDelta ? baseline.revisions.find((r: any) => String(r.sourceRevision) === String(baseline.sourceRevision)) : null;
    const deltaRows = useDelta ? catalogStageDeltaRows(rows, deltaBase.snapshot?.rows ?? cardSnapshot(baselineRows).rows) : null;
    const body = JSON.stringify({
      p_source_revision: measuredArgs[0],
      ...(useDelta ? {p_base_revision: String(deltaBase.revision),p_base_hash:deltaBase.hash} : {}),
      p_rows: deltaRows ?? JSON.parse(measuredArgs[1]),
      p_summary: JSON.parse(measuredArgs[2]),
      p_hash: measuredArgs[3],
      p_components: JSON.parse(measuredArgs[4]),
      p_indexes: JSON.parse(measuredArgs[5]),
    });
    const start = performance.now();
    const revision = usePostgrest
      ? await read(useDelta ? deltaPostgrestSql : postgrestSql, [body, 1, 0])
      : await read(sql, measuredArgs);
    const elapsedMs = Math.round(performance.now() - start);
    const wrapperCalls = await read("SELECT calls AS v FROM pg_temp.benchmark_stage_calls");
    assert.equal(wrapperCalls, usePostgrest ? 1 : 0);
    if (version.startsWith("0050") || useDelta) {
      assert.deepEqual(stageNotices.map(message => message.match(/phase=(\w+)/)?.[1]), [
        "entered", "registered", "canonical_validated", "revision_inserted", "definitions_inserted", "completed",
      ]);
      assert.ok(stageNotices.every(message => !message.includes(releaseOwner)));
    } else assert.equal(stageNotices.length, 0);
    assert.deepEqual(
      await read("SELECT postspark.catalog_manifest() AS v"),
      before
    );
    assert.equal(
      await read(
        "SELECT count(*)::int AS v FROM postspark.catalog_revision_definitions WHERE revision=$1",
        [revision]
      ),
      rows.length
    );
    assert.deepEqual(
      await read(
        "SELECT snapshot AS v FROM postspark.catalog_revisions WHERE revision=$1",
        [revision]
      ),
      cardSnapshot(rows)
    );
    assert.equal(
      await read(
        "SELECT count(*)::int AS v FROM postspark.design_component_search_documents"
      ),
      baseline.rows.filter((r: any) => r.card).length
    );
    assert.equal(
      await read("SELECT count(*)::int AS v FROM postspark.design_components"),
      rows.length
    );
    assert.equal(
      await read(
        "SELECT count(*)::int AS v FROM postspark.design_component_evidence WHERE kind='technical'"
      ),
      baseline.rows.length + newDefinitions.length
    );
    measurements.push({
      version,
      registeredDefinitions: supplied.length,
      payloadBytes: Object.values(JSON.parse(body)).reduce<number>((n, value) =>
        n + Buffer.byteLength(typeof value === "object" ? JSON.stringify(value) : String(value)), 0),
      ...(usePostgrest ? { postgrestBodyBytes: Buffer.byteLength(body), wrapperFunctionCalls: wrapperCalls } : {}),
      ...(useDelta ? { deltaRows: deltaRows!.length, reusedRows: rows.length - deltaRows!.length } : {}),
      ...(stageNotices.length ? { phaseLogs: [...stageNotices] } : {}),
      elapsedMs,
      snapshotReadMs,
      revision,
      activeUnchanged: true,
      indexUnchanged: true,
      snapshotVerified: true,
    });
    console.log(JSON.stringify(measurements.at(-1)));
    await pg.exec("ROLLBACK");
    assert.equal(
      await read("SELECT count(*)::int AS v FROM postspark.design_components"),
      baseline.rows.length
    );
  }
  const report = {
    version: 1,
    engine: "PGlite PostgreSQL, in-process WASM",
    baselineRows: baseline.rows.length,
    suppliedDefinitions: definitions.length,
    reusedDefinitions: definitions.length - newDefinitions.length,
    newDefinitions: newDefinitions.length,
    totalRows: rows.length,
    packageHash: manifest.snapshotHash,
    payloadBytes: args.reduce((n, s) => n + Buffer.byteLength(String(s)), 0),
    measurements,
    limitations: [
      "Local CPU timings do not establish hosted Supabase timings.",
      "No PostgREST server in this harness; function timeout hoisting is documented upstream, to verify on the hosted RPC.",
      "pgvector field is modeled as text; activation is outside this measurement.",
    ],
    remoteMutations: 0,
    providerCalls: 0,
  };
  await fs.mkdir(path.dirname(reportFile), { recursive: true });
  await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      reportFile,
      baselineRows: baseline.rows.length,
      newDefinitions: newDefinitions.length,
    })
  );
} finally {
  await pg.close();
}
