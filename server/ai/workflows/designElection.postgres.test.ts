import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { generationPostgresFixture } from "./generationPostgres.fixture";
import { createGenerationStore, type RequestRecord } from "./generationStore";
import { durableOperations } from "./generationRuntime";
import { prepareOrchestratedGeneration } from "./generationPreparation";
import { retrieveCoveredCatalog } from "../../designCatalog/catalogCoverage";
import { electionCatalogFixture } from "../../designCatalog/designElection.fixture";
import { defaultStudioPreferences } from "@shared/studioPreferences";
import { orchestratedGenerationInputSchema } from "@shared/generationRequest";
import { inspectDesignElection } from "../../designElectionEvidence";
import { shortlistCompleteDesigns } from "../../designCatalog/designShortlist";
const state=vi.hoisted(()=>({pg:null as any}));
// PostgREST boundary controlled; tables, pagination and durable RPCs run in PostgreSQL.
vi.mock('../../db',()=>({getDb:()=>({from:(table:string)=>{
  const q:any={};let offset=0,limit=100;
  for(const method of ['select','eq','not','order'])q[method]=()=>q;
  q.range=(a:number,b:number)=>{offset=a;limit=b-a+1;return q;};
  q.abortSignal=async()=>({error:null,data:(await state.pg.query(table==='design_components'
    ? `select id,definition_hash,status,aspect_ratios,roles,definition->'source' as source,definition->'completeDesign' as design from postspark.design_components where kind='content' and definition->'completeDesign' is not null order by id limit $1 offset $2`
    : `select component_id,definition_hash,card from postspark.design_component_search_documents where card->>'kind'='content' and card->'completeDesign' is not null order by component_id limit $1 offset $2`,[limit,offset])).rows});
  return q;
}})}));
const owner='11111111-1111-4111-8111-111111111111';
const {definitions,inventory}=electionCatalogFixture(13);
let pg:PGlite;
async function service(sql:string,params:unknown[]=[]) {
  await pg.query('SET ROLE service_role');
  try{return (await pg.query(sql,params)).rows[0]?.value as any;}finally{await pg.query('RESET ROLE');}
}
const rpc=async(name:string,a:Record<string,unknown>={})=>{
  const params=name==='generation_v5_operation'?[a.p_id,a.p_lease_token,a.p_operation_key,a.p_action,a.p_result]:[a.p_id,a.p_lease_token,a.p_action,a.p_payload];
  const sql=name==='generation_v5_operation'?'select postspark.generation_v5_operation($1,$2,$3,$4,$5::jsonb) value':'select postspark.generation_v5_lease_update($1,$2,$3,$4::jsonb) value';
  try{return {data:await service(sql,params.map((v,i)=>i===params.length-1&&v!==null?JSON.stringify(v):v)),error:null};}
  catch(e){return {data:null,error:{message:(e as Error).message}};}
};
beforeAll(async()=>{
  pg=await generationPostgresFixture(owner);state.pg=pg;
  await pg.exec(`alter table postspark.design_components add column roles text[] not null default '{}',add column aspect_ratios text[] not null default '{}';
    create table postspark.design_component_search_documents(component_id uuid primary key references postspark.design_components(id),definition_hash text not null,card jsonb not null);`);
  for(const d of definitions){
    await pg.query('insert into postspark.design_components(id,definition_hash,definition,kind,status,actor_id,roles,aspect_ratios) values($1,$2,$3,\'content\',\'approved\',$4,$5,$6)',[d.id,d.hash,JSON.stringify(d),owner,d.roles,d.aspectRatios]);
    const indexed=inventory.indexed.find(r=>r.component_id===d.id)!;
    await pg.query('insert into postspark.design_component_search_documents values($1,$2,$3)',[d.id,d.hash,JSON.stringify(indexed.card)]);
  }
},30000);
afterAll(async()=>{await pg?.close();});
describe('design election on the existing durable PostgreSQL protocol',()=>{
  it('persists inventory, all scores and decisions, pins prepared, and replays without another selector',async()=>{
    const id='30000000-0000-4000-8000-000000000021';
    const input=orchestratedGenerationInputSchema.parse({ownerId:owner,idempotencyKey:id,inputType:'text',content:'Café fresco.',platform:'instagram',postMode:'static',aspectRatio:'4:5'});
    await service('select postspark.generation_v5_admit($1,$2,$3,$4,$5::jsonb,false,now()+interval \'10 minutes\') value',[id,owner,id,'a'.repeat(64),JSON.stringify(input)]);
    const claimed=await service("select postspark.generation_v5_claim('election-test') value");
    const record={id,ownerId:owner,deadlineAt:Date.now()+60000} as RequestRecord;
    const store=createGenerationStore({rpc});
    const operation=<T>(key:string,work:()=>Promise<T>)=>durableOperations(store,record,claimed.lease_token,new AbortController().signal,'prepare:',['context','catalog','preferences','recent_selections','definitions'].includes(key))(key,work);
    const generate=vi.fn(async(p:any)=>({choices:[{message:{content:JSON.stringify({version:3,options:JSON.parse(p.messages[1].content).catalog.slice(0,3).map((o:any,i:number)=>({offerId:o.offerId,reason:'Controlled selector.',editorialApproach:'Recorte '+i}))})}}]} as any));
    const deps={operation,retrieve:retrieveCoveredCatalog,loadContext:async()=>input.content,preferences:async()=>defaultStudioPreferences,
      hydrate:async(ids:string[])=>definitions.filter(d=>ids.includes(d.id)),
      shortlist:(p:any)=>shortlistCompleteDesigns(p,async r=>({id:'controlled-batch',model:r.model,answers:Object.fromEntries(Object.keys(r.questions).map(id=>[id,{type:'score' as const,score:3,confidence:0.9}])),usage:{input_tokens:0,output_tokens:0,cost:0}})),generate};
    const prepared=await prepareOrchestratedGeneration(input,owner,false,Date.now()+60000,deps);
    await store.savePrepared(id,claimed.lease_token,prepared);
    const operations=(await pg.query('select operation_key,state,result from postspark.generation_v5_operations where request_id=$1',[id])).rows as any[];
    const persisted=(await pg.query('select prepared,proposals from postspark.generation_v5_requests where id=$1',[id])).rows[0] as any;
    expect(inspectDesignElection(persisted,operations)).toMatchObject({complete:true,registered:13,evaluated:13,selectorOptions:12});
    expect(operations.filter(o=>o.operation_key.startsWith('prepare:election_')).map(o=>o.state)).toEqual(['completed','completed','completed']);
    expect(operations.some(o=>o.operation_key==='prepare:selection_input'&&o.state==='completed')).toBe(true);
    expect(await prepareOrchestratedGeneration(input,owner,false,Date.now()+60000,deps)).toEqual(prepared);
    expect(generate).toHaveBeenCalledTimes(1);
  });
  it('retains the existing uncertainty fence for a receipt interrupted before commit',async()=>{
    const request=(await pg.query("select id,lease_token from postspark.generation_v5_requests where status='running' limit 1")).rows[0] as any;
    const store=createGenerationStore({rpc});
    await store.beginOperation(request.id,request.lease_token,'prepare:election_interrupted');
    const work=vi.fn(async()=>({version:1}));
    const op=durableOperations(store,{id:request.id,deadlineAt:Date.now()+60000} as RequestRecord,request.lease_token,new AbortController().signal,'prepare:');
    await expect(op('election_interrupted',work)).rejects.toThrow('reconciliation_required');
    expect(work).not.toHaveBeenCalled();
  });
});
