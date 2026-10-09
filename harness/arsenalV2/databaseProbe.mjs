import { randomUUID } from "node:crypto";
// Isolated PostgreSQL + pgvector. Synthetic evidence here is test data, never human approval.
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { arsenalHash } from "../../shared/arsenalContent.ts";
import {
  ARSENAL_REVIEW_POLICY,
  describeArsenalVariant,
  compactArsenalCard,
} from "../../shared/arsenalCatalog.ts";
import {
  STRUCTURAL_L1_METRIC_HASH as metricHash,
  STRUCTURAL_L1_METRIC_VERSION as metric,
  projectStructuralL1,
  projectedL1Distance,
} from "../../shared/designDescriptorMetric.ts";
const root = process.env.ARSENAL_DBTOOLS;
if (!root)
  throw new Error(
    "Set ARSENAL_DBTOOLS to a temporary installation of @electric-sql/pglite"
  );
const { PGlite } = await import(
  `${root}/node_modules/@electric-sql/pglite/dist/index.js`
);
const { vector } = await import(
  `${root}/node_modules/@electric-sql/pglite/dist/vector/index.js`
);
const db = new PGlite({ extensions: { vector } }),
  checks = [];
const check = name => {
  checks.push(name);
  console.log("PASS", name);
};
async function reject(name, operation) {
  await assert.rejects(operation);
  check(name);
}
await db.exec(`create schema postspark;create schema auth;create role anon;create role authenticated;create role service_role bypassrls;
create table auth.users(id uuid primary key);grant usage on schema postspark,auth to service_role;
create table postspark.generation_runs(id uuid primary key,user_uuid uuid references auth.users(id),status text,output_snapshot jsonb);
grant select,update on postspark.generation_runs to service_role;grant select on auth.users to service_role;`);
await db.exec(await fs.readFile("drizzle/0018_design_catalog.sql", "utf8"));
await db.exec(
  await fs.readFile("drizzle/0023_arsenal_generation_trace_columns.sql", "utf8")
);
const traceColumns = await db.query(
  "select events,events_version,failure_reason from postspark.generation_runs limit 0"
);
assert.equal(traceColumns.rows.length, 0);
check("additive generation trace columns installed");
await db.exec(await fs.readFile("drizzle/0019_design_arsenal_v2.sql", "utf8"));
await db.exec(
  await fs.readFile("drizzle/0020_design_arsenal_brand_fonts.sql", "utf8")
);
await db.exec(
  await fs.readFile(
    "drizzle/0021_design_arsenal_publication_presence.sql",
    "utf8"
  )
);
if (true /* 0024 always uses native pgvector L1 */)
  await db.exec(
    await fs.readFile("drizzle/0022_design_arsenal_native_l1.sql", "utf8")
  );
await db.exec(
  await fs.readFile("drizzle/0024_design_arsenal_variable_content.sql", "utf8")
);
await db.exec(
  await fs.readFile("harness/designCatalog/databaseProbe.sql", "utf8")
);
check("V1 regression");
const actor = "00000000-0000-4000-8000-000000000010",
  other = "00000000-0000-4000-8000-000000000020",
  id = "00000000-0000-4000-8000-000000000011",
  run = "00000000-0000-4000-8000-000000000012";
await db.query("insert into auth.users values ($1),($2)", [actor, other]);
const pkg = JSON.parse(await fs.readFile(process.argv[2], "utf8"));
// One real converted shape, synthetic IDs and human decisions for the isolated gate tests.
const definition = {
    ...pkg.definition,
    variants: [pkg.definition.variants[0]],
  },
  variant = definition.variants[0],
  hash = arsenalHash(definition),
  vh = arsenalHash(variant);
