import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { generationReleasePostgresFixture, releaseOwner, releaseOther } from "../ai/workflows/generationReleasePostgres.fixture";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { compactComponentCard, createComponentDefinition } from "@shared/componentAssembly";
import { arsenalHash } from "@shared/arsenalContent";

let pg: PGlite;
const [base, staged] = completeDesignTestDefinitions().map(d => createComponentDefinition({...d, assets: d.assets.map(a => ({...a, kind: "catalog" as const}))}));
const descriptor = {version: "component-structural-v1", structure: Array(48).fill(0), algorithm: "exact-normalized-l1-v1"};
const index = {descriptor_version: "component-structural-v1", descriptor, projected: JSON.stringify(descriptor.structure)};
let activeRevision: string;
async function value<T = any>(sql: string, params: unknown[] = []): Promise<T> { return (await pg.query<{value: T}>(sql, params)).rows[0]?.value; }
async function rejected(sql: string, params: unknown[], message: string | RegExp) {
  await pg.exec("SAVEPOINT expected_failure");
  try { await expect(pg.query(sql, params)).rejects.toThrow(message); }
  finally { await pg.exec("ROLLBACK TO SAVEPOINT expected_failure; RELEASE SAVEPOINT expected_failure;"); }
}
async function stageArguments() {
  const source = await value("SELECT postspark.catalog_staged_snapshot() AS value");
  const rows = [...source.rows, {component_id: staged.id, definition_hash: staged.hash, card: compactComponentCard(staged), definition: staged, assets: [...staged.assets].sort((a,b) => a.id.localeCompare(b.id)), design_components: {status: "draft", definition_hash: staged.hash, source: staged.source}}].sort((a,b) => a.component_id.localeCompare(b.component_id));
  return [source.sourceRevision, JSON.stringify(rows), JSON.stringify({approved: {staticOfferCount: 1,carouselOfferCount: 0},experimental: {staticOfferCount: 2,carouselOfferCount: 0}}), arsenalHash({rows: rows.map(({definition,assets,...r}) => r)}), JSON.stringify([{definition: staged,actor: releaseOwner}]), JSON.stringify(Object.fromEntries(rows.map(r => [r.component_id,index])))];
}
const stageSql = "SELECT postspark.catalog_stage($1::bigint,$2::jsonb,$3::jsonb,$4,$5::jsonb,$6::jsonb)::text AS value";
async function stage() { return value<string>(stageSql, await stageArguments()); }
const deltaSql = "SELECT postspark.catalog_stage_delta($1::bigint,$2::bigint,$3,$4::jsonb,$5::jsonb,$6,$7::jsonb,$8::jsonb)::text AS value";
async function deltaArguments() {
  const args=await stageArguments();
  const hash=await value("SELECT content_hash AS value FROM postspark.catalog_revisions WHERE revision=$1",[activeRevision]);
  return [args[0],activeRevision,hash,JSON.stringify(JSON.parse(args[1]).filter((r: any)=>r.component_id===staged.id)),args[2],args[3],args[4],args[5]];
}
async function admit(revision: string, mode: "staged" | "external" = "staged", key = randomUUID(), owner = releaseOwner, scope = "local-test") {
  const input = {ownerId: owner,inputType: "text",content: "Post local",platform: "instagram",postMode: "static",creationMode: "ideation",idempotencyKey: key};
  const params = [randomUUID(),owner,key,"a".repeat(64),JSON.stringify(input)];
  return mode === "staged"
    ? value("SELECT postspark.generation_admit_staged_local($1::uuid,$2::uuid,$3,$4,$5::jsonb,true,now()+interval '5 minutes',$6,$7::bigint) AS value", [...params,scope,revision])
    : value("SELECT postspark.generation_admit_external($1::uuid,$2::uuid,$3,$4,$5::jsonb,false,now()+interval '5 minutes',$6::bigint) AS value", [...params,revision]);
}
beforeAll(async () => {
  pg = await generationReleasePostgresFixture();
  await pg.exec(`
    ALTER TABLE postspark.design_components ADD COLUMN source_key text, ADD COLUMN roles text[], ADD COLUMN densities text[], ADD COLUMN aspect_ratios text[];
    ALTER TABLE postspark.design_component_search_documents ADD COLUMN descriptor_version text, ADD COLUMN projected text, ADD COLUMN descriptor jsonb;
    CREATE UNIQUE INDEX staged_test_search_identity ON postspark.design_component_search_documents(component_id);
    CREATE TABLE postspark.design_component_evidence(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),component_id uuid REFERENCES postspark.design_components(id),definition_hash text,kind text,decision text,actor_id uuid REFERENCES auth.users(id),metrics jsonb);
  `);
  for (const migration of ["0044_generation_model_config.sql", "0045_staged_catalog_local_admission.sql", "0047_catalog_stage_batch_performance.sql", "0048_catalog_snapshot_batch_performance.sql", "0049_catalog_stage_row_validation.sql", "0050_catalog_stage_timing.sql", "0051_catalog_stage_delta.sql"]) await pg.exec(readFileSync(new URL(`../../drizzle/${migration}`, import.meta.url), "utf8"));
  for (const asset of new Map([...base.assets, ...staged.assets].map(a => [a.id,a])).values()) await pg.query("INSERT INTO postspark.design_catalog_assets VALUES($1,$2::jsonb)", [asset.id,JSON.stringify(asset)]);
  await pg.query("INSERT INTO postspark.design_components(id,definition_hash,definition,kind,status,actor_id) VALUES($1,$2,$3::jsonb,'content','approved',$4)", [base.id,base.hash,JSON.stringify(base),releaseOwner]);
  for (const asset of base.assets) await pg.query("INSERT INTO postspark.design_component_assets VALUES($1,$2)", [base.id,asset.id]);
  await pg.query("INSERT INTO postspark.design_component_search_documents(component_id,definition_hash,card,descriptor_version,projected,descriptor) VALUES($1,$2,$3::jsonb,$4,$5,$6::jsonb)", [base.id,base.hash,JSON.stringify(compactComponentCard(base)),index.descriptor_version,index.projected,JSON.stringify(descriptor)]);
  const snapshot = await value("SELECT postspark.catalog_staged_snapshot() AS value");
  activeRevision = await value("SELECT postspark.catalog_publish($1,$2::jsonb,$3::jsonb,$4)::text AS value", [snapshot.sourceRevision,JSON.stringify(snapshot.rows),JSON.stringify({approved:{staticOfferCount:1,carouselOfferCount:0},experimental:{staticOfferCount:1,carouselOfferCount:0}}),arsenalHash({rows:snapshot.rows.map(({definition,assets,...r}: any) => r)})]);
}, 30000);
afterAll(async () => { await pg?.close(); });
beforeEach(async () => { await pg.exec("BEGIN"); });
afterEach(async () => { await pg.exec("ROLLBACK"); });

