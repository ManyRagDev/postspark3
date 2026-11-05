/** Offline native scene, fit, fonts, media, and decoded export evidence. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import JSZip from 'jszip';
import {componentDefinitionV1Schema,componentHash,compactComponentCard,assemblyIdentity,type ComponentDefinitionV1} from '../../../shared/componentAssembly';
import {acervo82FamilyDirectory} from '../../../shared/acervo82Directory';
import {arsenalHash,projectContentHeadline} from '../../../shared/arsenalContent';
import {partitionArsenalReadinessIssues} from '../../../shared/arsenalReadiness';
import {resolveArsenalGeometry,type ArsenalTextMeasurer} from '../../../shared/arsenalGeometry';
import type {ArsenalComposition} from '../../../shared/designArsenal';
import type {VariableContent} from '../../../shared/variableContent';
import {renderReviewScenes,closeReviewRenderer} from '../../../server/ai/workflows/proposalRenderer';
import {createComponentTextMeasurer} from '../../../server/ai/componentTextMeasurer';
import {INITIAL_POST,type CanvasPostModel} from '../../../client/src/pages/CanvasLab/components/types';
import {putArsenalComposition} from '../../../client/src/pages/CanvasLab/lib/arsenalComposition';
import {defaultStudioPreferences} from '../../../shared/studioPreferences';
import type {ComponentPackage} from '../../../harness/componentArsenal/extract';
import {nativeScene,sampleContent} from './nativeScene';

const [build,directory]=process.argv.slice(2);
assert(build&&directory&&build!==directory,'Use the immutable build and a new evidence directory.');
const json=async(file:string)=>JSON.parse(await fs.readFile(file,'utf8'));
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const write=async(file:string,value:unknown)=>fs.writeFile(path.join(directory,file),JSON.stringify(value,null,2)+'\n');
const inventory=await json(path.join(build,'inventory.json'));
const registry=await json('designs/acervo82/authored/registry.json');
assert.equal(inventory.sourceCount,82);
assert.equal(new Set(inventory.rows.map((r:any)=>r.id)).size,82);
await fs.mkdir(directory);
for(const sub of ['fixtures','references','thumbnails','png','zip'])await fs.mkdir(path.join(directory,sub));

const photoSource=registry.entries.find((e:any)=>e.code==='REF-03').sourcePreview;
const mediaImage=await loadImage(await fs.readFile(photoSource));
const photo=createCanvas(640,405);
photo.getContext('2d').drawImage(mediaImage,0,448,mediaImage.width,mediaImage.height-448,0,0,photo.width,photo.height);
const photoBytes=photo.toBuffer('image/jpeg',86);
const photoUri=`data:image/jpeg;base64,${photoBytes.toString('base64')}`;
await fs.writeFile(path.join(directory,'media-fixture.jpg'),photoBytes);
const approved:ComponentDefinitionV1[]=[];
const checks:any[]=[], review:any[]=[], fixtures:any[]=[];
const defaultCaps={single:false,carousel:false,photo:false,list:false,comparison:false,metric:false};
const readAsset=async(a:{sha256:string})=>fs.readFile(path.join(build,'assets',a.sha256));
const geometry=(scene:ArsenalComposition,m:ArsenalTextMeasurer,allowReduction=false)=>{
  for(const slot of scene.base.mediaSlots??[])scene.media[slot.id]={kind:'user',url:photoUri,focalX:.48,focalY:.51};
  return resolveArsenalGeometry(scene,{measureText:m,allowReduction});
};
const alternates=['ÓTIMA CRIAÇÃO EM AÇÃO','CRIAÇÃO E ATENÇÃO','EDIÇÃO EM AÇÃO','IDEIA ÚTIL','AÇÃO','É'];
function alternate(original:VariableContent,definition:ComponentDefinitionV1,wording:string,all:boolean){
 const content=structuredClone(original);
 const cards=definition.fragment.bindings.filter(b=>b.kind==='list');let ordinal=0;
 for(const block of content.blocks){
  if(block.type==='text'&&(block.role==='headline'||all)){
   if(block.role==='headline')block.text=wording;
   else if(block.role==='body')block.text='Observe a ideia e faça uma ação.';
   else if(block.role==='callToAction')block.text='Veja a ação';
   else block.text=block.text.length<3?'É':'Edição';
  }
  if(block.type==='list'){
    const card=cards[ordinal++];
    if(card?.cardinality)block.items=Array.from({length:card.cardinality.max},(_,i)=>({id:`test-item-${i}`,text:['Ação','Ideia','Edição'][i%3]}));
  }
  if(block.type==='comparison'){block.left={label:'ANTES',text:'Ação sem foco.'};block.right={label:'DEPOIS',text:'Ação com foco.'};}
  if(block.type==='metric'){block.value='42%';block.label='Ações';}
 }
 return content;
}
function makeModel(entry:any,scenes:Array<{composition:ArsenalComposition;role:'static'|'cover'|'development'|'closing'}>,key:string):CanvasPostModel{
 const run=assemblyIdentity(['acervo82-technical',entry.id,key,scenes.map(s=>s.composition.origin.candidateId)]);
 const trace=assemblyIdentity([run,'local-curation']);
 const base:CanvasPostModel={...structuredClone(INITIAL_POST),id:`qa-${run}`,modelVersion:2,familyId:'editorial-poster',familyName:entry.name,aspectRatio:'4:5',showStep:false,showBadge:false,
  headline:projectContentHeadline(scenes[0].composition.content)||entry.name,caption:`Conferência técnica · ${entry.code} · ${key}`,
  completeDesign:{schemaVersion:1,pipeline:'complete-design-v1',runId:run,traceId:trace,slot:0,name:entry.name,reason:'Abertura controlada para revisão local do documento nativo.',family:entry.id,visualPreference:defaultStudioPreferences},
  currentSlideIndex:0,slides:scenes.map((s,i)=>({id:`review-${i+1}`,step:'',headline:projectContentHeadline(s.composition.content),subtext:'',assemblyRole:s.role})),
 };
 const model=scenes.reduce((post,{composition},currentSlideIndex)=>putArsenalComposition({...post,currentSlideIndex},composition),base);
 return {...model,currentSlideIndex:0,headline:base.headline};
}
try{
 for(const entry of registry.entries){
  const row=inventory.rows.find((r:any)=>r.id===entry.id),reference=`references/${path.basename(entry.sourcePreview)}`;
  await fs.copyFile(entry.sourcePreview,path.join(directory,reference));
  const item:any={id:entry.id,code:entry.code,name:entry.name,aliases:entry.aliases,reference,render:null,status:'needs_adjustment',capabilities:defaultCaps,differences:[],definitionHash:null};
  review.push(item);
  if(!row?.definitionId||row.blocking?.length){item.differences.push(row?.error??row?.blocking?.join(', ')??'Sem composição nativa.');checks.push({id:entry.id,code:entry.code,rootReady:false,issues:item.differences});continue;}
  assert.equal(row.sourceHash,sha(await fs.readFile(entry.sourcePreview)));
  const pkg:ComponentPackage=await json(path.join(build,'packages',`${entry.id}.json`));
  const definitions=pkg.components.map(d=>componentDefinitionV1Schema.parse(d));
  const root=definitions[0];assert.equal(root.hash,row.definitionHash);assert.equal(root.id,row.definitionId);
  assert(definitions.every(d=>d.completeDesign?.family===entry.id&&d.hash===componentHash(d)));
  const measure=await createComponentTextMeasurer(root.assets,readAsset);
  const samples=new Map<string,{d:ComponentDefinitionV1;original:ArsenalComposition;alternate:ArsenalComposition;proof:any}>();
  const sample=sampleContent(pkg), originalTitle=projectContentHeadline(sample);
  const evidence:any={id:entry.id,code:entry.code,sourceHash:row.sourceHash,rootReady:false,definitions:[]};checks.push(evidence);
  for(const d of definitions){
   try{
    const original=geometry(nativeScene(pkg,d,measure),measure,d.id!==root.id);
    const problems=partitionArsenalReadinessIssues(original.issues);
    if(problems.blocking.length)throw Error(problems.blocking.join(','));
    const long=`${originalTitle||'Criação'} COM AÇÃO`;
    const trials=[long,...alternates].flatMap(title=>[true,false].map(all=>({title,all})));
    let selected:ArsenalComposition|undefined;const trialIssues:any[]=[];
    for(const {title,all} of trials){
      try{
        const c=geometry(nativeScene(pkg,d,measure,alternate(sample,d,title,all),true),measure,true);
        const partition=partitionArsenalReadinessIssues(c.issues);
        if(!partition.blocking.length&&arsenalHash(c.content)!==arsenalHash(original.content)){selected=c;break;}
        trialIssues.push({title,all,issues:partition.blocking});
      }catch(e){trialIssues.push({title,all,issues:[(e as Error).message]});}
    }
    if(!selected)throw Error(`alternate_fit:${JSON.stringify(trialIssues).slice(0,1500)}`);
    const listLimits=d.fragment.bindings.filter(b=>b.kind==='list'&&b.cardinality).map(b=>b.cardinality!);
    let exceededListRejected:boolean|null=null;
    if(listLimits.length){const invalid=structuredClone(selected.content) as VariableContent;const list=invalid.blocks.find(b=>b.type==='list');if(list){list.items.push(...Array.from({length:listLimits[0].max-list.items.length+1},(_,i)=>({id:`overflow-${i}`,text:'Ação'})));try{exceededListRejected=nativeScene(pkg,d,measure,invalid,true).issues.some(i=>i.startsWith('cardinality:'));}catch{exceededListRejected=true;}assert(exceededListRejected);}}
    const proof={id:d.id,hash:d.hash,roles:d.roles,passed:true,diagnostics:[...new Set([...original.issues,...selected.issues])],alternateTitle:projectContentHeadline(selected.content),longerTitle:projectContentHeadline(selected.content).length>originalTitle.length,listLimits,exceededListRejected,rejectedTrials:trialIssues};
    samples.set(d.id,{d,original,alternate:selected,proof});evidence.definitions.push(proof);
   }catch(e){evidence.definitions.push({id:d.id,hash:d.hash,passed:false,reason:(e as Error).message});}
  }
  if(!samples.has(root.id)){item.differences.push(evidence.definitions[0]?.reason??'Raiz sem amostra alternativa.');continue;}
  const jobs=Array.from(samples.values());
  const results=await renderReviewScenes({compositions:jobs.flatMap(j=>[j.original,j.alternate]),definitions:jobs.map(j=>j.d),actor:'acervo82-local-technical',deadlineMs:Date.now()+45_000,loadAssetBytes:readAsset});
  const pngs=new Map<string,Buffer>();
  for(const [i,job] of jobs.entries())for(const [offset,variant]of ['reference','alternate'].entries()){
    const exported=results[i*2+offset],bytes=Buffer.from(exported.dataUri.split(',')[1],'base64');
    const decoded=await loadImage(bytes);assert.equal(decoded.width*5,decoded.height*4);assert(decoded.height>=1350);
    const file=`png/${entry.code}-${job.d.id}-${variant}.png`;
    await fs.writeFile(path.join(directory,file),bytes);pngs.set(`${job.d.id}:${variant}`,bytes);
    job.proof[variant]={file,sha256:sha(bytes),width:decoded.width,height:decoded.height};
  }
  const ready=[root];
  const first=samples.get(root.id)!;
  const card=(scene:ArsenalComposition,role:'static'|'cover'|'development'|'closing')=>({composition:scene,role});
  const standalone=makeModel(entry,[card(first.original,'static')],'post-unico');
  const edited=makeModel(entry,[card(first.alternate,'static')],'post-unico-editado');
  await write(`fixtures/${entry.id}.json`,standalone);await write(`fixtures/${entry.id}-alternate.json`,edited);
  fixtures.push({code:entry.code,id:entry.id,kind:'static',file:`fixtures/${entry.id}-alternate.json`,definitionHashes:[root.hash]});
  for(const mode of ['compose','literal'] as const){
   const development=jobs.find(j=>j.d.completeDesign?.designGuidance?.carouselVariant?.version===3&&j.d.completeDesign.designGuidance.carouselVariant.role==='development'&&j.d.completeDesign.designGuidance.carouselVariant.contentMode===mode);
   const closing=jobs.find(j=>j.d.completeDesign?.designGuidance?.carouselVariant?.version===3&&j.d.completeDesign.designGuidance.carouselVariant.role==='closing'&&j.d.completeDesign.designGuidance.carouselVariant.contentMode===mode);
   if(!development||!closing)continue;
   ready.push(development.d,closing.d);
   const model=makeModel(entry,[card(first.original,'cover'),card(development.alternate,'development'),card(closing.alternate,'closing')],`carrossel-${mode}`);
   const file=`fixtures/${entry.id}-${mode}.json`;await write(file,model);fixtures.push({code:entry.code,id:entry.id,kind:mode,file,definitionHashes:[root.hash,development.d.hash,closing.d.hash]});
   const zip=new JSZip();for(const [i,bytes]of [pngs.get(`${root.id}:reference`)!,pngs.get(`${development.d.id}:alternate`)!,pngs.get(`${closing.d.id}:alternate`)!].entries())zip.file(`slide-${i+1}.png`,bytes);
   const zipped=await zip.generateAsync({type:'nodebuffer'}),opened=await JSZip.loadAsync(zipped,{checkCRC32:true});
   assert.equal(Object.keys(opened.files).length,3);for(let i=1;i<=3;i++)await loadImage(await opened.file(`slide-${i}.png`)!.async('nodebuffer'));
   const zipFile=`zip/${entry.code}-${mode}.zip`;await fs.writeFile(path.join(directory,zipFile),zipped);
   evidence[`zip_${mode}`]={file:zipFile,sha256:sha(zipped),pages:3,origin:'native-rendered-fixture-archive'};
  }
  approved.push(...ready);
  const thumb=createCanvas(360,450);thumb.getContext('2d').drawImage(await loadImage(pngs.get(`${root.id}:reference`)!),0,0,360,450);
  item.render=`thumbnails/${entry.id}.jpg`;await fs.writeFile(path.join(directory,item.render),thumb.toBuffer('image/jpeg',88));
  item.status='ready_for_local_review';item.definitionHash=root.hash;item.capabilities=acervo82FamilyDirectory(ready.map(compactComponentCard))[0].capabilities;
  item.differences=[...(row.adjustments??[]).filter((a:any)=>a.reason).map((a:any)=>a.reason),...(item.capabilities.photo?['A área de mídia usa uma foto de ensaio substituível. O recorte é nativo; a foto original não é um asset obrigatório da família.']:[]),...(entry.code==='REF-24'?['Amostras recompostas em duas listas editáveis; nem todas as faces anunciadas no original puderam ser identificadas.']:[]),...(entry.code==='CON-07'?['O lettering cromado foi refeito com preenchimento tonal e contorno editáveis.']:[]),...(entry.code==='CON-21'?['A sombra colorida é uma extrusão nativa simplificada.']:[]),...(row.adjustments?.some((a:any)=>a.cause==='verified-native-contrast')?['Ajuste pontual de cor para manter o contraste no CanvasLab.']:[])];
  if(entry.carouselIntent&&!item.capabilities.carousel)item.differences.push('Carrossel pendente: sequência fora da capacidade verificada; post único disponível.');
  evidence.rootReady=true;evidence.stagedDefinitions=ready.map(d=>d.id);
  console.log(JSON.stringify({code:entry.code,verified:ready.length,carousel:item.capabilities.carousel}));
 }
}finally{await closeReviewRenderer();}
await write('review.json',{version:1,entries:review});
await write('verification.json',{version:1,build,inventoryHash:sha(await fs.readFile(path.join(build,'inventory.json'))),mediaFixture:{source:photoSource,sha256:sha(photoBytes),usage:'local-only'},roots:checks.filter(c=>c.rootReady).length,definitions:approved.map(d=>({id:d.id,hash:d.hash})),checks,fixtures,paidCalls:0});
console.log(JSON.stringify({build,directory,roots:checks.filter(c=>c.rootReady).length,definitions:approved.length,fixtures:fixtures.length,blocked:checks.filter(c=>!c.rootReady).map(c=>c.code)}));
