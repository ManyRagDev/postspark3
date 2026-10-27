import { buildCarouselSets } from "./carouselSets";
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
import { partitionArsenalReadinessIssues } from '../../shared/arsenalReadiness';
import { copyDesignReferences, completeDesignReviewHtml, type DesignReferenceEvidence } from './report';
import { restoreVisualAssets } from './restoreVisualAssets';
import { renderReviewScenes, closeReviewRenderer } from '../../server/ai/workflows/proposalRenderer';
const args=process.argv.slice(2),inputIndex=args.indexOf('--input');
const intake=inputIndex>=0?path.resolve(args[inputIndex+1]):undefined;
const outputIndex=args.indexOf('--output');
const output=path.resolve(outputIndex>=0?args[outputIndex+1]:`artifacts/complete-designs/prepared-${new Date().toISOString().replace(/[:.]/g,'-')}`);
const originalsIndex=args.indexOf('--originals'),originalsDirectory=originalsIndex>=0?path.resolve(args[originalsIndex+1]):undefined;
await fs.mkdir(path.dirname(output),{recursive:true});
await fs.mkdir(output,{recursive:false});
for(const dir of ['packages','assets','recipes','renders','references'])await fs.mkdir(path.join(output,dir));
const authoredSchema=z.object({family:z.string().min(1).max(160),units:z.array(z.object({role:z.enum(['headline','body','eyebrow','sectionLabel','callToAction','label']),fields:z.array(z.string()).min(1),kind:z.enum(['text','list']).optional(),cardinality:z.object({min:z.number().int().nonnegative(),max:z.number().int().positive()}).strict().optional(),prefix:z.string().max(40).optional()}).strict()).min(1),roles:z.array(z.enum(['static','cover','development','list','comparison','example','closing'])).min(1)}).strict();
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
type PreviewEvidence={id:string;hash:string;card:ReturnType<typeof compactComponentCard>;issues:string[];blockingIssues:string[];diagnostics:string[];render:string;sceneHash:string;renderer:'CanvasPostStage'|'diagnostic-without-media'};
type BuildRow=SourceRecord&{status:string;reason?:string;references?:DesignReferenceEvidence;package?:string;componentIds?:string[];previews?:PreviewEvidence[]};
const rows:BuildRow[]=[],assetIds=new Set<string>(),componentIds=new Set<string>(),renders:Array<{title:string;file:string;issues:number;blocking:number}>=[];
try{
for(const input of inputs){
  const {record}=input;
  let references:DesignReferenceEvidence|undefined;
  try{
    if(input.error)throw new Error(input.error);
    const recipe=input.recipe??(await readSource(record)).recipe;
    const before=arsenalHash(recipe);
    references=await copyDesignReferences(record,recipe,output,{originalsDirectory,...(intake?{candidatePath:record.previewPath,previewIsOriginal:true}:{})});
    if(references.original){const {relativePath:_,...metadata}=references.original;record.original=metadata;}
    if(record.destination!=='composition'){rows.push({...record,references,status:'retained-reference-only'});continue;}
    const result=await extractRecipeComponents(record,recipe,true,input.authoring?.units);
    await restoreVisualAssets(result);
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
      if(a.manifest.family&&!GlobalFonts.register(a.bytes,a.manifest.family))throw new Error(`Fonte não registrada: ${a.manifest.family}`);
    }
    const measure=await createComponentTextMeasurer(p.assetFiles.map(a=>a.manifest),async a=>result.assetFiles.find(f=>f.manifest.id===a.id)!.bytes);
    const previews:PreviewEvidence[]=[];
    for(const [componentIndex,originalComponent] of p.components.entries()){
      let c=originalComponent;
      if(componentHash(c)!==c.hash)throw new Error('Hash de design divergente');

      // Review helper materializes exactly one full scene at a time.
      const previewPackage:ComponentPackage={...p,components:[c]};
      const {composition}=buildDraftPreview(previewPackage,'original',measure,{},c.id);
      const readiness=partitionArsenalReadinessIssues(composition.issues);
      const {hash:oldHash,id:oldId,...unchanged}=c;
      const definition={...unchanged,completeDesign:{...c.completeDesign!,baselineVerified:readiness.blocking.length===0}};
      const h=arsenalHash(definition),id=`${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;
      c=createComponentDefinition({...definition,id});p.components[componentIndex]=c;
      for(const adaptation of p.authorship.formatAdaptations??[]){
        if(adaptation.componentId===oldId)adaptation.componentId=id;
        if(adaptation.sourceComponentId===oldId)adaptation.sourceComponentId=id;
      }
      const scene=diagnosticFromComposition(p,composition),usesAuthoredImages=Object.values(c.pieces).some(piece=>piece.imageAssetId);
      let png:Buffer,renderer:PreviewEvidence['renderer'];
      if(usesAuthoredImages){
        const [rendered]=await renderReviewScenes({compositions:[composition],definitions:[c],actor:'local-design-authoring',deadlineMs:Date.now()+30_000,loadAssetBytes:async asset=>{
          const file=result.assetFiles.find(file=>file.manifest.id===asset.id);if(!file)throw new Error(`Asset local indisponível: ${asset.id}`);return file.bytes;
        }});
        if(!rendered?.dataUri.startsWith('data:image/png;base64,'))throw new Error('Renderer real não entregou PNG verificável');
        png=Buffer.from(rendered.dataUri.split(',')[1],'base64');renderer='CanvasPostStage';
      }else{
        png=renderRecipe({...recipe,scene,matrix:undefined,adaptation:{parentRecipeId:recipe.id,layerStyles:composition.elements.filter(e=>e.kind==='rect'||e.kind==='media').map(e=>({layerId:e.id,cornerRadiusPx:e.cornerRadius*arsenalWorldGeometry(e,composition.groups).scale,fit:'preserve' as const}))}},{wrap:true});renderer='diagnostic-without-media';
      }
      const file=`renders/${c.id}.png`;await fs.writeFile(path.join(output,file),png);
      previews.push({id:c.id,hash:c.hash,card:compactComponentCard(c),issues:composition.issues,blockingIssues:readiness.blocking,diagnostics:readiness.diagnostics,render:file,sceneHash:arsenalHash(scene),renderer});
    }
    if(arsenalHash(recipe)!==before)throw new Error('Conversão alterou original');
    if(!input.recipe)await readSource(record);
    const file=`packages/${record.fileHash}.json`;await fs.writeFile(path.join(output,file),JSON.stringify(p,null,2)+'\n');
    for(const c of p.components)componentIds.add(c.id);
    for(const preview of previews){const c=p.components.find(c=>c.id===preview.id)!;renders.push({title:`${c.label} · ${c.fragment.aspectRatio}`,file:preview.render,issues:preview.issues.length,blocking:preview.blockingIssues.length});}
    rows.push({...record,references,status:'complete-design-draft',package:file,componentIds:p.components.map(c=>c.id),previews});
  }catch(e){rows.push({...record,references,status:'blocked',reason:(e as Error).message});}
}
}finally{await closeReviewRenderer();}
if (args.includes('--carousel-variants')) {
  const sources = [];
  for (const row of rows.filter(row => row.package)) {
    const pkg = JSON.parse(await fs.readFile(path.join(output,row.package!), 'utf8')) as ComponentPackage;
    sources.push(...pkg.components.filter(c=>c.completeDesign?.baselineVerified && !c.completeDesign.designGuidance?.carouselVariant));
  }
  try { await buildCarouselSets(sources,path.join(output,'carousel-sets'),asset=>fs.readFile(path.join(output,'assets',asset.sha256))); }
  finally { await closeReviewRenderer(); }
}
const report={format:'postspark.complete-designs.inventory',schemaVersion:1,sourceCount:inputs.length,components:componentIds.size,assets:assetIds.size,blocked:rows.filter(r=>r.status==='blocked').length,published:0,baselinePolicy:'shared-technical-readiness-v1; rendered review required; no fidelity/publication approval',rows,externalCalls:0};
await fs.writeFile(path.join(output,'inventory.json'),JSON.stringify(report,null,2)+'\n');
await fs.writeFile(path.join(output,'REVIEW.html'),completeDesignReviewHtml(rows));
const first=renders.filter(r=>r.title.includes('4:5')).slice(0,12),contact=createCanvas(1200,Math.ceil(first.length/4)*420||420),ctx=contact.getContext('2d');ctx.fillStyle='#17191e';ctx.fillRect(0,0,contact.width,contact.height);
for(const [i,r] of first.entries()){const image=await loadImage(path.join(output,r.file)),x=i%4*300,y=Math.floor(i/4)*420;ctx.drawImage(image,x+8,y+8,284,355);ctx.fillStyle='#FFFFFF';ctx.font='12px sans-serif';ctx.fillText(r.title.slice(0,40),x+8,y+383);ctx.fillText(`${r.issues} issues`,x+8,y+401);}
await fs.writeFile(path.join(output,'CONTACT.png'),contact.toBuffer('image/png'));
console.log(JSON.stringify({output,sourceCount:report.sourceCount,components:report.components,assets:report.assets,blocked:report.blocked,baselineVerified:renders.filter(r=>!r.blocking).length,previewsWithIssues:renders.filter(r=>r.issues).length,published:0}));
