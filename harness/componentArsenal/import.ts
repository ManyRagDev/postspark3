import {withCatalogPublication} from "../../server/designCatalog/versionedCatalog";
/** Explicit deployment command: immutable drafts and verified private assets, never publication. */
import fs from "node:fs/promises";
import path from "node:path";
import { getDb } from "../../server/db";
import { uploadArsenalAsset } from "../../server/designCatalog/arsenalAssets";
import { prepareComponentDraft } from "../../server/designCatalog/componentStore";
import { arsenalHash } from "../../shared/arsenalContent";
import type { ComponentPackage } from "./extract";

const root=path.resolve(process.argv[2]??"artifacts/component-arsenal/current"),actor=process.argv[3];
if(!actor)throw new Error("Informe o UUID do administrador responsável pelo import");
const admin=await getDb().from("profiles").select("role").eq("id",actor).single();
if(admin.error)throw new Error(`Falha ao verificar administrador (${admin.error.code??"network"})`);
if(admin.data.role!=="admin")throw new Error("O import exige administrador existente");
const inventory=JSON.parse(await fs.readFile(path.join(root,"inventory.json"),"utf8"));
const packages:ComponentPackage[]=await Promise.all(inventory.rows.filter((r:any)=>r.package).map(async(r:any)=>JSON.parse(await fs.readFile(path.join(root,r.package),"utf8"))));
const assets=new Map(packages.flatMap(p=>p.assetFiles.map(a=>[a.manifest.id,a] as const))),components=new Map(packages.flatMap(p=>p.components.map(c=>[c.id,c] as const)));
for(const a of Array.from(assets.values())){
  const bytes=await fs.readFile(path.join(root,a.relativePath));
  const stored=await uploadArsenalAsset(bytes,{weight:a.manifest.weight,license:a.manifest.license},actor);
  if(arsenalHash(stored)!==arsenalHash(a.manifest))throw new Error(`Manifesto armazenado diverge:${a.manifest.id}`);
}
const results:Array<{id:string;hash:string;idempotent:boolean}>=[];
const existing=new Map<string,string>();
if(process.argv.includes("--missing-only")){
  const ids=Array.from(components.keys());
  for(let i=0;i<ids.length;i+=100){
    const rows=await getDb().from("design_components").select("id,definition_hash,status").in("id",ids.slice(i,i+100));
    if(rows.error)throw rows.error;
    for(const row of rows.data??[]){
      if(row.status==="archived")throw new Error(`Componente retido está arquivado:${row.id}`);
      if(components.get(row.id)!.hash!==row.definition_hash)throw new Error(`Hash existente diverge:${row.id}`);
      existing.set(row.id,row.definition_hash);
      results.push({id:row.id,hash:row.definition_hash,idempotent:true});
    }
  }
}
const pending=Array.from(components.values()).filter(c=>!existing.has(c.id));
await withCatalogPublication(async()=>{
for(let i=0;i<pending.length;i+=4){
  results.push(...await Promise.all(pending.slice(i,i+4).map(c=>prepareComponentDraft(c,actor))));
  console.log(JSON.stringify({stage:"component-drafts",processed:results.length,total:components.size,imported:results.length-existing.size}));
}
});
const report={schemaVersion:1,createdAt:new Date().toISOString(),actor,sourceCount:packages.length,assets:assets.size,components:results.length,idempotent:results.filter(r=>r.idempotent).length,published:0,automaticGenerationEligible:false,results};
await fs.writeFile(path.join(root,"import-report.json"),JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({stage:"complete",...report,results:undefined}));
