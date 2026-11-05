import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {arsenalHash} from '../../../shared/arsenalContent';
import {componentCardV1Schema,assemblyIdentity} from '../../../shared/componentAssembly';
import {resolveDesignFamilyRepertoires} from '../../../shared/designRepertoire';
import {buildFamilySelectionCandidates} from '../../../shared/designFamilySelection';
import {editorialCatalogHash} from '../../../shared/editorialIntent';
import {repertoireMeetsMedia,type GenerationIntent} from '../../../shared/generationPlan';
import {readCatalogSnapshot} from '../../../server/designCatalog/versionedCatalog';
import {readEditorialCatalog} from '../../../server/designCatalog/editorialCatalog';
import {readSearchIndex,closeSearchEngines,sourceSearchDocument,validateSearchIndex} from '../../../server/designCatalog/familySearchIndex';
import {retrieveFamilyCandidates} from '../../../server/designCatalog/familyRetrieval';
import {boundedFamilyShortlist} from '../../../server/designCatalog/boundedFamilyShortlist';
import {shortlistCompleteDesigns} from '../../../server/designCatalog/designShortlist';

const dir='artifacts/acervo82/full';
const json=async(path:string)=>JSON.parse(await fs.readFile(path,'utf8'));
const staged=await json(`${dir}/staged.json`);
const [snapshot,catalog]=await Promise.all([readCatalogSnapshot(staged.revision),readEditorialCatalog(staged.revision)]);
assert(catalog);
const roots=snapshot.rows.filter(r=>r.design_components.status!=='archived').map(r=>componentCardV1Schema.parse(r.card)).filter(c=>!c.completeDesign?.designGuidance?.carouselVariant);
assert.equal(roots.length,82);
const semantic=await readSearchIndex(staged.revision,catalog,undefined,2);assert.equal(semantic.index.hash,staged.indexHash);
const vectorCache=new Map(semantic.index.documents.map(d=>[d.textHash,d.vector]));
const receiptSeed=(id:string)=>({version:1 as const,seed:arsenalHash(['acervo82-heldout',id])});
const makeIntent=(objective:string,items?:number):GenerationIntent=>({version:1,objective,tone:{description:'Claro',origin:'inferred',rationale:'Leitura controlada para ensaio de recuperação.'},adaptation:'controlled',requirements:items?[{id:'list',description:'Itens independentes',kind:'content',surface:'art',origin:'explicit',requestQuote:null,itemCount:items}]:[],content:[{id:'body',meaning:objective,requirementIds:items?['list']:[],sourceIds:[]}],editorial:{version:1,signals:[]}});
try{
 const raw=await fs.readFile('designs/acervo82/authored/reserved-briefs.json'),frozen=JSON.parse(raw.toString('utf8'));
 const errata=await json('designs/acervo82/authored/reserved-briefs-errata.json');
 assert.equal(createHash('sha256').update(raw).digest('hex'),errata.baseSha256);
 const reps=resolveDesignFamilyRepertoires(roots,{slideCount:1,contentMode:'compose'});
 const eligible=Object.fromEntries(['required','forbidden'].map(policy=>[policy,buildFamilySelectionCandidates(reps.filter(r=>repertoireMeetsMedia(r,{policy:policy as 'required'|'forbidden',required:policy==='required',purpose:policy==='required'?'editorial-photo':'none',reason:'Bateria congelada',slotTargets:policy==='required'?1:0})),catalog,true)]));
 const cases=[];
 for(const test of frozen.cases){
  const code=test.id.slice(0,6),policy=errata.mediaRequired.includes(code)?'required':errata.mediaForbidden.includes(code)?'forbidden':test.media;
  const candidates=eligible[policy];
  const receipt=await retrieveFamilyCandidates({families:candidates,intent:makeIntent(test.objective,test.items),catalog,semantic,neutrality:receiptSeed(test.id),visualPreference:errata.visualPreference[code]??test.visualPreference});
  const initial=receipt.initialIds.map(id=>candidates.find(f=>f.id===id)!.family);
  cases.push({id:test.id,expected:test.expectedFamily,eligible:candidates.some(f=>f.family===test.expectedFamily),media:policy,hit:initial.includes(test.expectedFamily),rank:initial.indexOf(test.expectedFamily)+1,initial});
 }
 const coverage={cases:cases.length,hits:cases.filter(c=>c.hit).length,hitRate:cases.filter(c=>c.hit).length/cases.length,neverRecovered:roots.map(c=>c.completeDesign!.family).filter(f=>!cases.some(c=>c.expected===f&&c.hit)),misses:cases.filter(c=>!c.hit).map(({id,expected,eligible})=>({id,expected,eligible}))};
 console.log(JSON.stringify(coverage));
 const neverRecoveredDiagnostics=[];
 for(const family of coverage.neverRecovered){
   const candidate=reps.find(r=>r.family===family);
   const blocked=cases.filter(c=>c.expected===family&&!c.eligible);
   if(!candidate||!blocked.length)continue;
   const all=buildFamilySelectionCandidates(reps,catalog,true);
   for(const test of frozen.cases.filter((c:any)=>c.expectedFamily===family)){
     const receipt=await retrieveFamilyCandidates({families:all,intent:makeIntent(test.objective,test.items),catalog,semantic,neutrality:receiptSeed(test.id),visualPreference:test.visualPreference});
     neverRecoveredDiagnostics.push({id:test.id,family,reason:'Media gate: the frozen request forbids the photographic composition.',withOptionalMediaRank:receipt.initialIds.map(id=>all.find(f=>f.id===id)!.family).indexOf(family)+1});
   }
 }
 const transport=[];
 for(const size of [82,200,2000]){
  const cards=size===82?roots:Array.from({length:size},(_,i)=>{const c=roots[i%roots.length];return {...c,id:assemblyIdentity(['capacity',i]),hash:arsenalHash([c.hash,i]),completeDesign:{...c.completeDesign!,family:`capacity-${i}`}};});
  const document={...catalog.document,designs:cards.map((c,i)=>({...catalog.document.designs.find(a=>a.sourceId===roots[i%roots.length].id)!,sourceId:c.id,sourceHash:c.hash}))};
  const frozen=size===82?catalog:{...catalog,document,hash:editorialCatalogHash(document)};
  const reps=resolveDesignFamilyRepertoires(cards,{slideCount:1,contentMode:'compose'}),families=buildFamilySelectionCandidates(reps,frozen,true);
  const docs=cards.map(c=>{const d=sourceSearchDocument(c,frozen,2),vector=vectorCache.get(d.textHash);assert(vector);return {...d,vector};});
  const basis={version:1 as const,modelFingerprint:semantic.index.modelFingerprint,documents:docs.sort((a,b)=>a.id.localeCompare(b.id))};
  const index=validateSearchIndex({...basis,hash:arsenalHash(basis)});
  const retrieval=await retrieveFamilyCandidates({families,intent:makeIntent('Explique uma ideia com clareza.'),catalog:frozen,semantic:{engine:semantic.engine,index},neutrality:receiptSeed('capacity')});
  const requests:Array<{bytes:number;questions:number}>=[];
  const result=await boundedFamilyShortlist({families,retrieval,input:{cards:reps.map(r=>({...r.slides[0].variants[0],id:r.defaultOffer.offerId,hash:r.defaultOffer.signature})),brief:'Explique uma ideia com clareza num post único.',slideCount:1,deadlineMs:null,editorialIntentVersion:1},sufficient:()=>false,shortlist:p=>shortlistCompleteDesigns(p,async r=>{
    requests.push({bytes:Buffer.byteLength(JSON.stringify(r)),questions:Object.keys(r.questions).length});
    assert(Object.values(r.questions).every(q=>q.instructions.design.version===5&&!('structure'in q.instructions.design)&&!('availability'in q.instructions.design)));
    return {model:r.model,answers:Object.fromEntries(Object.keys(r.questions).map(id=>[id,{type:'score' as const,score:3,confidence:.9}])),usage:{input_tokens:0,output_tokens:0,cost:0}};
  })});
  assert.equal(result.familyElection.ranking.length,36);assert.equal(retrieval.initialIds.length,24);assert.equal(retrieval.additionalIds.length,12);
  const total=requests.reduce((n,r)=>n+r.bytes,0);assert(requests.length<=4&&total<=128000&&requests.every(r=>r.bytes<=48000));
  transport.push({families:size,judgments:'simulated',waves:2,batches:requests.length,totalBytes:total,largestBytes:Math.max(...requests.map(r=>r.bytes)),questions:36});
 }
 await fs.writeFile(`${dir}/${process.argv.includes("--diagnose")?"retrieval-report-diagnosed.json":"retrieval-report.json"}`,JSON.stringify({version:1,revision:staged.revision,indexHash:semantic.index.hash,realEmbedding:true,paidCalls:0,coverage,transport,cases,neverRecoveredDiagnostics},null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify(transport));
 assert(coverage.hitRate>=.95,'Retrieval below the held-out 95% target. Examine individual misses before paid admission.');
}finally{await closeSearchEngines();}
