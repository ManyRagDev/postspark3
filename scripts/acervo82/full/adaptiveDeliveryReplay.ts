/** Captured inputs + real fonts. Manual static alternatives are controls, not a new provider result. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { instantiateCompleteDesign, completeDesignFields } from '../../../shared/completeDesignGeneration';
import { resolveArsenalGeometry, arsenalTextLayoutBox, measureArsenalElement } from '../../../shared/arsenalGeometry';
import { partitionArsenalReadinessIssues } from '../../../shared/arsenalReadiness';
import { createComponentTextMeasurer } from '../../../server/ai/componentTextMeasurer';
import { applyTargetedCopyRepair, enrichTargetedCopyRepairTargets, targetedCopyRepairPrompt } from '../../../server/ai/workflows/compactProposalCopy';
import { INITIAL_POST } from '../../../client/src/pages/CanvasLab/components/types';
import { putArsenalComposition } from '../../../client/src/pages/CanvasLab/lib/arsenalComposition';
import { canvasModelToSavePayload, savedPostToCanvasModel, normalizeCanvasModel } from '../../../client/src/pages/CanvasLab/lib/saveAdapter';
import { renderReviewScenes, closeReviewRenderer } from '../../../server/ai/workflows/proposalRenderer';
import { inspectProposalScenes } from '../../../server/ai/workflows/proposalGraph';
import { ENV } from '../../../server/_core/env';

const base='artifacts/acervo82/full/sessions/automatic-focused-20261106';
const out='/tmp/postspark-adaptive-verification';
await fs.mkdir(out,{recursive:true});
const digests=new Map<string,string>();
const hash=(data:Buffer|string)=>createHash('sha256').update(data).digest('hex');
async function bytes(file:string){const data=await fs.readFile(file);digests.set(file,hash(data));return data;}
async function json(file:string){return JSON.parse((await bytes(file)).toString());}
const stage=await json('artifacts/acervo82/full/staged.json');
globalThis.fetch=async()=>{throw new Error('adaptive_replay_external_network_forbidden');};
const proof:any[]=[];
for(const spec of [{kind:'static',slot:2,requestId:'bce0f360-6a25-4f34-8884-11614f0bc7ce'},{kind:'carousel',slot:0,requestId:'f6001566-01d8-44c6-bc81-1e9b1c44dead'}]){
 const ops=await json(`${base}/${spec.kind}/operations.json`);
 const prefix=`p-${spec.requestId}-${spec.slot}`;
 const get=(key:string)=>{const op=ops.find((o:any)=>o.operation_key===key);assert(op,key);return op.result;};
 const recovery=get(`${prefix}:delivery_recovery:candidate`);
 const pool=get('prepare:definitions');
 const definitions=recovery.plan.pages.map((page:any)=>pool.find((d:any)=>d.id===page.componentId));
 const copy=JSON.parse(get(`${prefix}:copy`).choices[0].message.content);
 const allAssets:any[]=Array.from(new Map(definitions.flatMap((d:any)=>d.assets).map((a:any)=>[a.id,a])).values());
 const loadAsset=async(asset:any)=>{const data=await bytes(path.join(stage.build,'assets',asset.sha256));assert.equal(hash(data),asset.sha256);return data;};
 const measure=await createComponentTextMeasurer(allAssets,loadAsset);
 function inspect(value:any,adaptive:boolean){
  const scenes=definitions.map((definition:any,i:number)=>instantiateCompleteDesign({definition,...value.slides[i],runId:spec.requestId,slot:spec.slot,slide:i,planHash:'a'.repeat(64),experimental:true}));
  const inspected=inspectProposalScenes(scenes,definitions,measure,true,adaptive);
  return inspected.slides.map((s:any,i:number)=>({scene:s.composition,issues:inspected.findings.filter((f:any)=>f.target.startsWith(`slide-${i+1}:`)).map((f:any)=>`${f.rule}:${f.target}`)}));
 }

 const before=inspect(copy,false),adaptive=inspect(copy,true);
 let selected=copy,controlUsed=false,repairPayload:any;
 if(adaptive.some((s:any)=>s.issues.length)){
  assert.equal(spec.kind,'static','carousel original copy should fit locally');
  const repair=get(`${prefix}-fb1:copy_recovery`),wire=await json(`${base}/wire/${repair.id}.json`);
  const oldTargets=JSON.parse(wire.request.messages.at(-1).content).targets;
  const input:any={prompt:'Crie um post estático para a cafeteria Lume, que serve café artesanal e abre de segunda a sexta, das 8h às 18h. Convide a conhecer o espaço.',narrativePlan:recovery.plan};
  const targets=enrichTargetedCopyRepairTargets(input,definitions,copy,oldTargets,adaptive.map((s:any)=>s.scene),measure,2);
  repairPayload=JSON.parse(targetedCopyRepairPrompt(input,definitions,targets,2));
  const patches={patches:targets.map(t=>({slideIndex:t.slideIndex,fieldId:t.fieldId,itemIndex:t.itemIndex,value:t.fieldId==='field-0'?'':'Conheça a',alternatives:t.fieldId==='field-0'?[]:['Venha à','Conheça a Lume']}))};
  selected=applyTargetedCopyRepair(copy,targets,patches,definitions,(candidate,target)=>{
   const checked=inspect(candidate,true)[target.slideIndex],definition=definitions[target.slideIndex];
   const field=completeDesignFields(definition).find(f=>f.id===target.fieldId)!;
   const ids=definition.fragment.bindings.filter((b:any)=>b.source===field.source).flatMap((b:any)=>b.targetIds);
   return !checked.issues.some((issue:string)=>!issue.startsWith('collision:')&&ids.includes(issue.split(':').at(-1)));
  },2);
  controlUsed=true;
  assert.equal(selected.slides[0].values.find((r:any)=>r.fieldId==='field-1').value,'Conheça a Lume');
 }
 const result=inspect(selected,true);
 assert(result.every((s:any)=>s.issues.length===0),JSON.stringify(result.map((s:any)=>s.issues)));
 for(let i=0;i<result.length;i++){
  assert.deepEqual(result[i].scene.base,before[i].scene.base);
  assert.deepEqual(result[i].scene.pieces,before[i].scene.pieces);
  const reopened=resolveArsenalGeometry(JSON.parse(JSON.stringify(result[i].scene)),{measureText:measure});
  const shape=(s:any)=>s.elements.map((e:any)=>Object.fromEntries(['id','text','x','y','width','height','fontSize'].map(k=>[k,e[k]])));
  assert.deepEqual(shape(reopened),shape(result[i].scene),'layout changed when reopened without adaptive flag');
 }
 let post:any={...structuredClone(INITIAL_POST),id:`adaptive-test-${spec.kind}`,modelVersion:2,aspectRatio:'4:5',caption:selected.caption,showBadge:false,showStep:false,slides:result.map((_:any,i:number)=>({id:`adaptive-${spec.kind}-${i}`,step:`SLIDE ${String(i+1).padStart(2,'0')}`,headline:'',subtext:''}))};
 for(let i=0;i<result.length;i++)post=putArsenalComposition({...post,currentSlideIndex:i},result[i].scene);
 post.currentSlideIndex=0;
 const payload=canvasModelToSavePayload(post,{inputType:'text',inputContent:`Teste local de caixas adaptáveis (${spec.kind}); dados capturados, sem nova geração de IA.`});
 const reopened=savedPostToCanvasModel({id:0,canvas_model:JSON.parse(JSON.stringify(payload.canvasModel))});
 assert.deepEqual(reopened.slides.map(s=>s.composition),JSON.parse(JSON.stringify(normalizeCanvasModel(post).slides.map(s=>s.composition))));
 await fs.writeFile(`${out}/${spec.kind}-save-payload.json`,JSON.stringify(payload,null,2));
 await fs.writeFile(`${out}/${spec.kind}-compositions.json`,JSON.stringify(result.map((s:any)=>s.scene),null,2));
 if(process.argv.includes('--render')){
  ENV.reviewRendererBundle='/tmp/postspark-adaptive-renderer.js';
  ENV.reviewChromiumExecutablePath='/home/emanuel/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';
  const images=await renderReviewScenes({actor:'offline-control',compositions:result.map((s:any)=>s.scene),definitions,loadAssetBytes:loadAsset});
  for(const [i,image] of images.entries())await fs.writeFile(`${out}/${spec.kind}-${i}.png`,Buffer.from(image.dataUri.split(',')[1],'base64'));
  await closeReviewRenderer();
 }
 proof.push({...spec,controlUsed,originalIssues:before.map((s:any)=>s.issues),adaptiveOriginalIssues:adaptive.map((s:any)=>s.issues),finalIssues:result.map((s:any)=>s.issues),repairPayload,finalCopy:selected,overrides:result.map((s:any)=>s.scene.overrides),canonicalBaseAndPiecesUnchanged:true,reopenWithoutAdaptiveFlag:true,saveModelRoundtrip:true,externalCalls:0});
 console.log(JSON.stringify({case:spec.kind,controlUsed,originalIssues:before.map((s:any)=>s.issues),adaptiveOriginalIssues:adaptive.map((s:any)=>s.issues),finalIssues:result.map((s:any)=>s.issues)}));
}
for(const [file,digest] of digests)assert.equal(hash(await fs.readFile(file)),digest,file);
await fs.writeFile(`${out}/results.json`,JSON.stringify({version:1,passed:true,cases:proof,inputs:Array.from(digests,([file,sha256])=>({file,sha256})),limitation:'Static repair alternatives were manually authored controls. Carousel uses the original captured writer output. No new provider quality result; real geometry and editor renderer tested.'},null,2));