describe("staged catalogue / real PostgreSQL", () => {
  it("delta transport produces the same stored snapshot/definitions as full staging without live activation", async () => {
    const before=await value("SELECT postspark.catalog_manifest() AS value");
    await pg.exec("SAVEPOINT full_protocol");
    const full=await stage();
    const snapshot=await value("SELECT snapshot AS value FROM postspark.catalog_revisions WHERE revision=$1",[full]);
    const payloads=await value("SELECT jsonb_agg(payload ORDER BY component_id) AS value FROM postspark.catalog_revision_definitions WHERE revision=$1",[full]);
    await pg.exec("ROLLBACK TO SAVEPOINT full_protocol; RELEASE SAVEPOINT full_protocol");
    const args=await deltaArguments();
    await pg.exec("SET ROLE service_role");
    const delta=await value<string>(deltaSql,args);
    await pg.exec("RESET ROLE");
    expect(await value("SELECT snapshot AS value FROM postspark.catalog_revisions WHERE revision=$1",[delta])).toEqual(snapshot);
    expect(await value("SELECT jsonb_agg(payload ORDER BY component_id) AS value FROM postspark.catalog_revision_definitions WHERE revision=$1",[delta])).toEqual(payloads);
    expect(await value("SELECT postspark.catalog_manifest() AS value")).toEqual(before);
    expect(await value("SELECT count(*)::int AS value FROM postspark.design_component_search_documents")).toBe(1);
    expect(await value("SELECT prosecdef AS value FROM pg_proc WHERE oid='postspark.catalog_stage_delta(bigint,bigint,text,jsonb,jsonb,text,jsonb,jsonb)'::regprocedure")).toBe(false);
    expect(await value("SELECT proconfig AS value FROM pg_proc WHERE oid='postspark.catalog_stage_delta(bigint,bigint,text,jsonb,jsonb,text,jsonb,jsonb)'::regprocedure")).toContain("statement_timeout=60s");
    await pg.exec("SET ROLE authenticated");
    await rejected(deltaSql,args,/permission denied/);
    await pg.exec("RESET ROLE");
  });
  it("delta rejects an incorrect base identity or a concurrent source change before leaving registrations", async () => {
    const args=await deltaArguments();
    for(const altered of [[...args.slice(0,2),"0".repeat(64),...args.slice(3)],[args[0],999,...args.slice(2)],[String(Number(args[0])+1),...args.slice(1)]])
      await rejected(deltaSql,altered,"catalog_staging_base_invalid");
    await pg.exec("UPDATE postspark.catalog_state SET source_revision=source_revision+1");
    await rejected(deltaSql,args,"catalog_publication_conflict");
    expect(await value("SELECT count(*)::int AS value FROM postspark.design_components WHERE id=$1",[staged.id])).toBe(0);
  });
  it("delta retains full canonical/index/asset validation and rolls back invalid registrations", async () => {
    const args=await deltaArguments();
    const row=JSON.parse(args[3])[0];
    const duplicate=[...args]; duplicate[3]=JSON.stringify([row,row]);
    await rejected(deltaSql,duplicate,"catalog_snapshot_mismatch");
    const changed=[...args]; changed[3]=JSON.stringify([{...row,definition:{...row.definition,label:"tampered"}}]);
    await rejected(deltaSql,changed,"catalog_snapshot_mismatch");
    const omitted=[...args]; omitted[3]="[]";
    await rejected(deltaSql,omitted,"catalog_snapshot_mismatch");
    const invalidIndex=[...args]; invalidIndex[7]="{}";
    await rejected(deltaSql,invalidIndex,"catalog_staged_index_invalid");
    const invalidAsset=[...args]; const parts=JSON.parse(invalidAsset[6]); parts[0].definition.assets[0].bytes++;
    invalidAsset[6]=JSON.stringify(parts);
    await rejected(deltaSql,invalidAsset,"catalog_snapshot_assets_mismatch");
    expect(await value("SELECT count(*)::int AS value FROM postspark.design_components WHERE id=$1",[staged.id])).toBe(0);
    expect(await value("SELECT count(*)::int AS value FROM postspark.design_component_evidence WHERE component_id=$1",[staged.id])).toBe(0);
  });
  it("limits timeout exemptions to the two administrative stage RPCs and restores caller settings", async () => {
    const timeout = await value("SELECT current_setting('statement_timeout') AS value");
    expect(await value("SELECT proconfig AS value FROM pg_proc WHERE oid='postspark.catalog_stage(bigint,jsonb,jsonb,text,jsonb,jsonb)'::regprocedure")).toContain("statement_timeout=60s");
    expect(await value("SELECT proconfig AS value FROM pg_proc WHERE oid='postspark.catalog_staged_snapshot()'::regprocedure")).toContain("statement_timeout=60s");
    expect(await value("SELECT proconfig AS value FROM pg_proc WHERE oid='postspark.catalog_activate(bigint)'::regprocedure")).not.toContain("statement_timeout=60s");
    await stage();
    expect(await value("SELECT current_setting('statement_timeout') AS value")).toBe(timeout);
    expect(await value("SELECT has_function_privilege('service_role','postspark.catalog_stage(bigint,jsonb,jsonb,text,jsonb,jsonb)','EXECUTE') AS value")).toBe(true);
    expect(await value("SELECT has_function_privilege('authenticated','postspark.catalog_stage(bigint,jsonb,jsonb,text,jsonb,jsonb)','EXECUTE') AS value")).toBe(false);
    expect(await value("SELECT has_function_privilege('service_role','postspark.catalog_staged_snapshot()','EXECUTE') AS value")).toBe(true);
    expect(await value("SELECT has_function_privilege('authenticated','postspark.catalog_staged_snapshot()','EXECUTE') AS value")).toBe(false);
  });
  it("keeps the active manifest and old live search cards unchanged and admissible", async () => {
    const before = await value("SELECT postspark.catalog_manifest() AS value");
    const revision = await stage();
    expect(revision).not.toBe(activeRevision);
    expect(await value("SELECT postspark.catalog_manifest() AS value")).toEqual(before);
    expect(await value("SELECT count(*)::int AS value FROM postspark.design_component_search_documents")).toBe(1);
    expect(await value("SELECT count(*)::int AS value FROM postspark.catalog_revision_definitions WHERE revision=$1", [revision])).toBe(2);
    expect((await admit(activeRevision,"external",randomUUID(),releaseOther)).catalog_revision).toBe(Number(activeRevision));
  });
  it("pins a staged revision to one local executor and never makes it external work", async () => {
    const revision = await stage(), key = randomUUID();
    const first = await admit(revision,"staged",key), retry = await admit(activeRevision,"staged",key);
    expect(first.execution_mode).toBe("local-demand"); expect(first.catalog_revision).toBe(Number(revision));
    expect(retry.id).toBe(first.id); expect(retry.catalog_revision).toBe(first.catalog_revision); expect(retry.created).toBe(false);
    expect(await value("SELECT postspark.generation_v5_claim('external-worker') AS value")).toBeNull();
    expect(await value("SELECT postspark.generation_claim_request($1,'other-machine','worker') AS value", [first.id])).toBeNull();
    expect(await value("SELECT postspark.generation_claim_request($1,'local-test','worker') AS value", [first.id])).toHaveProperty("leaseToken");
    await rejected("SELECT postspark.generation_admit_external($1::uuid,$2::uuid,'external-staged',$3,$4::jsonb,false,now()+interval '5 minutes',$5::bigint)", [randomUUID(),releaseOther,"b".repeat(64),JSON.stringify({inputType:"text",content:"Post",platform:"instagram",postMode:"static",creationMode:"ideation"}),revision], "catalog_revision_changed");
  });
  it("activates explicitly by indexing and reusing the exact immutable revision", async () => {
    const revision = await stage();
    const original = await value("SELECT snapshot AS value FROM postspark.catalog_revisions WHERE revision=$1", [revision]);
    expect(await value("SELECT postspark.catalog_activate($1)::text AS value", [revision])).toBe(revision);
    expect(await value("SELECT count(*)::int AS value FROM postspark.design_component_search_documents")).toBe(2);
    expect(await value("SELECT snapshot AS value FROM postspark.catalog_revisions WHERE revision=$1", [revision])).toEqual(original);
    expect(await value("SELECT postspark.catalog_manifest() AS value")).toMatchObject({revision,dirty:false});
    expect(await value("SELECT postspark.catalog_activate($1)::text AS value", [revision])).toBe(revision);
    expect(await value("SELECT count(*)::int AS value FROM postspark.catalog_revisions")).toBe(2);
    await rejected("UPDATE postspark.catalog_revisions SET summary='{}' WHERE revision=$1",[revision],"catalog_revision_immutable");
  });
  it("rejects a stale source read and rolls back registration on invalid assets/index evidence", async () => {
    const args = await stageArguments();
    await pg.exec("UPDATE postspark.catalog_state SET source_revision=source_revision+1");
    await rejected(stageSql,args,"catalog_publication_conflict");
    expect(await value("SELECT count(*)::int AS value FROM postspark.design_components WHERE id=$1",[staged.id])).toBe(0);
    const broken = await stageArguments(); broken[5]="{}";
    await rejected(stageSql,broken,"catalog_staged_index_invalid");
    expect(await value("SELECT count(*)::int AS value FROM postspark.design_components WHERE id=$1",[staged.id])).toBe(0);
    const assetBroken = await stageArguments(); const parts=JSON.parse(assetBroken[4]); parts[0].definition.assets[0].bytes++;
    assetBroken[4]=JSON.stringify(parts);
    await rejected(stageSql,assetBroken,"catalog_snapshot_assets_mismatch");
  });
  it("rejects incomplete, duplicate, extra, or mutated canonical rows without persisting drafts", async () => {
    const mutations = [
      (rows: any[]) => rows.slice(1),
      (rows: any[]) => [rows[0], rows[0]],
      (rows: any[]) => [...rows, rows[0]],
      (rows: any[]) => rows.map((r, i) => i ? r : {...r, extra: true}),
      (rows: any[]) => rows.map((r, i) => i ? r : {...r, definition_hash: "0".repeat(64)}),
      (rows: any[]) => rows.map((r, i) => i ? r : {...r, definition: {...r.definition, label: "changed"}}),
      (rows: any[]) => rows.map((r, i) => i ? r : {...r, assets: []}),
      (rows: any[]) => rows.map((r, i) => i ? r : {...r, design_components: {...r.design_components, status: "archived"}}),
    ];
    const before = await value("SELECT postspark.catalog_manifest() AS value");
    for (const mutate of mutations) {
      const args = await stageArguments();
      args[1] = JSON.stringify(mutate(JSON.parse(args[1])));
      await rejected(stageSql, args, "catalog_snapshot_mismatch");
      expect(await value("SELECT postspark.catalog_manifest() AS value")).toEqual(before);
      expect(await value("SELECT count(*)::int AS value FROM postspark.design_components WHERE id=$1", [staged.id])).toBe(0);
      expect(await value("SELECT count(*)::int AS value FROM postspark.design_component_evidence WHERE component_id=$1", [staged.id])).toBe(0);
    }
  });
  it("preserves live card equality and definition identity on an idempotent stage", async () => {
    const args = await stageArguments();
    const rows = JSON.parse(args[1]);
    const original = rows.find((r: any) => r.component_id === base.id);
    original.card.label = "tampered";
    args[1] = JSON.stringify(rows);
    await rejected(stageSql, args, "catalog_snapshot_mismatch");
    const firstArgs = await stageArguments();
    const revision = await value<string>(stageSql, firstArgs);
    const current = await value("SELECT postspark.catalog_staged_snapshot() AS value");
    const repeated = [...firstArgs];
    repeated[0] = current.sourceRevision;
    expect(await value<string>(stageSql, repeated)).toBe(revision);
    expect(await value("SELECT count(*)::int AS value FROM postspark.catalog_revisions")).toBe(2);
    expect(await value("SELECT count(*)::int AS value FROM postspark.design_component_evidence WHERE component_id=$1", [staged.id])).toBe(1);
    const conflict = [...repeated];
    const components = JSON.parse(conflict[4]);
    components[0].definition.label = "changed after staging";
    conflict[4] = JSON.stringify(components);
    await rejected(stageSql, conflict, "catalog_staged_component_conflict");
  });
  it("does not silently activate a stage or overwrite changes made after staging", async () => {
    const revision = await stage();
    const current = await value("SELECT postspark.catalog_staged_snapshot() AS value");
    await rejected("SELECT postspark.catalog_publish($1,$2::jsonb,'{}',$3)",[current.sourceRevision,JSON.stringify(current.rows),"d".repeat(64)],"catalog_staged_activation_required");
    await pg.query("UPDATE postspark.design_components SET status='archived' WHERE id=$1",[base.id]);
    await rejected("SELECT postspark.catalog_activate($1)",[revision],"catalog_publication_conflict");
    expect(await value("SELECT active_revision::text AS value FROM postspark.catalog_state")).toBe(activeRevision);
  });
  it("keeps publication/admission RPCs service-only and grants assets only to the admitted owner", async () => {
    const revision = await stage();
    await pg.exec("SET ROLE authenticated");
    await rejected("SELECT postspark.catalog_activate($1)",[revision],/permission denied/);
    await pg.exec("RESET ROLE");
    const request = await admit(revision), claim = await value("SELECT postspark.generation_claim_request($1,'local-test','worker') AS value",[request.id]);
    const family=staged.completeDesign!.family;
    const delivery={contractVersion:1,proposalId:request.proposals[0].proposalId,runId:request.id,slot:0,revision:1,status:"ready",findings:[],diagnostics:[],bundle:{runId:request.id,traceId:request.id,slot:0,family,slides:[{id:"slide",role:"static",composition:{origin:{componentAssembly:{completeDesign:{family,baselineVerified:true},componentIds:[staged.id],componentHashes:[staged.hash]}},assets:staged.assets}}]}};
    await value("SELECT postspark.generation_v5_lease_update($1,$2,'commit',$3::jsonb) AS value",[request.id,claim.leaseToken,JSON.stringify({delivery,projection:{id:"saved"}})]);
    expect(await value("SELECT count(*)::int AS value FROM postspark.design_component_asset_grants WHERE user_uuid=$1 AND component_id=$2",[releaseOwner,staged.id])).toBe(staged.assets.length);
    expect(await value("SELECT count(*)::int AS value FROM postspark.design_component_asset_grants WHERE user_uuid=$1",[releaseOther])).toBe(0);
    expect(await value("SELECT output_snapshot->0->>'id' AS value FROM postspark.generation_runs WHERE id=$1 AND user_uuid=$2",[request.id,releaseOwner])).toBe("saved");
  });
});
