import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { readLocalEnvironment } from "./environment.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const env = await readLocalEnvironment(root);
const account = JSON.parse(
  await readFile(path.join(root, ".acervo82-local/test-account.json"), "utf8")
);
if (account.supabaseUrl !== env.SUPABASE_URL)
  throw new Error("local_account_endpoint_mismatch");
const dryRun = process.argv.includes("--dry-run");
if (process.argv.slice(2).some(a => a !== "--dry-run"))
  throw new Error("unsupported_bootstrap_argument");
const db = new pg.Client({
  connectionString: env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
const skipped = [
  "0012_add_generation_events.sql",
  "0013_harden_generation_events.sql",
]; // Superseded by corrected 0015.
const migrations = (await readdir(path.join(root, "drizzle")))
  .filter(n => /^00\d\d_.+\.sql$/.test(n) && !skipped.includes(n))
  .sort();
if (migrations.length !== 54 || !migrations.at(-1).startsWith("0055_"))
  throw new Error("migration_roster_changed_review_required");
const steps = [
  ["local-prerequisites", "ops/acervo82/schema-prerequisites.sql"],
  ...migrations.map(n => [n, `drizzle/${n}`]),
  ["local-compatibility", "ops/acervo82/schema-compatibility.sql"],
];
const applied = [];
await db.connect();
try {
  await db.query("BEGIN");
  await db.query(
    "SELECT pg_advisory_xact_lock(hashtextextended('postspark.acervo82.bootstrap',0))"
  );
  const marker = await db.query(
    "select obj_description(to_regnamespace('acervo82_private'),'pg_namespace') as marker"
  );
  if (marker.rows[0].marker !== "postspark.acervo82.local-auth.v1")
    throw new Error("run_local_auth_setup_first");
  const existing = await db.query(
    "select to_regclass('acervo82_private.schema_steps') as journal, to_regclass('postspark.posts') as posts"
  );
  if (existing.rows[0].posts && !existing.rows[0].journal)
    throw new Error("unmanaged_local_schema_refusing_overwrite");
  await db.query(`create table if not exists acervo82_private.schema_steps (
    name text primary key, sha256 text not null, applied_at timestamptz not null default now());
    alter table acervo82_private.schema_steps enable row level security;
    revoke all on acervo82_private.schema_steps from public, anon, authenticated;`);
  for (const [name, filename] of steps) {
    let sql = (await readFile(path.join(root, filename), "utf8")).replace(
      /^\uFEFF/,
      ""
    );
    const hash = createHash("sha256").update(sql).digest("hex");
    const prior = await db.query(
      "select sha256 from acervo82_private.schema_steps where name=$1",
      [name]
    );
    if (prior.rowCount) {
      if (prior.rows[0].sha256 !== hash)
        throw new Error(`applied_schema_step_changed:${name}`);
      continue;
    }
    // One outer transaction covers the complete bootstrap, including migration
    // files with multiple top-level transactions. Function bodies remain intact.
    sql = sql
      .replace(/\r\n?/g, "\n")
      .replace(/^[\t ]*(?:BEGIN|COMMIT);[\t ]*$/gm, "");
    if (name === "0000_overrated_lucky_pierre.sql")
      sql = sql.replace(
        'CREATE SCHEMA "postspark";',
        'CREATE SCHEMA IF NOT EXISTS "postspark";'
      );
    try {
      await db.query(sql);
    } catch (error) {
      throw new Error(`bootstrap_step_failed:${name}:${error.message}`, {
        cause: error,
      });
    }
    await db.query(
      "insert into acervo82_private.schema_steps(name,sha256) values($1,$2)",
      [name, hash]
    );
    applied.push(name);
  }
  // A real local DEV profile, not the missing-profile FREE fallback. Preserve
  // any deliberate later profile change when repeating bootstrap.
  await db.query(
    "insert into postspark.profiles(id,email,plan,sparks) values($1,$2,'DEV',0) on conflict(id) do nothing",
    [account.id, account.email]
  );
  const catalog = await db.query(
    "select active_revision from postspark.catalog_state where id=true"
  );
  if (catalog.rows[0]?.active_revision)
    throw new Error("unexpected_active_catalog_review_required");
  await db.query(dryRun ? "ROLLBACK" : "COMMIT");
  console.log(
    JSON.stringify({
      localOnly: true,
      dryRun,
      appliedSteps: applied.length,
      skipped,
      paidCalls: 0,
      catalogActivated: false,
    })
  );
} catch (error) {
  await db.query("ROLLBACK");
  throw error;
} finally {
  await db.end();
}

if (!dryRun) {
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const buckets = [
    ["postspark-media", ["image/png", "image/jpeg", "image/webp"]],
    [
      "design-arsenal",
      [
        "font/woff2",
        "font/ttf",
        "font/otf",
        "image/png",
        "image/jpeg",
        "image/webp",
      ],
    ],
  ];
  for (const [name, mimes] of buckets) {
    const existing = await admin.storage.getBucket(name);
    if (existing.data?.public)
      throw new Error(`local_bucket_must_be_private:${name}`);
    if (
      existing.error &&
      !/not found|does not exist/i.test(existing.error.message)
    )
      throw existing.error;
    if (!existing.data) {
      const result = await admin.storage.createBucket(name, {
        public: false,
        fileSizeLimit: 8 * 1024 * 1024,
        allowedMimeTypes: mimes,
      });
      if (result.error) throw result.error;
    }
  }
  await writeFile(
    path.join(root, "artifacts/acervo82/preparation/bootstrap.json"),
    JSON.stringify(
      {
        version: 1,
        localOnly: true,
        steps: steps.map(([name]) => name),
        skipped,
        privateBuckets: buckets.map(([name]) => name),
        catalogActivated: false,
        paidCalls: 0,
      },
      null,
      2
    ) + "\n"
  );
  console.log(
    JSON.stringify({
      privateBuckets: buckets.map(([name]) => name),
      storageReady: true,
    })
  );
}