await db.exec("set role service_role");
const pieces = Object.entries(pkg.pieces).map(([hash, definition]) => ({
  key: hash,
  hash,
  definition,
}));
await db.query("select postspark.design_catalog_create($1,$1,$2,$3,$4,$5,$1)", [
  id,
  hash,
  definition,
  pieces,
  actor,
]);
const duplicate = await db.query(
  "select postspark.design_catalog_create(gen_random_uuid(),$1,$2,$3,$4,$5,$1) id",
  [id, hash, definition, pieces, actor]
);
assert.equal(duplicate.rows[0].id, id);
check("idempotent draft");
await reject("old RPC blocks incomplete V2", () =>
  db.query("select postspark.design_catalog_status($1,'approved',$2,$1)", [
    id,
    actor,
  ])
);
await reject("direct UPDATE blocks incomplete V2", () =>
  db.query(
    "update postspark.design_catalog_versions set status='approved' where id=$1",
    [id]
  )
);
await reject("direct INSERT blocks incomplete V2", () =>
  db.query(
    "insert into postspark.design_catalog_versions(id,blueprint_id,version,status,content_hash,definition,created_by) values(gen_random_uuid(),gen_random_uuid(),1,'approved',$1,$2,$3)",
    ["b".repeat(64), definition, actor]
  )
);
await reject("direct INSERT rejects V2 with absent compiler/variants", () =>
  db.query(
    "insert into postspark.design_catalog_versions(id,blueprint_id,version,status,content_hash,definition,created_by) values(gen_random_uuid(),gen_random_uuid(),1,'approved',$1,$2,$3)",
    ["d".repeat(64), { schemaVersion: 2 }, actor]
  )
);
await reject("human evidence requires actual PNG/brief hashes", () =>
  db.query(
    "insert into postspark.design_catalog_evidence(version_id,variant_key,definition_hash,variant_hash,policy_version,kind,decision,source,actor_id,reviewed_at) values($1,$2,$3,$4,$5,'human','approved','admin_review',$6,now())",
    [id, variant.variantKey, hash, vh, ARSENAL_REVIEW_POLICY, actor]
  )
);
for (const asset of definition.assets) {
  await db.query(
    "insert into postspark.design_catalog_assets(id,sha256,storage_key,manifest,metadata,verified_at) values($1,$2,$2,$3,$4,now())",
    [asset.id, asset.sha256, asset, { signatureVerified: true, decoded: true }]
  );
  await db.query(
    "insert into postspark.design_catalog_version_assets values($1,$2)",
    [id, asset.id]
  );
}
const descriptor = describeArsenalVariant(variant, pkg.pieces),
  projected = projectStructuralL1(descriptor.structure),
  card = compactArsenalCard(definition, variant);
