/** Phase-2 acceptance: immutable corpus + one bounded copy per new content, no LLM/network. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { GlobalFonts } from "@napi-rs/canvas";
import { arsenalHash } from "../../shared/arsenalContent";
import { componentHash, componentDefinitionV1Schema, assemblyIdentity, materializeAssemblySlide, compositionFromAssemblyBundle, type AssemblyPlanV1 } from "../../shared/componentAssembly";
import { resolveArsenalGeometry, arsenalWorldGeometry } from "../../shared/arsenalGeometry";
import { createComponentTextMeasurer } from "../../server/ai/componentTextMeasurer";
import { diagnosticFromComposition } from "./preview";
import { installNativeSurface, renderRecipe } from "../designBatch/native";
import type { ComponentPackage } from "./extract";

const root=path.resolve(process.argv[2]),baseline=path.resolve(process.argv[3]??"artifacts/component-arsenal/revision-7-cta");
const readPackages=async(dir:string):Promise<ComponentPackage[]>=>{
  const i=JSON.parse(await fs.readFile(path.join(dir,"inventory.json"),"utf8"));
  assert.equal(i.blocked,0);
  return Promise.all(i.rows.filter((r:any)=>r.package).map((r:any)=>fs.readFile(path.join(dir,r.package),"utf8").then(JSON.parse)));
};
const packages=await readPackages(root),previous=await readPackages(baseline),old=new Map(previous.flatMap(p=>p.components.map(c=>[c.id,c.hash] as const))),all=new Map(packages.flatMap(p=>p.components.map(c=>[c.id,c] as const)));
for(const [id,hash]of old)assert.equal(all.get(id)?.hash,hash,`Previous definition changed:${id}`);
for(const p of packages){
  assert.equal(arsenalHash(p.sourceSnapshot.recipe),p.source.recipeHash);
  for(const c of p.components){componentDefinitionV1Schema.parse(c);assert.equal(componentHash(c),c.hash);}
}
const added=Array.from(all.values()).filter(c=>!old.has(c.id)),assets=new Map(packages.flatMap(p=>p.assetFiles.map(a=>[a.manifest.id,a] as const)));
const bytes=async(a:any)=>fs.readFile(path.join(root,assets.get(a.id)!.relativePath));
const measure=await createComponentTextMeasurer(Array.from(assets.values()).map(a=>a.manifest),bytes);
for(const a of assets.values())assert.ok(GlobalFonts.register(await bytes(a.manifest),a.manifest.family!));
const checks:Array<Record<string,unknown>>=[];
const previews=new Set<string>();await fs.mkdir(path.join(root,"vocabulary-previews"),{recursive:true});
for(const c of added.filter(c=>c.kind==="content")){
  const p=packages.find(p=>p.components.some(candidate=>candidate.id===c.id))!;
  assert.equal(c.source.kind,"recipe");
  if(c.source.kind!=="recipe")throw new Error("Recipe provenance required");
  const role:"development"|"closing"=c.roles.includes("development")?"development":"closing";
  const content={schemaVersion:3 as const,blocks:[{id:"heading",type:"text" as const,role:"headline" as const,text:"Uma ideia ganha força com direção visual"},{id:"body",type:"text" as const,role:"body" as const,text:"Contraste, ritmo e hierarquia ajudam a organizar a mensagem e mostrar o próximo passo."},{id:"cta",type:"text" as const,role:"callToAction" as const,text:"Experimente estas ideias no seu próximo post."}],caption:"Prévia técnica, aprovação visual pendente.",hashtags:[]};
  content.blocks=content.blocks.filter(b=>c.fragment.bindings.some(binding=>binding.source===`block:${b.role}:0:text`));
  const variation={id:"review",direction:{label:c.label,palette:{background:c.fragment.artboard.background,text:"#111111",accent:"#5740B4"},typographyComponentId:null},caption:content.caption,hashtags:[],slides:[{id:"review-slide",role,density:"expressive" as const,content,components:[{id:c.id,hash:c.hash}],mediaPrompts:[]}]};
  const plan:AssemblyPlanV1={schemaVersion:1,postMode:"carousel",aspectRatio:c.fragment.aspectRatio,variations:[variation,variation,variation]};
  const bundle=materializeAssemblySlide(plan,0,0,[c],{traceId:assemblyIdentity(c.id),runId:assemblyIdentity([c.id,"review"]),experimental:true});
  const composition=resolveArsenalGeometry(compositionFromAssemblyBundle(bundle),{measureText:measure,allowReduction:false});
  checks.push({id:c.id,referenceId:c.source.referenceId,role,aspectRatio:c.fragment.aspectRatio,state:composition.state,issues:composition.issues});
  // Three distinct identities, not a full corpus render matrix.
  if(previews.size<3&&!previews.has(c.source.referenceId!)){
    previews.add(c.source.referenceId!);installNativeSurface();
    const scene=diagnosticFromComposition(p,composition),recipe={...p.sourceSnapshot.recipe,scene,matrix:undefined,adaptation:undefined};
    await fs.writeFile(path.join(root,"vocabulary-previews",`${c.source.referenceId}.png`),renderRecipe(recipe,{wrap:true}));
  }
}
const ornament=added.find(c=>c.kind==="ornament"&&c.fragment.aspectRatio==="4:5");
if(ornament){
  const base=Array.from(all.values()).find(c=>c.kind==="content"&&c.fragment.aspectRatio==="4:5")!;
  const content={schemaVersion:3 as const,blocks:[{id:"heading",type:"text" as const,role:"headline" as const,text:"Uma ideia ganha força com direção visual"}],caption:"",hashtags:[]};
  const v={id:"placement",direction:{label:"Motif",palette:{background:"#FFFFFF",text:"#111111",accent:"#5740B4"},typographyComponentId:null},caption:"",hashtags:[],slides:[{id:"placement",role:"static" as const,density:"balanced" as const,content,components:[{id:base.id,hash:base.hash},{id:ornament.id,hash:ornament.hash,placement:{x:.1,y:.1,width:.25,height:.25}}],mediaPrompts:[]}]};
  const plan:AssemblyPlanV1={schemaVersion:1,postMode:"static",aspectRatio:"4:5",variations:[v,v,v]};
  const bundle=materializeAssemblySlide(plan,0,0,[base,ornament],{traceId:assemblyIdentity(ornament.id),runId:assemblyIdentity([ornament.id,"placement"]),experimental:true});
  const f=bundle.candidates[0].variant,points=f.instances.filter(i=>i.parentId?.startsWith("c1-")).flatMap(i=>{const w=arsenalWorldGeometry({...i,label:i.id,scale:1},f.groups),a=w.rotation*Math.PI/180;return [[0,0],[i.width,0],[0,i.height],[i.width,i.height]].map(([x,y])=>({x:w.x+w.scale*(x*Math.cos(a)-y*Math.sin(a)),y:w.y+w.scale*(x*Math.sin(a)+y*Math.cos(a))}));});
  assert.ok(points.length);
  assert.ok(points.every(p=>p.x>=108-0.01&&p.x<=378+0.01&&p.y>=135-0.01&&p.y<=472.5+0.01),"Ornament must occupy the requested motif frame");
}
const failed=checks.filter(c=>(c.issues as string[]).length);
const report={schemaVersion:1,retained:old.size,added:added.length,byKind:Object.fromEntries(["ornament","content"].map(k=>[k,added.filter(c=>c.kind===k).length])),sourceHashes:"verified",definitionHashes:"verified",placement:ornament?"verified":"missing-ornament",checks,failed:failed.length,previews:[...previews],browserValidation:"pending",publication:"draft-only"};
await fs.writeFile(path.join(root,"VOCABULARY_CHECKS.json"),JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({...report,checks:undefined}));
assert.equal(failed.length,0,"New content geometry needs repair; see VOCABULARY_CHECKS.json");
