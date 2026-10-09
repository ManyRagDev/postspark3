/** Whole scenes from saved recipes or assisted folder specs. Immutable output; no DB or external model. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { GlobalFonts, createCanvas, loadImage } from '@napi-rs/canvas';
import { z } from 'zod';
import { readCorpus, readSource, sha256, type SourceRecord } from '../componentArsenal/inventory';
import { extractRecipeComponents, type ComponentPackage } from '../componentArsenal/extract';
import { createComponentDefinition, componentHash, compactComponentCard } from '../../shared/componentAssembly';
import { arsenalHash } from '../../shared/arsenalContent';
import { createComponentTextMeasurer } from '../../server/ai/componentTextMeasurer';
import { recipeFromSpec, type CompactSpec } from '../designBatch/builder';
import { buildDraftPreview, diagnosticFromComposition } from '../componentArsenal/preview';
import { installNativeSurface, renderRecipe } from '../designBatch/native';
import { arsenalWorldGeometry } from '../../shared/arsenalGeometry';
import { recreationRecipeSchema, type RecreationRecipe } from '../../shared/designRecreation';
const args=process.argv.slice(2),inputIndex=args.indexOf('--input');
const intake=inputIndex>=0?path.resolve(args[inputIndex+1]):undefined;
const outputIndex=args.indexOf('--output');
const output=path.resolve(outputIndex>=0?args[outputIndex+1]:`artifacts/complete-designs/prepared-${new Date().toISOString().replace(/[:.]/g,'-')}`);
await fs.mkdir(path.dirname(output),{recursive:true});
await fs.mkdir(output,{recursive:false});
for(const dir of ['packages','assets','recipes','renders','references'])await fs.mkdir(path.join(output,dir));
const authoredSchema=z.object({family:z.string().min(1).max(160),units:z.array(z.object({role:z.enum(['headline','body','eyebrow','sectionLabel','callToAction','label']),fields:z.array(z.string()).min(1)}).strict()).min(1),roles:z.array(z.enum(['static','cover','development','example','closing'])).min(1)}).strict();
const inputs:Array<{record:SourceRecord;recipe?:RecreationRecipe;authoring?:z.infer<typeof authoredSchema>;error?:string}>=[];
if(intake){
  const inventory=JSON.parse(await fs.readFile(path.join(intake,'inventory.json'),'utf8'));
  for(const image of inventory.images){
    const record:SourceRecord={id:image.id,referenceId:image.id,category:'assisted-folder',title:image.name,manifestPath:path.join(intake,'inventory.json'),recipePath:'',previewPath:image.sourcePath,fileHash:'',declaredHash:null,sourceApproval:'pending-human-review',sourceFormat:'original',destination:'composition'};
    try{
      const original=await fs.readFile(image.sourcePath);if(sha256(original)!==image.sha256)throw new Error('Imagem de origem mudou após inventário');
      const authoring=authoredSchema.parse(JSON.parse(await fs.readFile(path.join(intake,'authoring',`${image.id}.json`),'utf8')));
      const spec:CompactSpec=JSON.parse(await fs.readFile(path.join(intake,'specs',`${image.id}.json`),'utf8'));
      // Source identity comes from verified disk bytes, never from an authored hash.
      const recipe=recreationRecipeSchema.parse(recipeFromSpec({...spec,sourcePath:image.sourcePath,originalHash:image.sha256}));
      record.title=recipe.title;record.referenceId=authoring.family;
      const bytes=JSON.stringify(recipe,null,2)+'\n';record.fileHash=sha256(bytes);record.recipePath=path.join(output,'recipes',`${image.id}.json`);
      await fs.writeFile(record.recipePath,bytes);inputs.push({record,recipe,authoring});
    }catch(e){inputs.push({record,error:(e as Error).message});}
  }
}else for(const record of await readCorpus())inputs.push({record});
installNativeSurface();
const rows:Array<Record<string,unknown>>=[],assetIds=new Set<string>(),componentIds=new Set<string>(),renders:Array<{title:string;file:string;original:string;issues:number}>=[];
for(const input of inputs){
  const {record}=input;
  if(record.destination!=='composition'){rows.push({...record,status:'retained-reference-only'});continue;}
  try{
    if(input.error)throw new Error(input.error);
    const recipe=input.recipe??(await readSource(record)).recipe;
    const before=arsenalHash(recipe);
    const sourcePreview=await fs.readFile(record.previewPath),original=`references/${record.fileHash}${path.extname(record.previewPath)||'.png'}`;
    await fs.writeFile(path.join(output,original),sourcePreview);
    const result=await extractRecipeComponents(record,recipe,true,input.authoring?.units);
    const p=result.package;
    if(input.authoring){
      p.components=p.components.map(c=>{
        const {hash:_,id:__,...base}=c,definition={...base,roles:input.authoring!.roles};
        // Identity changes with declared role contract; approval cannot leak across revisions.
        const h=arsenalHash(definition),id=`${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;
        return createComponentDefinition({...definition,id});
      });
    }
    for(const a of result.assetFiles){
      await fs.writeFile(path.join(output,a.relativePath),a.bytes);assetIds.add(a.manifest.id);
      if(!GlobalFonts.register(a.bytes,a.manifest.family!))throw new Error(`Fonte não registrada: ${a.manifest.family}`);
    }
    const measure=await createComponentTextMeasurer(p.assetFiles.map(a=>a.manifest),async a=>result.assetFiles.find(f=>f.manifest.id===a.id)!.bytes);
    const previews=[];
    for(const [componentIndex,originalComponent] of p.components.entries()){
      let c=originalComponent;
      if(componentHash(c)!==c.hash)throw new Error('Hash de design divergente');

      // Review helper materializes exactly one full scene at a time.
      const previewPackage:ComponentPackage={...p,components:[c]};
      const {composition}=buildDraftPreview(previewPackage,'original',measure,{},c.id);
      const {hash:oldHash,id:oldId,...unchanged}=c;
      const definition={...unchanged,completeDesign:{...c.completeDesign!,baselineVerified:composition.issues.length===0}};
      const h=arsenalHash(definition),id=`${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;
      c=createComponentDefinition({...definition,id});p.components[componentIndex]=c;componentIds.add(c.id);
      for(const adaptation of p.authorship.formatAdaptations??[]){
        if(adaptation.componentId===oldId)adaptation.componentId=id;
        if(adaptation.sourceComponentId===oldId)adaptation.sourceComponentId=id;
      }
      const scene=diagnosticFromComposition(p,composition),png=renderRecipe({...recipe,scene,matrix:undefined,adaptation:{parentRecipeId:recipe.id,layerStyles:composition.elements.filter(e=>e.kind==='rect'||e.kind==='media').map(e=>({layerId:e.id,cornerRadiusPx:e.cornerRadius*arsenalWorldGeometry(e,composition.groups).scale,fit:'preserve' as const}))}},{wrap:true});
      const file=`renders/${c.id}.png`;await fs.writeFile(path.join(output,file),png);
      previews.push({id:c.id,hash:c.hash,card:compactComponentCard(c),issues:composition.issues,render:file,sceneHash:arsenalHash(scene)});
      renders.push({original,title:`${c.label} · ${c.fragment.aspectRatio}`,file,issues:composition.issues.length});
    }
    if(arsenalHash(recipe)!==before)throw new Error('Conversão alterou original');
    if(!input.recipe)await readSource(record);
    const file=`packages/${record.fileHash}.json`;await fs.writeFile(path.join(output,file),JSON.stringify(p,null,2)+'\n');
    rows.push({...record,status:'complete-design-draft',package:file,componentIds:p.components.map(c=>c.id),previews});
  }catch(e){rows.push({...record,status:'blocked',reason:(e as Error).message});}
}
const report={format:'postspark.complete-designs.inventory',schemaVersion:1,sourceCount:inputs.length,components:componentIds.size,assets:assetIds.size,blocked:rows.filter(r=>r.status==='blocked').length,published:0,rows,externalCalls:0};
await fs.writeFile(path.join(output,'inventory.json'),JSON.stringify(report,null,2)+'\n');
const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
await fs.writeFile(path.join(output,'REVIEW.html'),`<!doctype html><meta charset="utf-8"><title>Designs completos</title><style>body{background:#17191e;color:#eee;font:15px system-ui;margin:32px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:24px}img{width:100%}figure{margin:0}figcaption{padding:12px}</style><h1>Designs completos · revisão</h1><p>${report.components} variantes, ${report.blocked} bloqueios. Preview de conversão com copy original. Slots de imagem vazios. Issues técnicas permanecem visíveis; nenhum design foi publicado ou aprovado automaticamente.</p><div class="grid">${renders.map(r=>`<figure><img src="${r.original}" alt="Prévia original"><img src="${r.file}" alt="Conversão completa"><figcaption>${escape(r.title)} · ${r.issues} issues</figcaption></figure>`).join('')}</div>`);
const first=renders.filter(r=>r.title.includes('4:5')).slice(0,12),contact=createCanvas(1200,Math.ceil(first.length/4)*420||420),ctx=contact.getContext('2d');ctx.fillStyle='#17191e';ctx.fillRect(0,0,contact.width,contact.height);
for(const [i,r] of first.entries()){const image=await loadImage(path.join(output,r.file)),x=i%4*300,y=Math.floor(i/4)*420;ctx.drawImage(image,x+8,y+8,284,355);ctx.fillStyle='#FFFFFF';ctx.font='12px sans-serif';ctx.fillText(r.title.slice(0,40),x+8,y+383);ctx.fillText(`${r.issues} issues`,x+8,y+401);}
await fs.writeFile(path.join(output,'CONTACT.png'),contact.toBuffer('image/png'));
console.log(JSON.stringify({output,sourceCount:report.sourceCount,components:report.components,assets:report.assets,blocked:report.blocked,baselineVerified:renders.filter(r=>!r.issues).length,previewsWithIssues:renders.filter(r=>r.issues).length,published:0}));
