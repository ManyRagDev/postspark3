import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

// Opt-in actual pgvector validation. Every schema/row change is rolled back and
// non-loopback targets are rejected, so this cannot touch a hosted database.
const connectionString=process.env.SEMANTIC_TEST_DATABASE_URL;
const suite=connectionString ? describe : describe.skip;
const migration=readFileSync(new URL("../../drizzle/0058_semantic_design_retrieval.sql",import.meta.url),"utf8");
const hash="a".repeat(64),fingerprint="b".repeat(64),sourceHash="c".repeat(64),textHash="d".repeat(64);
const source1="00000000-0000-4000-8000-000000000001",source2="00000000-0000-4000-8000-000000000002";
const vector=(angle=0)=>JSON.stringify(Array.from({length:384},(_,i)=>i===0?Math.cos(angle):i===1?Math.sin(angle):0));
let db:Client,schema:string;
async function denied(sql:string,values:unknown[]=[]) {
  await db.query("SAVEPOINT expected_failure");
  let error:unknown;
  try {await db.query(sql,values);}catch(caught){error=caught;}
  await db.query("ROLLBACK TO SAVEPOINT expected_failure");
  expect(error).toBeTruthy();return error as Error;
}
suite("0058 actual pgvector, read permissions and immutable semantic rows",()=>{
  beforeEach(async()=>{
    if(!["localhost","127.0.0.1","[::1]"].includes(new URL(connectionString!).hostname))throw new Error("semantic_test_requires_loopback");
    db=new Client({connectionString});await db.connect();await db.query("BEGIN");
    schema=`semantic_test_${randomUUID().replaceAll("-","")}`;
    await db.query(`CREATE SCHEMA ${schema}; GRANT USAGE ON SCHEMA ${schema} TO anon,authenticated,service_role;
      CREATE TABLE ${schema}.catalog_revisions(revision bigint PRIMARY KEY);
      CREATE TABLE ${schema}.catalog_revision_definitions(revision bigint,component_id uuid,definition_hash text);
      INSERT INTO ${schema}.catalog_revisions VALUES(7);
      INSERT INTO ${schema}.catalog_revision_definitions VALUES(7,'${source1}','${sourceHash}'),(7,'${source2}','${sourceHash}');`);
    await db.query(migration.replaceAll("postspark.",`${schema}.`).replace(/^BEGIN;$/m,"").replace(/^COMMIT;$/m,""));
    await db.query(`INSERT INTO ${schema}.design_semantic_indexes(index_hash,catalog_revision,profile_version,model_fingerprint,model_metadata,calibration_hash,calibration_version,calibration_metadata,document_count)
      VALUES($1,7,'compact-design-en-v1',$2,$3,$1,'compact-prior-80-v1',$4,2)`,[hash,fingerprint,
      {modelId:"Xenova/multilingual-e5-small",revision:"761b726dd34fb83930e26aab4e9ac3899aa1fa78",dimensions:384,dtype:"q8",fingerprint},
      {count:80,grandMean:.5,hash,version:"compact-prior-80-v1"}]);
    for(const [id,angle,mean] of [[source1,0,.9],[source2,.2,.5]] as const)await db.query(`INSERT INTO ${schema}.design_semantic_documents
      (index_hash,source_id,source_hash,source_text_hash,profile_hash,row_hash,profile_text,embedding,mean_affinity,generic_excess)
      VALUES($1,$2,$3,$4,$1,$1,'A compact visual invitation',$5,$6,$7)`,[hash,id,sourceHash,textHash,vector(angle),mean,Math.max(0,mean-.5)]);
  });
  afterEach(async()=>{if(db){await db.query("ROLLBACK");await db.end();}});
  const sources=()=>[{familyId:"f1",sourceId:source1,sourceHash,sourceTextHash:textHash},{familyId:"f2",sourceId:source2,sourceHash,sourceTextHash:textHash}];
  async function search(overrides:{fingerprint?:string;sources?:unknown;query?:string;alpha?:number;indexHash?:string}={}) {
    const r=await db.query(`SELECT ${schema}.design_semantic_search_v1(7,NULL,$1,'compact-design-en-v1',$2,$3,$4,$5) result`,
      [overrides.fingerprint??fingerprint,overrides.query??vector(),JSON.stringify(overrides.sources??sources()),overrides.alpha??.25,overrides.indexHash??null]);
    return r.rows[0].result;
  }
  it("calculates exact cosine, prior penalty and adjusted order using service read access",async()=>{
    await db.query("SET LOCAL ROLE service_role");const result=await search();
    expect(result.matchedSourceIds).toEqual([source1,source2]);
    expect(result.ranking.map((r:any)=>r.id)).toEqual(["f2","f1"]);
    expect(result.ranking[0].similarity).toBeCloseTo(Math.cos(.2),6);expect(result.ranking[0].penalty).toBe(0);
    expect(result.ranking[1]).toMatchObject({rawRank:1,adjustedRank:2,penalty:.1,adjusted:.9});
  });
  it("returns missing/stale/model mismatch safely, never mixing index versions",async()=>{
    expect(await search({fingerprint:"e".repeat(64)})).toBeNull();expect(await search({indexHash:"f".repeat(64)})).toBeNull();
    const rows=sources();rows[0].sourceHash="e".repeat(64);
    expect((await search({sources:rows})).matchedSourceIds).toEqual([source2]);
    rows[1].sourceTextHash="f".repeat(64);expect((await search({sources:rows})).ranking).toEqual([]);
  });
  it("gives one vote to a family regardless of repeated roots",async()=>{
    const rows=sources();rows[1].familyId="f1";
    const result=await search({sources:[...rows,rows[0]]});expect(result.ranking).toHaveLength(1);expect(result.ranking[0].sourceId).toBe(source2);
  });
  it("forbids anonymous/authenticated reads and RPC calls; runtime cannot write",async()=>{
    for(const role of ["anon","authenticated"]){
      await db.query(`SET LOCAL ROLE ${role}`);
      expect((await denied(`SELECT * FROM ${schema}.design_semantic_indexes`)).message).toContain("permission denied");
      expect((await denied(`SELECT ${schema}.design_semantic_search_v1(7,NULL,$1,'compact-design-en-v1',$2,'[]',.25,NULL)`,[fingerprint,vector()])).message).toContain("permission denied");
      await db.query("RESET ROLE");
    }
    await db.query("SET LOCAL ROLE service_role");
    expect((await denied(`DELETE FROM ${schema}.design_semantic_documents`)).message).toContain("permission denied");
    expect((await denied(`UPDATE ${schema}.design_semantic_indexes SET document_count=3`)).message).toContain("permission denied");
  });
  it("preserves immutable rows even for admin and rejects invalid vector/alpha requests",async()=>{
    expect((await denied(`UPDATE ${schema}.design_semantic_documents SET profile_text='Changed'`)).message).toContain("immutable");
    expect((await denied(`DELETE FROM ${schema}.design_semantic_indexes`)).message).toContain("immutable");
    expect((await denied(`SELECT ${schema}.design_semantic_search_v1(7,NULL,$1,'compact-design-en-v1','[1,0]','[]',.25,NULL)`,[fingerprint])).message).toContain("query_invalid");
    expect((await denied(`SELECT ${schema}.design_semantic_search_v1(7,NULL,$1,'compact-design-en-v1',$2,'[]',.5,NULL)`,[fingerprint,vector()])).message).toContain("query_invalid");
  });
});
