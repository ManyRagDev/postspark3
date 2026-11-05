import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {getDb} from '../../../server/db';
import {ENV} from '../../../server/_core/env';
import {withCatalogStaging,readCatalogSnapshot,readCatalogDefinition,readCatalogManifest} from '../../../server/designCatalog/versionedCatalog';
import {prepareComponentDraft} from '../../../server/designCatalog/componentStore';
import {uploadArsenalAsset} from '../../../server/designCatalog/arsenalAssets';
import {publishEditorialCatalog,readEditorialCatalog} from '../../../server/designCatalog/editorialCatalog';
import {prepareCatalogSearchIndex,searchIndexFile,closeSearchEngines} from '../../../server/designCatalog/familySearchIndex';
import {editorialCatalogDocumentSchema} from '../../../shared/editorialIntent';
import {componentDefinitionV1Schema,componentHash,type ComponentDefinitionV1} from '../../../shared/componentAssembly';
import {arsenalHash} from '../../../shared/arsenalContent';
import {acervo82Code} from '../../../shared/acervo82Identity';

const base='artifacts/acervo82/full';
const directory=process.argv[2];
assert(/^artifacts\/acervo82\/full\/[a-z0-9-]+$/.test(directory));
assert.equal(process.env.POSTSPARK_ACERVO82_LOCAL,'true');
assert(['127.0.0.1','localhost','[::1]'].includes(new URL(ENV.supabaseUrl).hostname));
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const json=async(file:string)=>JSON.parse(await fs.readFile(file,'utf8'));
const write=async(file:string,value:unknown,flag='wx')=>fs.writeFile(file,JSON.stringify(value,null,2)+'\n',{flag,mode:0o600});
const proof=await json(path.join(directory,'verification.json'));
assert.equal(proof.roots,82);
assert.equal(sha(await fs.readFile(path.join(proof.build,'inventory.json'))),proof.inventoryHash);
const actor=(await json('.acervo82-local/test-account.json')).id;
const registry=await json('designs/acervo82/authored/registry.json');
const editorialIntents=await json('harness/completeDesigns/editorialCatalogSeed.json');
const defs:ComponentDefinitionV1[]=[];
for(const entry of proof.definitions){
 const d=componentDefinitionV1Schema.parse(await json(path.join(proof.build,'definitions',`${entry.id}.json`)));
 assert(d.completeDesign?.baselineVerified&&acervo82Code(d.completeDesign.family));assert.equal(d.hash,entry.hash);assert.equal(componentHash(d),entry.hash);
 const evidence=proof.checks.find((c:any)=>c.id===d.completeDesign!.family)?.definitions.find((p:any)=>p.id===d.id);
 assert(evidence?.passed&&evidence.hash===d.hash);
 for(const test of ['reference','alternate'])assert.equal(sha(await fs.readFile(path.join(directory,evidence[test].file))),evidence[test].sha256);
 defs.push(d);
}
const roots=defs.filter(d=>!d.completeDesign?.designGuidance?.carouselVariant),families=new Set(roots.map(d=>d.completeDesign!.family));
assert.equal(roots.length,82);assert.equal(families.size,82);
assert(registry.entries.every((e:any)=>families.has(e.id)));
assert.equal(new Set(defs.map(d=>d.id)).size,defs.length);
const identity=arsenalHash(defs.map(d=>({id:d.id,hash:d.hash})).sort((a,b)=>a.id.localeCompare(b.id)));
const receiptFile=path.join(base,'staged.json');
const prior=await json(receiptFile).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
if(prior){assert.equal(prior.identity,identity);console.log(JSON.stringify({reused:true,...prior}));process.exit(0);}
const db=getDb(),activeBefore=await db.rpc('catalog_manifest');
if(activeBefore.error)throw activeBefore.error;
const old=await db.from('design_components').select('id,status,actor_id,definition').eq('kind','content');
if(old.error)throw old.error;
const superseded=old.data.filter((r:any)=>r.status!=='archived'&&r.definition.completeDesign&&!defs.some(d=>d.id===r.id));
// A different catalog or actor cannot be retired by this isolated command.
assert(superseded.every((r:any)=>r.actor_id===actor&&families.has(r.definition.completeDesign.family)),'unexpected_catalog_source_in_local_environment');
const oldStage=await json('artifacts/acervo82/pilot/staged.json');
const recovery=path.join(base,'recovery');await fs.mkdir(recovery,{recursive:true});
const snapshot=await readCatalogSnapshot(oldStage.revision), previousCatalog=await readEditorialCatalog(oldStage.revision);
const oldDefs=await Promise.all(snapshot.rows.filter(r=>r.design_components.status!=='archived').map(r=>readCatalogDefinition(oldStage.revision,r.component_id,r.definition_hash)));
const oldAssets=new Map(oldDefs.flatMap(d=>d.assets).map(a=>[a.id,a]));
const packageDirectory=path.join(recovery,'assets');await fs.mkdir(packageDirectory,{recursive:true});
const {loadComponentFontBytes}=await import('../../../server/ai/componentTextMeasurer');
for(const asset of oldAssets.values()){const bytes=await loadComponentFontBytes(asset);assert.equal(sha(bytes),asset.sha256);await fs.writeFile(path.join(packageDirectory,asset.sha256),bytes);}
for(const projection of [1,2] as const){const filename=searchIndexFile(oldStage.revision,previousCatalog?.hash??null,ENV.designRetrievalDirectory,projection);try{await fs.copyFile(filename,path.join(recovery,`index-v${projection}.json`));}catch(e){if((e as any).code!=='ENOENT'||projection===1)throw e;}}
const previousHead=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
await write(path.join(recovery,'checkpoint.json'),{previousHead,activeRevision:activeBefore.data?.revision??null,localRevision:oldStage.revision,catalog:oldStage,componentStatuses:superseded.map((r:any)=>({id:r.id,status:r.status})),definitionHashes:oldDefs.map(d=>d.hash),assets:[...oldAssets.values()],restoration:'Use the previous code and isolated local launcher with this frozen local revision. The active global pointer was never changed.'},'w');
await write(path.join(recovery,'previous-catalog.json'),{snapshot,definitions:oldDefs,editorial:previousCatalog},'w');
const assets=new Map(defs.flatMap(d=>d.assets).map(a=>[a.id,a]));
for(const [index,asset]of [...assets.values()].entries()){
 const bytes=await fs.readFile(path.join(proof.build,'assets',asset.sha256));assert.equal(sha(bytes),asset.sha256);
 assert.equal(arsenalHash(await uploadArsenalAsset(bytes,{license:asset.license,weight:asset.weight},actor)),arsenalHash(asset));
 if((index+1)%20===0)console.log(JSON.stringify({verifiedAssets:index+1,total:assets.size}));
}
for(const r of superseded){const changed=await db.from('design_components').update({status:'archived'}).eq('id',r.id).eq('actor_id',actor);if(changed.error)throw changed.error;}
try{
 const {revision}=await withCatalogStaging(async()=>{for(const d of defs)await prepareComponentDraft(d,actor);return defs.length;});
 const [manifest,result]=await Promise.all([readCatalogManifest(revision),readCatalogSnapshot(revision)]);
 const available=result.rows.filter(r=>r.design_components.status!=='archived');
 assert.equal(arsenalHash(available.map(r=>({id:r.component_id,hash:r.definition_hash})).sort((a,b)=>a.id.localeCompare(b.id))),identity);
 assert.equal(manifest.summary.experimental.staticOfferCount,82);
 const document=editorialCatalogDocumentSchema.parse({version:1,intents:editorialIntents.intents,designs:roots.map(d=>{
   const e=registry.entries.find((e:any)=>e.id===d.completeDesign!.family);
   const hasPhoto=Boolean(d.fragment.mediaSlots?.length),hasList=d.fragment.bindings.some(b=>b.kind==='list');
   const intentIds=[...new Set([...e.editorialIntents.filter((id:string)=>hasPhoto||!['apresentar_com_imagem','comentar_imagem'].includes(id)),...(hasPhoto?['apresentar_com_imagem','comentar_imagem']:[]),...(hasList?['organizar_pontos']:[])])];
   return {sourceId:d.id,sourceHash:d.hash,intentIds,rationale:e.descriptor};
 })});
 const editorial=await publishEditorialCatalog(revision,document);
 const legacyIndex=await prepareCatalogSearchIndex(revision,ENV.designRetrievalDirectory);
 const neutralIndex=await json(searchIndexFile(revision,editorial.hash,ENV.designRetrievalDirectory,2));assert.equal(neutralIndex.documents.length,82);
 const activeAfter=await db.rpc('catalog_manifest');if(activeAfter.error)throw activeAfter.error;assert.equal(activeAfter.data?.revision,activeBefore.data?.revision);
 const receipt={actor,revision,identity,build:proof.build,verification:directory,definitions:defs.length,sources:82,assets:assets.size,manifest,editorialRevision:editorial.revision,editorialHash:editorial.hash,legacyIndex,indexHash:neutralIndex.hash,activeRevisionUnchanged:true};
 await write(path.join(directory,'editorial.json'),document);
 await write(receiptFile,receipt);
 await write('.acervo82-local/full-review.json',{directory},'w');
 console.log(JSON.stringify(receipt));
}finally{await closeSearchEngines();}
