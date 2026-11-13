/** Freeze existing, registry-approved definitions. Never authors, publishes or contacts a service. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {compactComponentCard,componentDefinitionV1Schema,componentHash} from '../../shared/componentAssembly';
import {arsenalHash} from '../../shared/arsenalContent';
const args=process.argv.slice(2);
const option=(name:string)=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
const build=option('--build-dir');
if(!build)throw Error('Use --build-dir <immutable authored build> [--out-dir artifacts/selection-motor] [--revision <label>].');
const base=resolve(build),out=resolve(option('--out-dir')??'artifacts/selection-motor');
const registryPath=resolve(option('--registry')??'designs/acervo82/authored/registry.json');
const registryBytes=await readFile(registryPath),registry=JSON.parse(registryBytes.toString());
const rows=[],proof=[],assets=new Map();
for(const entry of registry.entries)for(const ref of entry.definitions){
 const path=join(base,'definitions',`${ref.id}.json`),bytes=await readFile(path);
 const definition=componentDefinitionV1Schema.parse(JSON.parse(bytes.toString()));
 if(definition.id!==ref.id||definition.hash!==ref.hash||componentHash(definition)!==ref.hash)throw Error(`Definition mismatch ${entry.id}:${ref.id}`);
 const card=compactComponentCard(definition);rows.push({card,component_id:card.id,definition_hash:card.hash});
 proof.push({family:entry.id,id:ref.id,hash:ref.hash,path,fileSha256:createHash('sha256').update(bytes).digest('hex')});
 for(const asset of definition.assets)assets.set(asset.sha256,asset);
}
const missing=[];for(const asset of assets.values())try{
 const bytes=await readFile(join(base,'assets',asset.sha256));
 if(bytes.length!==asset.bytes||createHash('sha256').update(bytes).digest('hex')!==asset.sha256)missing.push({sha256:asset.sha256,reason:'integrity'});
}catch{missing.push({sha256:asset.sha256,reason:'missing'});}
const snapshot={rows};await mkdir(out,{recursive:true});
const snapshotPath=join(out,'acervo82-build08-snapshot.json'),provenancePath=join(out,'acervo82-build08-provenance.json');
await writeFile(snapshotPath,JSON.stringify({revision:option('--revision')??'registry-local-freeze',hash:arsenalHash(snapshot),snapshot},null,2)+'\n');
await writeFile(provenancePath,JSON.stringify({version:1,sourceBuild:base,registryPath,registrySha256:createHash('sha256').update(registryBytes).digest('hex'),definitions:proof,assetCount:assets.size,assetProblems:missing,paidCalls:0},null,2)+'\n');
console.log(JSON.stringify({snapshotPath,provenancePath,definitions:rows.length,roots:registry.entries.length,hash:arsenalHash(snapshot),assets:assets.size,assetProblems:missing}));
