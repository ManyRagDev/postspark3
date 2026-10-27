import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const original=readFileSync(new URL("../../drizzle/0025_component_arsenal.sql",import.meta.url),"utf8");
const migration=readFileSync(new URL("../../drizzle/0037_agent_component_review.sql",import.meta.url),"utf8");
const actor="00000000-0000-4000-8000-000000000001",id="00000000-0000-4000-8000-000000000002",hash="a".repeat(64);
let pg:PGlite;
beforeEach(async()=>{
 pg=new PGlite();
 await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA postspark; CREATE SCHEMA auth; GRANT USAGE ON SCHEMA postspark TO service_role,anon,authenticated;
 CREATE TABLE auth.users(id uuid PRIMARY KEY); INSERT INTO auth.users VALUES ('${actor}');
 CREATE TABLE postspark.design_catalog_assets(id text PRIMARY KEY,manifest jsonb NOT NULL);
 CREATE FUNCTION postspark.design_catalog_never_mutate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Evidence is immutable'; END $$;`);
 // The production pre-vector tables, guard and privileges are exercised unchanged.
 await pg.exec(original.slice(original.indexOf("CREATE TABLE postspark.design_components"),original.indexOf("DO $install$")));
 await pg.exec("CREATE TABLE postspark.design_component_search_documents(component_id uuid PRIMARY KEY REFERENCES postspark.design_components(id),definition_hash text NOT NULL);");
 await pg.exec(original.slice(original.indexOf("CREATE FUNCTION postspark.design_component_guard"),original.indexOf("-- Pin all slides")));
 await pg.exec(migration);
 await pg.query(`INSERT INTO postspark.design_components(id,definition_hash,definition,kind,source_key,roles,densities,aspect_ratios,actor_id) VALUES($1,$2,$3,'content','fixture',ARRAY['static'],ARRAY['balanced'],ARRAY['1:1'],$4)`,[id,hash,{schemaVersion:1,id,hash,assets:[]},actor]);
});
afterEach(async()=>{await pg.close();});
async function technical(index=true){
 await pg.query(`INSERT INTO postspark.design_component_evidence(component_id,definition_hash,kind,decision,metrics,actor_id) VALUES($1,$2,'technical','verified','{}',$3)`,[id,hash,actor]);
 if(index)await pg.query("INSERT INTO postspark.design_component_search_documents VALUES($1,$2)",[id,hash]);
}
async function review(kind="agent_visual",decision="approved",options:{hash?:string;png?:string|null;brief?:string|null;actor?:string;metrics?:unknown;time?:string}={}){
 await pg.query(`INSERT INTO postspark.design_component_evidence(component_id,definition_hash,kind,decision,metrics,png_hash,briefing_hash,actor_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[id,options.hash??hash,kind,decision,options.metrics??{source:"agent_visual_review",reviewer:"Codex gpt-6.1-sol"},options.png===undefined?"b".repeat(64):options.png,options.brief===undefined?"c".repeat(64):options.brief,options.actor??actor,options.time??"2026-10-09T12:00:00Z"]);
}
async function publish(){await pg.query("UPDATE postspark.design_components SET status='approved' WHERE id=$1",[id]);}

describe("0037 honest agent component publication",()=>{
 it("accepts an attributed agent review of the exact PNG/brief/document with technical index",async()=>{
  await technical();await review();await pg.exec("SET ROLE service_role");await publish();
  const r=await pg.query<{status:string}>("SELECT status FROM postspark.design_components WHERE id=$1",[id]);expect(r.rows[0].status).toBe("approved");
 });
 it("keeps existing human approval valid",async()=>{await technical();await review("human");await publish();});
 it("does not infer approval from technical evidence or index alone",async()=>{await technical();await expect(publish()).rejects.toThrow("Visual component approval required");});
 it("requires technical verification and matching index for agent approval",async()=>{await review();await expect(publish()).rejects.toThrow("Verified component index required");await technical(false);await expect(publish()).rejects.toThrow("Verified component index required");});
 it("requires hashes, a real actor and an identified agent",async()=>{
  await expect(review("agent_visual","approved",{hash:"d".repeat(64)})).rejects.toThrow("match current component definition");
  await expect(review("agent_visual","approved",{png:null})).rejects.toThrow();
  await expect(review("agent_visual","approved",{brief:null})).rejects.toThrow();
  await expect(review("agent_visual","approved",{actor:"00000000-0000-4000-8000-000000000099"})).rejects.toThrow();
  await expect(review("agent_visual","approved",{metrics:{source:"admin_review",reviewer:"Human"}})).rejects.toThrow("Agent reviewer attribution required");
  await expect(review("agent_visual","approved",{metrics:{source:"agent_visual_review",reviewer:" "}})).rejects.toThrow("Agent reviewer attribution required");
 });
 it("uses the latest agent decision when there is no human review",async()=>{await technical();await review();await review("agent_visual","rejected",{time:"2026-10-09T13:00:00Z"});await expect(publish()).rejects.toThrow("Visual component approval required");});
 it("never lets a newer agent approval override the latest human rejection",async()=>{
  await technical();await review("human","approved",{time:"2026-10-09T10:00:00Z"});await review("human","rejected",{time:"2026-10-09T11:00:00Z"});await review();await expect(publish()).rejects.toThrow("Visual component approval required");
  await review("human","approved",{time:"2026-10-09T13:00:00Z"});await publish();
 });
 it("preserves the latest human approval even if an agent later rejects",async()=>{await technical();await review("human","approved",{time:"2026-10-09T11:00:00Z"});await review("agent_visual","rejected");await publish();});
 it("does not let a human approval of a different hash approve this document",async()=>{await technical();await review("human","approved",{hash:"d".repeat(64)});await expect(publish()).rejects.toThrow("Visual component approval required");});
 it("preserves asset verification and document/evidence immutability",async()=>{
  const other="00000000-0000-4000-8000-000000000003",asset={id:"asset-a",kind:"catalog"};
  await pg.query(`INSERT INTO postspark.design_components(id,definition_hash,definition,kind,source_key,roles,densities,aspect_ratios,actor_id) VALUES($1,$2,$3,'content','fixture-assets','{}','{}','{}',$4)`,[other,hash,{schemaVersion:1,id:other,hash,assets:[asset]},actor]);
  await pg.query("INSERT INTO postspark.design_component_search_documents VALUES($1,$2)",[other,hash]);
  await pg.query(`INSERT INTO postspark.design_component_evidence(component_id,definition_hash,kind,decision,metrics,actor_id) VALUES($1,$2,'technical','verified','{}',$3)`,[other,hash,actor]);
  await pg.query(`INSERT INTO postspark.design_component_evidence(component_id,definition_hash,kind,decision,metrics,actor_id,png_hash,briefing_hash) VALUES($1,$2,'agent_visual','approved',$3,$4,$2,$2)`,[other,hash,{source:"agent_visual_review",reviewer:"Codex gpt-6.1-sol"},actor]);
  await expect(pg.query("UPDATE postspark.design_components SET status='approved' WHERE id=$1",[other])).rejects.toThrow("Verified component asset required");
  await pg.query("INSERT INTO postspark.design_catalog_assets VALUES($1,$2)",[asset.id,asset]);await pg.query("INSERT INTO postspark.design_component_assets VALUES($1,$2)",[other,asset.id]);
  await pg.query("UPDATE postspark.design_components SET status='approved' WHERE id=$1",[other]);
  await expect(pg.query("UPDATE postspark.design_components SET definition_hash=$1 WHERE id=$2",["d".repeat(64),other])).rejects.toThrow("immutable");
  await expect(pg.exec("DELETE FROM postspark.design_component_evidence")).rejects.toThrow("immutable");
 });
 it("keeps anonymous and authenticated callers outside catalogue writes",async()=>{
  for(const role of ["anon","authenticated"]){
   await pg.exec(`SET ROLE ${role}`);await expect(review()).rejects.toThrow("permission denied");await expect(publish()).rejects.toThrow("permission denied");await pg.exec("RESET ROLE");
  }
 });
});
