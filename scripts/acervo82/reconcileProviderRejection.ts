/** Local-only historical repair. No provider request is made.
 * node --import tsx scripts/acervo82/reconcileProviderRejection.ts
 *   --request UUID --operation KEY --wire PATH [--apply]
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import pg from "pg";
import { readLocalEnvironment } from "./environment.mjs";
import { knownProviderRejectionFromResponse } from "../../server/_core/llm";

const root=fileURLToPath(new URL("../../",import.meta.url));
const args=process.argv.slice(2), values=new Map<string,string>();
let apply=false;
for(let i=0;i<args.length;i++) {
  const key=args[i];
  if(key==="--apply"&&!apply){apply=true;continue;}
  if(!["--request","--operation","--wire"].includes(key)||values.has(key)||!args[i+1]||args[i+1].startsWith("--")) throw new Error("invalid_reconciliation_arguments");
  values.set(key,args[++i]);
}
const requestId=values.get("--request"), operationKey=values.get("--operation"), wirePath=values.get("--wire");
if(!requestId||!operationKey||!wirePath||!/^[a-f0-9-]{36}$/i.test(requestId)) throw new Error("request_operation_wire_required");
const env=await readLocalEnvironment(root); // Strict loopback-only endpoints and development profile.
const account=JSON.parse(await readFile(path.join(root,".acervo82-local/test-account.json"),"utf8"));
if(account.supabaseUrl!==env.SUPABASE_URL) throw new Error("local_account_endpoint_mismatch");
const wire=JSON.parse(await readFile(path.resolve(root,wirePath),"utf8"));
if(wire.requestId!==requestId||![400,422].includes(wire.httpStatus)||typeof wire.request?.model!=="string") throw new Error("wire_identity_mismatch");
const rejection=knownProviderRejectionFromResponse({provider:"openrouter",model:wire.request.model,httpStatus:wire.httpStatus,payload:wire.request,responseBody:JSON.stringify(wire.response)});
if(!rejection) throw new Error("wire_is_not_a_known_rejection");
const db=new pg.Client({connectionString:env.DATABASE_URL,connectionTimeoutMillis:5000});
await db.connect();
try {
  await db.query("BEGIN");
  const before=await db.query("SELECT to_jsonb(r) AS request,to_jsonb(g) AS run FROM postspark.generation_v5_requests r JOIN postspark.generation_runs g ON g.id=r.id AND g.user_uuid=r.owner_id WHERE r.id=$1 AND r.owner_id=$2",[requestId,account.id]);
  if(before.rowCount!==1) throw new Error("local_request_owner_mismatch");
  const record=before.rows[0];
  if(!["completed","partial","failed","cancelled"].includes(record.request.status)||record.request.lease_token!==null||record.request.lease_until!==null) throw new Error("request_is_not_terminal_without_lease");
  const calls=record.run.prompt_snapshot?.calls?.filter((call:any)=>call.operationKey===operationKey);
  if(!Array.isArray(calls)||calls.length!==1) throw new Error("expected_one_persisted_operation_call");
  const call=calls[0];
  if(call.provider!=="openrouter"||call.effectiveModel!==wire.request.model||!new RegExp(`^openrouter API failed: ${wire.httpStatus}( [^-]*)? - `).test(call.error??"")) throw new Error("persisted_rejection_identity_mismatch");
  const envelope=JSON.parse(call.error.slice(call.error.indexOf(" - ")+3));
  if(!isDeepStrictEqual(envelope,wire.response)||!Array.isArray(wire.request.messages)||createHash("sha256").update(JSON.stringify(wire.request.messages)).digest("hex")!==call.promptHash) throw new Error("wire_does_not_match_persisted_trace");
  const op=(await db.query("SELECT state,result FROM postspark.generation_v5_operations WHERE request_id=$1 AND operation_key=$2",[requestId,operationKey])).rows[0];
  if(!op||!["uncertain","started","completed"].includes(op.state)) throw new Error("operation_not_reconcilable");
  if(op.state==="completed"&&!isDeepStrictEqual(op.result?.__providerRejection,rejection.receipt.__providerRejection)) throw new Error("immutable_result");
  if(apply) {
    await db.query("SELECT postspark.generation_reconcile_provider_rejection($1,$2,$3,$4::jsonb)",[requestId,account.id,operationKey,JSON.stringify(rejection.receipt.__providerRejection)]);
    const after=await db.query("SELECT to_jsonb(r) AS request,to_jsonb(g) AS run FROM postspark.generation_v5_requests r JOIN postspark.generation_runs g ON g.id=r.id AND g.user_uuid=r.owner_id WHERE r.id=$1 AND r.owner_id=$2",[requestId,account.id]);
    if(!isDeepStrictEqual(record,after.rows[0])) throw new Error("reconciliation_changed_request_or_run");
  }
  await db.query(apply?"COMMIT":"ROLLBACK");
  console.log(JSON.stringify({mode:apply?"applied":"dry-run",requestId,operationKey,previousState:op.state,...rejection.receipt,providerCalls:0,requestUnchanged:true,billingUnchanged:true}));
} catch(error) {await db.query("ROLLBACK").catch(()=>{});throw error;}
finally {await db.end();}
