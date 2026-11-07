import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { generationReleasePostgresFixture, releaseOwner, releaseOther } from "./generationReleasePostgres.fixture";
import { knownProviderRejectionFromResponse } from "../../_core/llm";

let pg: PGlite;
const model="anthropic/claude-haiku-5.5";
const body={error:{code:400,metadata:{raw:JSON.stringify({type:"error",error:{type:"invalid_request_error",message:"Grammar too large"},request_id:"req_known"})}}};
const receipt=knownProviderRejectionFromResponse({provider:"openrouter",model,httpStatus:400,payload:{model,messages:[]},responseBody:JSON.stringify(body)})!.receipt.__providerRejection;
async function seed(state="uncertain") {
  const id=randomUUID(), key=`p-${id}-0:copy`;
  const proof={operationKey:key,provider:"openrouter",effectiveModel:model,error:`openrouter API failed: 400 Bad Request - ${JSON.stringify(body)}`,costSource:"unknown",estimatedCostUsd:0,promptHash:"a".repeat(64),messages:[]};
  await pg.query("INSERT INTO postspark.generation_runs(id,user_uuid,status,input_type,input_content,platform,post_mode,creation_mode,requested_model,prompt_snapshot) VALUES($1,$2,'partial','text','Pedido','instagram','carousel','execution',$3,$4::jsonb)",[id,releaseOwner,model,JSON.stringify({calls:[proof]})]);
  await pg.query("INSERT INTO postspark.generation_v5_requests(id,owner_id,idempotency_key,input_hash,input,status,experimental,deadline_at,proposals,billing_settled_at,billing_debited,billing_mode) VALUES($1::uuid,$2::uuid,$1::text,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','{}','partial',false,now()-interval '1 hour',$3::jsonb,now()-interval '30 minutes',2,'unlimited')",[id,releaseOwner,JSON.stringify([{slot:0,status:"failed"},{slot:1,status:"ready",bundle:{hash:"ready1"}},{slot:2,status:"ready",bundle:{hash:"ready2"}}])]);
  await pg.query("INSERT INTO postspark.generation_v5_operations(request_id,operation_key,state) VALUES($1,$2,$3)",[id,key,state]);
  return {id,key,proof};
}
const recover=async(id:string,key:string,value:unknown=receipt,owner=releaseOwner)=>
  (await pg.query<{value:any}>("SELECT postspark.generation_reconcile_provider_rejection($1,$2,$3,$4::jsonb) AS value",[id,owner,key,JSON.stringify(value)])).rows[0].value;
const rows=async()=>({requests:(await pg.query("SELECT * FROM postspark.generation_v5_requests")).rows,runs:(await pg.query("SELECT * FROM postspark.generation_runs")).rows,profiles:(await pg.query("SELECT * FROM postspark.profiles ORDER BY id")).rows,transactions:(await pg.query("SELECT * FROM postspark.spark_transactions")).rows});
beforeAll(async()=>{
  pg=await generationReleasePostgresFixture();
  await pg.exec("ALTER TABLE postspark.generation_runs ADD COLUMN prompt_snapshot jsonb");
  await pg.exec(readFileSync(new URL("../../../drizzle/0059_generation_provider_rejection.sql",import.meta.url),"utf8"));
},30000);
afterAll(async()=>{await pg?.close();});
beforeEach(async()=>{await pg.exec("DELETE FROM postspark.generation_v5_requests; DELETE FROM postspark.generation_runs;");});

describe("terminal provider rejection reconciliation",()=>{
  it.each(["uncertain","started"])("completes only the %s operation and preserves ready siblings, terminal deadline and settlement",async state=>{
    const {id,key,proof}=await seed(state), before=await rows();
    await pg.exec("SET ROLE service_role");
    let result;
    try { result=await recover(id,key); } finally {await pg.exec("RESET ROLE");}
    expect(result.state).toBe("completed");
    expect(result.result).toEqual({__providerRejection:receipt,__generationTrace:{version:1,calls:[proof],events:[]}});
    expect(await rows()).toEqual(before);
    expect(await recover(id,key)).toEqual(result);
    await expect(recover(id,key,{...receipt,responseHash:"b".repeat(64)})).rejects.toThrow(/Immutable result/);
  });
  it("rejects wrong owners, active requests and any remaining lease",async()=>{
    const {id,key}=await seed();
    await expect(recover(id,key,receipt,releaseOther)).rejects.toThrow(/not terminal/);
    await pg.query("UPDATE postspark.generation_v5_requests SET status='queued' WHERE id=$1",[id]);
    await expect(recover(id,key)).rejects.toThrow(/not terminal/);
    await pg.query("UPDATE postspark.generation_v5_requests SET status='partial',lease_token=$2,lease_until=now()-interval '1 hour' WHERE id=$1",[id,randomUUID()]);
    await expect(recover(id,key)).rejects.toThrow(/not terminal/);
  });
  it.each(["timeout","wrong_request_id","model","duplicate","invalid_envelope","wrong_error_type","wrong_code"])("refuses caller claims without matching persisted evidence: %s",async fault=>{
    const {id,key,proof}=await seed();
    let value={...receipt};let calls:any[]=[proof];
    if(fault==="timeout")proof.error="LLM transport timeout after 60000ms";
    if(fault==="wrong_request_id")value.providerRequestId="req_other";
    if(fault==="model")value.model="other/model";
    if(fault==="duplicate")calls=[proof,{...proof}];
    if(fault==="invalid_envelope")proof.error="openrouter API failed: 400 Bad Request - truncated";
    if(fault==="wrong_error_type")proof.error=`openrouter API failed: 400 Bad Request - ${JSON.stringify({error:{code:400,metadata:{raw:JSON.stringify({type:"error",error:{type:"overloaded_error"},request_id:"req_known"})}}})}`;
    if(fault==="wrong_code")proof.error=`openrouter API failed: 400 Bad Request - ${JSON.stringify({...body,error:{...body.error,code:500}})}`;
    await pg.query("UPDATE postspark.generation_runs SET prompt_snapshot=$2::jsonb WHERE id=$1",[id,JSON.stringify({calls})]);
    await expect(recover(id,key,value)).rejects.toThrow();
    expect((await pg.query<{state:string}>("SELECT state FROM postspark.generation_v5_operations")).rows[0].state).toBe("uncertain");
  });
  it("validates strict receipt shape and allows neither anonymous nor authenticated callers",async()=>{
    const {id,key}=await seed();
    for(const value of [{...receipt,extra:true},{...receipt,httpStatus:"400"},{...receipt,costStatus:"free"},{...receipt,responseHash:"bad"},{...receipt,provider:"other"}]) await expect(recover(id,key,value)).rejects.toThrow(/Invalid provider rejection/);
    for(const role of ["anon","authenticated"]){
      await pg.exec(`SET ROLE ${role}`);
      try {await expect(recover(id,key)).rejects.toThrow(/permission denied/);} finally {await pg.exec("RESET ROLE");}
    }
  });
});