await db.query(
  "insert into postspark.design_catalog_search_documents(version_id,variant_key,descriptor_version,metric_version,metric_hash,definition_hash,variant_hash,projected,descriptor,card) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
  [
    id,
    variant.variantKey,
    "structural-v1",
    metric,
    metricHash,
    hash,
    vh,
    JSON.stringify(projected),
    descriptor,
    card,
  ]
);
await db.query(
  "insert into postspark.design_catalog_evidence(version_id,variant_key,definition_hash,variant_hash,policy_version,kind,decision,source,actor_id,metrics) values($1,$2,$3,$4,$5,'technical','verified','server',$6,$7)",
  [
    id,
    variant.variantKey,
    hash,
    vh,
    ARSENAL_REVIEW_POLICY,
    actor,
    {
      metricHash,
      graphVerified: true,
      piecesVerified: true,
      assetsVerified: true,
      variant,
      descriptor,
      projected,
      card,
    },
  ]
);
await reject("technical evidence does not imply human approval", () =>
  db.query("select postspark.design_catalog_status($1,'approved',$2,$1)", [
    id,
    actor,
  ])
);
let humanSequence = 0;
async function human(decision) {
  await db.query(
    "insert into postspark.design_catalog_evidence(version_id,variant_key,definition_hash,variant_hash,policy_version,kind,decision,source,actor_id,png_hash,briefing_hash,reviewed_at,created_at) values($1,$2,$3,$4,$5,'human',$6,'admin_review',$7,$8,$8,now(),$9)",
    [
      id,
      variant.variantKey,
      hash,
      vh,
      ARSENAL_REVIEW_POLICY,
      decision,
      actor,
      "c".repeat(64),
      new Date(Date.now() + ++humanSequence * 1000).toISOString(),
    ]
  );
}
await human("approved");
await human("rejected");
await reject("latest human rejection supersedes previous approval", () =>
  db.query("select postspark.design_catalog_status($1,'approved',$2,$1)", [
    id,
    actor,
  ])
);
await human("approved");
await db.query("select postspark.design_catalog_status($1,'approved',$2,$1)", [
  id,
  actor,
]);
check("complete publication");
const nextDefinition = {
  ...definition,
  name: `${definition.name} next test version`,
};
const next = await db.query(
  "select postspark.design_catalog_create(gen_random_uuid(),$1,$2,$3,$4,$5,$1) id",
  [id, arsenalHash(nextDefinition), nextDefinition, pieces, actor]
);
await reject(
  "failed promotion leaves previous approved version intact",
  async () => {
    try {
      await db.query(
        "select postspark.design_catalog_status($1,'approved',$2,$1)",
        [next.rows[0].id, actor]
      );
    } catch (e) {
      assert.equal(
        (
          await db.query(
            "select status from postspark.design_catalog_versions where id=$1",
            [id]
          )
        ).rows[0].status,
        "approved"
      );
      assert.equal(
        (
          await db.query(
            "select status from postspark.design_catalog_versions where id=$1",
            [next.rows[0].id]
          )
        ).rows[0].status,
        "draft"
      );
      throw e;
    }
  }
);
await reject("published links immutable", () =>
  db.query(
    "insert into postspark.design_catalog_version_assets values($1,$2)",
    [id, definition.assets[0].id]
  )
);
await reject("evidence append-only", () =>
  db.query(
    "update postspark.design_catalog_evidence set decision='approved' where version_id=$1",
    [id]
  )
);
const anchor = projected.map((n, i) => Math.fround(n + (i % 3) * 0.001)),
  args = [
    JSON.stringify(anchor),
    variant.aspectRatio,
    variant.capabilities,
    false,
    { present: ["headline"] },
    "structural-v1",
    metric,
    metricHash,
    20,
    [],
  ];
const neighbors = await db.query(
  "select * from postspark.design_catalog_search_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
  args
);
assert.equal(neighbors.rows.length, 1);
const js = projectedL1Distance(projected.map(Math.fround), anchor),
  error = Math.abs(js - neighbors.rows[0].distance);
assert(error < 1e-5);
check("SQL/JS exact L1 within 1e-5");
const metadata = await db.query(
  "select * from postspark.design_catalog_search_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
  [null, ...args.slice(1)]
);
assert.equal(metadata.rows[0].distance, null);
check("metadata fallback does not claim vector distance");

// V3 catalogue contracts still require matching technical evidence AND a human review.
const v3id = randomUUID(),
  v3variant = {
    ...variant,
    compilerVersion: "arsenal-v3.0.0",
    bindings: variant.bindings.map(b => ({
      ...b,
      source:
        b.source === "headline"
          ? "block:body:0:text"
          : b.source === "body"
            ? "block:body:1:text"
            : b.source,
    })),
  };
const v3definition = {
  ...definition,
  name: "Variable content probe",
  compilerVersion: "arsenal-v3.0.0",
  variants: [v3variant],
};
const v3hash = arsenalHash(v3definition),
  v3vh = arsenalHash(v3variant),
  v3desc = describeArsenalVariant(v3variant, pkg.pieces),
  v3proj = projectStructuralL1(v3desc.structure),
  v3card = compactArsenalCard(v3definition, v3variant);
await db.query("select postspark.design_catalog_create($1,$1,$2,$3,$4,$5,$1)", [
  v3id,
  v3hash,
  v3definition,
  pieces,
  actor,
]);
for (const asset of definition.assets)
  await db.query(
    "insert into postspark.design_catalog_version_assets values($1,$2)",
    [v3id, asset.id]
  );
