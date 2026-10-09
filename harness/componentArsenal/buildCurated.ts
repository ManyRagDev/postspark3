/** Append four reviewed-layout candidates to the frozen corpus; never overwrite its definitions. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { curatedArtComponents } from './curatedArtComponents';
import { arsenalHash } from '../../shared/arsenalContent';
import type { ComponentPackage } from './extract';
const source=path.resolve(process.argv[2]??'artifacts/component-arsenal/revision-8-vocabulary-final'),output=path.resolve(process.argv[3]??'artifacts/component-arsenal/revision-9-curated-art');
try{await fs.access(output);throw new Error('Destino existente; pacotes de revisão são imutáveis');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
const inventory=JSON.parse(await fs.readFile(path.join(source,'inventory.json'),'utf8'));
await fs.cp(source,output,{recursive:true});
for(const stale of ['import-report.json','CATALOG_CHECK.json','VOCABULARY_CHECKS.json','REVIEW.html','vocabulary-previews'])await fs.rm(path.join(output,stale),{recursive:true,force:true});
const additions=[];
for(const row of inventory.rows){
 if(!row.package)continue;
 const filename=path.join(output,row.package),p:ComponentPackage=JSON.parse(await fs.readFile(filename,'utf8')),before=arsenalHash(p.components),components=curatedArtComponents(p);
 if(arsenalHash(p.components)!==before)throw new Error('Fonte mutada');
 if(!components.length)continue;
 const prior=p.components.length;p.components.push(...components);
 if(p.components.length!==prior+components.length)throw new Error('Pacote divergente');
 row.componentIds=p.components.map(c=>c.id);row.componentKinds=p.components.map(c=>c.kind);
 additions.push(...components.map(c=>({id:c.id,hash:c.hash,source:c.source,label:c.label,roles:c.roles})));
 await fs.writeFile(filename,JSON.stringify(p,null,2)+'\n');
}
if(additions.length!==4)throw new Error(`Esperadas quatro derivações, recebidas ${additions.length}`);
inventory.components+=additions.length;inventory.extractorVersion='recipe-component-arsenal-v4-curated-art';
await fs.writeFile(path.join(output,'inventory.json'),JSON.stringify(inventory,null,2)+'\n');
await fs.writeFile(path.join(output,'CURATED_ADDITIONS.json'),JSON.stringify({source,previousDefinitionsPreserved:524,added:additions,published:0},null,2)+'\n');
await fs.writeFile(path.join(output,'REPORT.md'),'# Candidatos de direção de arte\n\n524 definições preservadas; quatro derivações autoradas: três capas e desenvolvimento do papel com mínimo tipográfico absoluto. Revisão visual humana pendente; nenhuma publicação automática. Consulte CURATED_ADDITIONS.json e a galeria art-direction/REVIEW.html.\n');
console.log(JSON.stringify({output,added:additions.length,total:inventory.components}));
