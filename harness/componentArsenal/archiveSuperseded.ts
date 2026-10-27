import {publishCatalogIfEnabled} from "../../server/designCatalog/versionedCatalog";
/** Reversible withdrawal of superseded drafts; retained pinned documents remain immutable. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { getDb } from '../../server/db';
const root=path.resolve(process.argv[2]??''),actor=process.argv[3];
if(!actor)throw new Error('Informe pacote estável e administrador');
const db=getDb(),admin=await db.from('profiles').select('role').eq('id',actor).single();
if(admin.error||admin.data?.role!=='admin')throw new Error('Administrador obrigatório');
const ledger=JSON.parse(await fs.readFile(path.join(root,'REPLACED_COMPONENTS.json'),'utf8'));
const imported=JSON.parse(await fs.readFile(path.join(root,'import-report.json'),'utf8'));
const retain=new Set<string>(ledger.retainIds),archive=Array.from(new Set<string>(ledger.archiveIds));
if(archive.some(id=>retain.has(id))||retain.size!==imported.results.length||imported.results.some((r:any)=>!retain.has(r.id)))throw new Error('Ledger não corresponde ao import completo');
const report={schemaVersion:1,actor,createdAt:new Date().toISOString(),source:path.basename(root),retained:retain.size,archived:[] as string[]};
for(let i=0;i<archive.length;i+=100){
 const updated=await db.from('design_components').update({status:'archived'}).in('id',archive.slice(i,i+100)).eq('status','draft').eq('actor_id',actor).select('id');
 if(updated.error)throw updated.error;
 report.archived.push(...(updated.data??[]).map((r:any)=>r.id));
}
await fs.writeFile(path.join(root,'archive-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,archived:report.archived.length}));

await publishCatalogIfEnabled();