await db.query(
  "insert into postspark.design_catalog_search_documents(version_id,variant_key,descriptor_version,metric_version,metric_hash,definition_hash,variant_hash,projected,descriptor,card) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
  [
    v3id,
    v3variant.variantKey,
    "structural-v1",
    metric,
    metricHash,
    v3hash,
    v3vh,
    JSON.stringify(v3proj),
    v3desc,
    v3card,
  ]
);
await db.query(
  "insert into postspark.design_catalog_evidence(version_id,variant_key,definition_hash,variant_hash,policy_version,kind,decision,source,actor_id,metrics) values($1,$2,$3,$4,$5,'technical','verified','server',$6,$7)",
  [
    v3id,
    v3variant.variantKey,
    v3hash,
    v3vh,
    ARSENAL_REVIEW_POLICY,
    actor,
    {
      metricHash,
      graphVerified: true,
      piecesVerified: true,
      assetsVerified: true,
      variant: v3variant,
      descriptor: v3desc,
      projected: v3proj,
      card: v3card,
    },
  ]
);
await reject("V3 without mandatory title still requires human review", () =>
  db.query("select postspark.design_catalog_status($1,'approved',$2,$1)", [
    v3id,
    actor,
  ])
);
await db.query(
  "insert into postspark.design_catalog_evidence(version_id,variant_key,definition_hash,variant_hash,policy_version,kind,decision,source,actor_id,png_hash,briefing_hash,reviewed_at) values($1,$2,$3,$4,$5,'human','approved','admin_review',$6,$7,$7,now())",
  [
    v3id,
    v3variant.variantKey,
    v3hash,
    v3vh,
    ARSENAL_REVIEW_POLICY,
    actor,
    "c".repeat(64),
  ]
);
await db.query("select postspark.design_catalog_status($1,'approved',$2,$1)", [
  v3id,
  actor,
]);
check("reviewed V3 without title publishes with matching evidence");
const v3search = await db.query(
  "select * from postspark.design_catalog_search_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
  [
    null,
    variant.aspectRatio,
    variant.capabilities,
    false,
    { variable: true, present: ["body"], available: ["body"] },
    "structural-v1",
    metric,
    metricHash,
    20,
    [],
  ]
);
assert.deepEqual(
  v3search.rows.map(r => r.version_id),
  [v3id]
);
check("V3 semantic retrieval excludes required titles for body-only requests");
await db.query("select postspark.design_catalog_status($1,'archived',$2,$1)", [
  v3id,
  actor,
]);
await db.exec("reset role");
await db.query(
  "insert into postspark.generation_runs values($1,$2,'completed',null)",
  [run, actor]
);
await db.exec("set role service_role");
const output = [
  {
    catalogSelectionV2: {
      candidates: [
        {
          versionId: id,
          definitionHash: hash,
          variantKey: variant.variantKey,
          variantHash: vh,
        },
      ],
      assets: definition.assets,
    },
  },
];
await reject("wrong run ownership rejected", () =>
  db.query("select postspark.design_catalog_deliver_v2($1,$2,$3)", [
    run,
    other,
    output,
  ])
);
await db.query("select postspark.design_catalog_deliver_v2($1,$2,$3)", [
  run,
  actor,
  output,
]);
assert.equal(
  (
    await db.query(
      "select count(*)::int n from postspark.design_catalog_asset_grants where user_uuid=$1",
      [actor]
    )
  ).rows[0].n,
  definition.assets.length
);
check("bundle and durable grants atomic");
await db.query("select postspark.design_catalog_deliver_v2($1,$2,$3)", [
  run,
  actor,
  output,
]);
assert.equal(
  (
    await db.query(
      "select count(*)::int n from postspark.design_catalog_asset_grants where user_uuid=$1",
      [actor]
    )
  ).rows[0].n,
  definition.assets.length
);
assert.equal(
  (
    await db.query(
      "select count(*)::int n from postspark.design_catalog_version_grants where user_uuid=$1",
      [actor]
    )
  ).rows[0].n,
  1
);
check("delivery retries preserve idempotent grants");
if (process.argv.includes("--benchmark")) await benchmark();
await db.query("select postspark.design_catalog_status($1,'archived',$2,$1)", [
  id,
  actor,
]);
assert.equal(
  (
    await db.query(
      "select count(*)::int n from postspark.design_catalog_version_grants where user_uuid=$1",
      [actor]
    )
  ).rows[0].n,
  1
);
check("version/assets retained after archival");
assert.equal(
  (
    await db.query(
      "select * from postspark.design_catalog_search_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      args
    )
  ).rows.length,
  0
);
check("archived version excluded from new search");
await db.exec(
  "reset role;grant usage on schema postspark to authenticated,anon;set role authenticated"
);
await reject("authenticated cannot read private assets", () =>
  db.query("select * from postspark.design_catalog_assets")
);
await reject("authenticated cannot call retrieval RPC", () =>
  db.query(
    "select * from postspark.design_catalog_search_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
    args
  )
);
await db.exec("reset role;set role anon");
await reject("anon cannot read catalogue", () =>
  db.query("select * from postspark.design_catalog_versions")
);
await fs.mkdir("artifacts/arsenal-v2", { recursive: true });
await fs.writeFile(
  "artifacts/arsenal-v2/database-probe.json",
  JSON.stringify(
    {
      environment: "isolated PGlite PostgreSQL + pgvector",
      productionWrites: false,
      checks,
      metric,
      metricHash,
      L1AbsoluteError: error,
    },
    null,
    2
  )
);
async function benchmark() {
  // Synthetic documents stay only in this in-memory database, never production.
  await db.exec("reset role");
  const samples = [];
  for (const size of [500, 5000]) {
    await db.query(
      `insert into postspark.design_catalog_search_documents
      (version_id,variant_key,descriptor_version,metric_version,metric_hash,definition_hash,variant_hash,projected,descriptor,card)
      select version_id,'synthetic-benchmark-'||g,descriptor_version,metric_version,metric_hash,definition_hash,variant_hash,(SELECT jsonb_agg(x::double precision+(g%97)*0.000001+(i%11)*g*0.00000001) FROM jsonb_array_elements_text(projected::text::jsonb) WITH ORDINALITY a(x,i))::text::extensions.vector,descriptor,card
      from postspark.design_catalog_search_documents cross join generate_series(1,$2::integer-1) g
      where version_id=$1 and variant_key=$3 on conflict do nothing`,
      [id, size, variant.variantKey]
    );
    const timings = [];
    let maxDistanceError = 0;
    for (let q = 0; q < 101; q++) {
      const t = performance.now();
      const result = await db.query(
        "select * from postspark.design_catalog_search_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
        args
      );
      for (const row of result.rows) {
        const g =
          Number(row.variant_key.replace("synthetic-benchmark-", "")) || 0;
        const synthetic = projected.map((n, i) =>
          Math.fround(n + (g % 97) * 0.000001 + ((i + 1) % 11) * g * 0.00000001)
        );
        maxDistanceError = Math.max(
          maxDistanceError,
          Math.abs(projectedL1Distance(synthetic, anchor) - row.distance)
        );
      }
      if (q) timings.push(performance.now() - t);
    }
    timings.sort((a, b) => a - b);
    samples.push({
      variants: size,
      queries: 100,
      cache: "warm after one query",
      p50Ms: timings[49],
      p95Ms: timings[94],
      maxMs: timings[99],
      meetsRpc500ms: timings[94] <= 500,
      maxDistanceError,
    });
    console.log("BENCHMARK", JSON.stringify(samples.at(-1)));
  }
  await fs.writeFile(
    `artifacts/arsenal-v2/search-benchmark${true /* 0024 always uses native pgvector L1 */ ? "-native" : ""}.json`,
    JSON.stringify(
      {
        environment: "PGlite/WASM on local host; not remote Postgres latency",
        productionWrites: false,
        algorithm: true /* 0024 always uses native pgvector L1 */
          ? "sql-exact-l1-pgvector-v1"
          : "sql-exact-l1-sum-v1",
        samples,
      },
      null,
      2
    )
  );
}
await db.close();
