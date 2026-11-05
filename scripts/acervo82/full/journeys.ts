/** Authenticated persistence checks using the official Studio model and adapter. No AI admission. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {arsenalHash} from '../../../shared/arsenalContent';
import {readArsenalComposition} from '../../../shared/designArsenal';
import {canvasModelToSavePayload,canvasModelToUpdatePayload,savedPostToCanvasModel} from '../../../client/src/pages/CanvasLab/lib/saveAdapter';
import type {CanvasPostModel} from '../../../client/src/pages/CanvasLab/components/types';
import {openLocalApi} from './localApi';

const json=async(file:string)=>JSON.parse(await fs.readFile(file,'utf8'));
const stage=await json('artifacts/acervo82/full/staged.json'),proof=await json(path.join(stage.verification,'verification.json'));
assert.equal(proof.roots,82);
const filename=path.join(stage.verification,'persistence.json');
const prior=await json(filename).catch(e=>{if(e.code==='ENOENT')return {revision:stage.revision,checks:[]};throw e;});
assert.equal(prior.revision,stage.revision);
const checks=prior.checks as any[];
const local=await openLocalApi(),{api}=local;
const save=async()=>{const temp=`${filename}.tmp`;await fs.writeFile(temp,JSON.stringify({version:1,revision:stage.revision,checks},null,2)+'\n');await fs.rename(temp,filename);};
try {
 const manifest=await api.catalog.manifest.query();assert.equal(manifest.revision,stage.revision);
 const snapshot=await api.catalog.snapshot.query({revision:manifest.revision});
 assert.equal(snapshot.families.length,82);assert(snapshot.families.every(f=>f.capabilities.single));
 const directory=await api.catalog.acervo82Directory.query();assert.deepEqual(directory?.families,snapshot.families);
 const bytes=await fs.readFile(path.join(stage.verification,'media-fixture.jpg'));
 const media=await api.post.saveMediaAsset.mutate({imageData:`data:image/jpeg;base64,${bytes.toString('base64')}`});
 assert.equal(media.url,`/api/post-media/${local.actor}/${createHash('sha256').update(bytes).digest('hex')}`);
 const download=await fetch(`${local.app}${media.url}`,{headers:{Cookie:local.cookie}});assert(download.ok);assert.deepEqual(Buffer.from(await download.arrayBuffer()),bytes);
 assert.equal((await fetch(`${local.app}${media.url}`)).status,401);
 const sanitize=(model:CanvasPostModel)=>{
   for(const slide of model.slides)if(slide.composition)for(const m of Object.values(slide.composition.media))if(m.url.startsWith('data:'))m.url=media.url;
   return model;
 };
 for(const f of proof.fixtures){
  const key=`${f.code}:${f.kind}`;let row=checks.find(r=>r.key===key);
  if(row?.ok)continue;
  if(!row){row={key,code:f.code,kind:f.kind,ok:false};checks.push(row);}
  try{
   const edited=sanitize(await json(path.join(stage.verification,f.file)));
   const original=sanitize(await api.catalog.openAcervo82Review.mutate({id:f.id,mode:f.kind}));
   edited.id=original.id;edited.completeDesign=original.completeDesign;
   if(!row.postId){row.postId=(await api.post.save.mutate(canvasModelToSavePayload(original,{inputType:'text',inputContent:`Conferência técnica ${key}. Abertura controlada, sem IA.`}))).id;await save();}
   if(f.kind==='static'){
    const initial=readArsenalComposition(original.slides[0].composition),expected=readArsenalComposition(edited.slides[0].composition);
    assert.notEqual(arsenalHash(initial.content),arsenalHash(expected.content));
    await api.post.update.mutate({id:row.postId,...canvasModelToUpdatePayload(edited)});
   }
   const saved=await api.post.get.query({id:row.postId});assert(saved);
   const reopened=savedPostToCanvasModel(saved);
   assert.deepEqual(reopened.completeDesign,edited.completeDesign);assert.equal(reopened.slides.length,edited.slides.length);
   for(const [i,slide] of reopened.slides.entries()){
    assert.deepEqual(readArsenalComposition(slide.composition),readArsenalComposition(edited.slides[i].composition));
    assert(slide.composition?.origin.componentAssembly?.componentHashes.includes(f.definitionHashes[i]));
   }
   row.ok=true;row.definitionHashes=f.definitionHashes;row.reopenedHash=arsenalHash(reopened.slides.map(s=>s.composition));delete row.error;
  } catch(e){row.error=(e as Error).message;}
  await save();
  if(checks.length%10===0)console.log(JSON.stringify({persisted:checks.filter(r=>r.ok).length,attempted:checks.length}));
 }
 const ref=checks.find(r=>r.code==='REF-03'&&r.kind==='static'&&r.ok);
 if(ref){const summaries=await api.post.listSummary.query({limit:20,offset:0,search:'REF-03'});assert(summaries.items.some(r=>r.id===ref.postId&&r.designFamily==='acervo82-reference-03'));}
 const summary={revision:stage.revision,fixtures:proof.fixtures.length,passed:checks.filter(r=>r.ok).length,failures:checks.filter(r=>!r.ok).map(({key,error})=>({key,error})),designSearch:!!ref,paidCalls:0};
 console.log(JSON.stringify(summary));assert.equal(summary.passed,proof.fixtures.length);
} finally {await local.close();}
