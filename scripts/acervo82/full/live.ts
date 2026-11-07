/** All inference goes through the guarded local app and the configured campaign ledger. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {orchestratedGenerationInputSchema} from '../../../shared/generationRequest';
import {openLocalApi} from './localApi';
import {getDb} from '../../../server/db';
import {inspectGenerationEvidence} from '../../../server/generationEvidence';
import {readSharedBudget} from '../../../server/benchmarks/generationMatrix/sharedBudget';
import {writeJson} from '../../../server/benchmarks/generationMatrix/journal';
import {promptTrial} from './promptTrial.mjs';

const json=async(file:string)=>JSON.parse(await fs.readFile(file,'utf8'));
const stage=await json('artifacts/acervo82/full/staged.json');
const config=await json(process.env.POSTSPARK_ACERVO82_PILOT_CONFIG??'.acervo82-local/full-catalog-01.json');
const trial = config.authorization === promptTrial.authorization;
assert.equal(config.authorization,trial?promptTrial.authorization:'user-authorized-acervo82-full');assert.equal(stage.sources,82);assert.equal(stage.revision,config.revision);assert.equal(stage.identity,config.identity);
const cases=await json(trial ? promptTrial.casesFile : 'designs/acervo82/authored/live-cases.json');
assert.equal(cases.length,trial?promptTrial.maxAdmissions:12);
const requested=process.argv.slice(2),targets=requested.length?requested.map(id=>{const c=cases.find((c:any)=>c.id===id);assert(c,`Unknown case: ${id}`);return c;}):cases;
const directory=path.dirname(config.budgetFile);
const summaryPath=path.join(directory,'results.json');
const result=await json(summaryPath).catch(e=>{if(e.code==='ENOENT')return {revision:stage.revision,session:config.session,cases:{}};throw e;});
assert.equal(result.revision,stage.revision);
const local=await openLocalApi(),{api}=local;assert.equal(local.actor,config.actor);
const caps=await api.generation.capabilities.query();assert(caps.enabled&&'catalogRevision'in caps&&caps.catalogRevision===stage.revision,JSON.stringify(caps));
const all=await api.catalog.acervo82Directory.query();assert.equal(all?.families.length,82);
const db=getDb();
const limit=async()=>{const budget=await readSharedBudget(config.budgetFile) as any,usd=budget.calls.reduce((total:number,call:any)=>total+(call.actualUsd??call.reservedUsd),0);return {admissions:budget.pilotRequests?.length??0,calls:budget.calls.length,usd,unknown:budget.calls.filter((call:any)=>call.actualUsd===undefined).length,stop:budget.interruption??(budget.calls.length>=config.maxCalls?'calls':usd>=config.maxUsd?'usd':(budget.pilotRequests?.length??0)>=config.maxAdmissions?'admissions':null)};};
try {
 for(const c of targets){
   const caseDir=path.join(directory,c.id);await fs.mkdir(caseDir,{recursive:true,mode:0o700});
   const receiptFile=path.join(caseDir,'admission.json');
   let receipt=await json(receiptFile).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
   if(result.cases[c.id]?.terminal)continue;
   if(!receipt?.requestId&&(await limit()).stop)break;
   if(!receipt){receipt={case:c.id,idempotencyKey:trial?`acervo82-${promptTrial.session}-${c.id}`:`acervo82-full-${c.id}-${randomUUID()}`,catalogRevision:stage.revision};await fs.writeFile(receiptFile,JSON.stringify(receipt,null,2),{flag:'wx',mode:0o600});}
   try {
     if(!receipt.requestId){
       let value:string|undefined;
       if(c.upload){
         // Delivery stores the generated image in owner storage and normalizes
         // it to a user-media URL. Provenance comes from the admitted photo-only
         // test and its durable snapshot, not the storage kind after delivery.
         const synthetic=await json(path.join(directory,'foto-gerada','snapshot.json'));
         assert.equal(synthetic.input.content,cases.find((entry:any)=>entry.id==='foto-gerada').content);
         assert.equal(synthetic.input.inputType,'text');
         const photo=synthetic.snapshot.proposals.filter((proposal:any)=>proposal.status==='ready')
           .flatMap((proposal:any)=>proposal.bundle.slides.flatMap((slide:any)=>Object.values(slide.composition.media)))
           .find((item:any)=>item.url.startsWith(`/api/post-media/${local.actor}/`));
         assert(photo,'synthetic_generated_test_photo_unavailable');
         assert(photo.url.startsWith(`/api/post-media/${local.actor}/`));
         // Re-upload the synthetic test photograph through the private media API.
         const file=await fetch(local.app+photo.url,{headers:{Cookie:local.cookie}});assert(file.ok);
         const image=Buffer.from(await file.arrayBuffer());
         value=(await api.post.saveMediaAsset.mutate({imageData:`data:${file.headers.get('content-type')};base64,${image.toString('base64')}`})).url;
       }
       const input=orchestratedGenerationInputSchema.parse({ownerId:local.actor,inputType:value&&!c.sourceAsText?'image':'text',sources:value?[{id:'synthetic-test-photo',kind:'image',purpose:'content',value}]:undefined,content:c.content,platform:'instagram',postMode:c.postMode,slideCount:c.slides>1?c.slides:undefined,aspectRatio:'4:5',creationMode:'ideation',generationModel:'gemini',includeDraftDesigns:true,formatIntentConfirmed:true,idempotencyKey:receipt.idempotencyKey});
       const admitted=await api.generation.start.mutate(input);receipt={...receipt,requestId:admitted.snapshot.requestId,created:admitted.created};await writeJson(receiptFile,receipt);
     }
     console.log(JSON.stringify({case:c.id,requestId:receipt.requestId,stage:'admitted'}));
     const requestId=receipt.requestId;
     let response=await api.generation.get.query({requestId});
     for(let i=0;i<120&&response.snapshot.overallStatus==='running';i++){
       await new Promise(resolve=>setTimeout(resolve,2500));
       response=await api.generation.get.query({requestId});
     }
     await writeJson(path.join(caseDir,'snapshot.json'),response);
     const [request,operations]=await Promise.all([
       db.from('generation_v5_requests').select('id,status,owner_id,input,prepared,proposals,experimental,generation_config,billing_mode,billing_ledger,billing_reservation_id,billing_reserved,billing_preparation,billing_per_proposal,billing_debited,billing_settled_at,billing_error,created_at,updated_at').eq('id',requestId).eq('owner_id',local.actor).single(),
       db.from('generation_v5_operations').select('operation_key,state,result,expectation').eq('request_id',requestId),
     ]);
     if(request.error||operations.error)throw Error('live_evidence_unavailable');
     await writeJson(path.join(caseDir,'operations.json'),operations.data);
     const audit=inspectGenerationEvidence({request:request.data,operations:operations.data??[]});
     await writeJson(path.join(caseDir,'evidence.json'),audit);
     const ready=response.snapshot.proposals.filter(p=>p.status==='ready');
     const generated=ready.flatMap(p=>p.bundle.slides.flatMap(s=>Object.values(s.composition.media))).find(m=>m.url.startsWith(`/api/post-media/${local.actor}/`));
     if(c.id==='foto-gerada'&&generated)await writeJson(path.join(directory,'generated-test-media.json'),{url:generated.url,requestId});
     const election=request.data?.prepared?.planning?.familyElection;
     const evaluated=new Set<string>(election?.candidates?.filter((f:any)=>election.ranking.some((r:any)=>r.id===f.id)).map((f:any)=>f.family)??[]);
     const entry={case:c.id,requestId,status:response.snapshot.overallStatus,terminal:!['running','awaiting_reconciliation'].includes(response.snapshot.overallStatus),
       proposals:response.snapshot.proposals.map(p=>p.status==='ready'?{slot:p.slot,status:p.status,family:p.bundle.family,name:p.bundle.name,pages:p.bundle.slides.length,photos:p.bundle.slides.reduce((n,s)=>n+Object.keys(s.composition.media).length,0)}:{slot:p.slot,status:p.status,reason:p.errorReason}),
       scored:evaluated.size,notAssessed:all!.families.map(f=>f.family).filter(f=>!evaluated.has(f)),transport:election?.retrieval?.transport,expanded:election?.retrieval?.expanded,
       audit:{passed:audit.passed,failed:audit.checks.filter(c=>!c.passed),election:audit.designElection.status},budget:await limit()};
     result.cases[c.id]=entry;await writeJson(summaryPath,result);
     console.log(JSON.stringify({...entry,notAssessed:entry.notAssessed.length}));
     if(entry.budget.stop)break;
     // Uncertain effects stay reserved. Later independent cases never retry them.
   }catch(e){
     const error=(e as Error).message;result.cases[c.id]={case:c.id,requestId:receipt.requestId??null,terminal:false,error,budget:await limit()};await writeJson(summaryPath,result);
     console.log(JSON.stringify(result.cases[c.id]));break;
   }
 }
 console.log(JSON.stringify({session:config.session,budget:await limit(),recorded:Object.keys(result.cases).length}));
} finally {await local.close();}
