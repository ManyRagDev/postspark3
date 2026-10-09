import { create as readFont } from "fontkit";
import { arsenalHash } from "../../shared/arsenalContent";
import { arsenalPieceSchema, arsenalVariantSchema, ARSENAL_VARIABLE_COMPILER, type ArsenalAsset, type PieceDefinitionV2, type ResolvedVariantDefinitionV2 } from "../../shared/designArsenal";
import { createComponentDefinition, type ComponentDefinitionV1 } from "../../shared/componentAssembly";
import type { RecreationRecipe } from "../../shared/designRecreation";
import { verifyArsenalAsset } from "../../server/designCatalog/arsenalAssets";
import { authorRecipe, AUTHORING_VERSION, type Unit } from "./authoring";
import { sha256, type SourceRecord } from "./inventory";
import {semanticComponents,type SemanticPreview} from "./semanticComponents";
import {aspectRatioDimensions} from "../../shared/aspectRatios";
import {portraitAdaptations,type FormatAdaptation} from "./portraitAdaptations";
import {authorQuietIdentity} from "./quietIdentity";
import {ornamentComponents} from "./ornamentComponents";
import {curatedArtComponents} from "./curatedArtComponents";
import {carouselIdentityComponents} from "./carouselIdentityComponents";

export const EXTRACTOR_VERSION = "recipe-component-arsenal-v4-curated-art";
export type AssetFile = { manifest: ArsenalAsset; bytes: Buffer; relativePath: string; sourceHash: string; sourceFamily: string; sourceWeight: number; resolvedWeight: number; sourceUrl: string | null; adjustment: string | null };
export type ComponentPackage = {
  format: "postspark.component-arsenal.package"; schemaVersion: 1; source: SourceRecord & { recipeHash:string };
  status:"draft"; automaticGenerationEligible:false; sourceSnapshot:{recipe:RecreationRecipe;previewPath:string};
  components:ComponentDefinitionV1[];
  assetFiles:Array<Omit<AssetFile,"bytes">>;
  authorship:{version:string;units:ReturnType<typeof authorRecipe>;limitations:string[];semanticSamples?:SemanticPreview[];formatAdaptations?:FormatAdaptation[]};
};
const UUID = (seed:string) => { const h=sha256(seed);return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`; };
/** Definitions are immutable: any authored geometry, font, role or capability change creates a new ID. */
const authoredComponent=(input:Parameters<typeof createComponentDefinition>[0])=>{
  const {id:ignored,...definition}=input;
  return createComponentDefinition({...definition,id:UUID(arsenalHash(definition))});
};
export async function extractRecipeComponents(record:SourceRecord,recipe:RecreationRecipe,completeDesignOnly=false,explicitUnits?:Unit[]):Promise<{package:ComponentPackage;assetFiles:AssetFile[]}> {
  if (!recipe.matrix) throw new Error("Receita sem matriz");
  if(recipe.scene.layers.some(l=>l.kind==="arcText"))throw new Error("Texto em arco requer autoria/capacidade específica; não descartar.");
  const units=authorRecipe(record,recipe,explicitUnits), assetFiles:AssetFile[]=[],fontMap=new Map<string,AssetFile>();
  for(const f of recipe.scene.fonts){
    if(!f.dataUrl || !f.sha256)throw new Error(`Bytes/hash ausentes:${f.family}`);
    const bytes=Buffer.from(f.dataUrl.split(",")[1],"base64");if(sha256(bytes)!==f.sha256)throw new Error(`Hash divergente:${f.family}`);
    const font=readFont(bytes);if("fonts" in font)throw new Error("Coleção de fontes sem autoria");
    const metrics=font as typeof font & {"OS/2"?:{usWeightClass?:number};variationAxes?:Record<string,{min:number;max:number}>};
    const axis=metrics.variationAxes?.wght, actual=metrics["OS/2"]?.usWeightClass??400;
    if(axis && (f.weight<axis.min || f.weight>axis.max))throw new Error(`Peso fora do eixo:${f.family}:${f.weight}`);
    // One immutable manifest per byte hash. Variable weight belongs to each text piece.
    const resolvedWeight=axis ? Math.min(axis.max,Math.max(axis.min,actual)) : actual;
    const checked=await verifyArsenalAsset(bytes,{weight:resolvedWeight,license:f.license});
    const manifest=axis ? {...checked.manifest,weightRange:{min:axis.min,max:axis.max}} : checked.manifest;
    const file:AssetFile={manifest,bytes,relativePath:`assets/${manifest.sha256}`,sourceHash:f.sha256,sourceFamily:f.family,sourceWeight:f.weight,resolvedWeight,sourceUrl:f.sourceUrl,
      adjustment:axis ? "Fonte variável: peso verificado na peça; manifesto usa peso nominal dos bytes." : resolvedWeight!==f.weight ? `Peso declarado ${f.weight} corrigido para o peso real ${resolvedWeight}; revisão visual necessária.` : null};
    fontMap.set(`${f.family}:${f.weight}`,file);if(!assetFiles.some(a=>a.manifest.id===manifest.id))assetFiles.push(file);
  }
  if(record.destination==="font-study") return {package:{format:"postspark.component-arsenal.package",schemaVersion:1,source:{...record,recipeHash:arsenalHash(recipe)},status:"draft",automaticGenerationEligible:false,sourceSnapshot:{recipe:structuredClone(recipe),previewPath:record.previewPath},components:[],assetFiles:assetFiles.map(({bytes,...f})=>f),authorship:{version:AUTHORING_VERSION,units,limitations:["Estudo de fontes preservado; fontes anunciadas não foram identificadas/incorporadas e não entram como template."]}},assetFiles};
  const ratio=recipe.scene.source.widthPx/recipe.scene.source.heightPx;
  const aspectRatio:ResolvedVariantDefinitionV2["aspectRatio"]=Math.abs(ratio-1)<.01?"1:1":Math.abs(ratio-.8)<.01?"4:5":Math.abs(ratio-5/6)<.01?"5:6":Math.abs(ratio-9/16)<.01?"9:16":"5:6";
  const W=recipe.scene.source.widthPx,H=recipe.scene.source.heightPx;
  const pieces:Record<string,PieceDefinitionV2>={},instances:ResolvedVariantDefinitionV2["instances"]=[],bindings:ResolvedVariantDefinitionV2["bindings"]=[],relations:ResolvedVariantDefinitionV2["relations"]=[];
  const groupId=(id:string)=>`g-${id}`;
  const groups:ResolvedVariantDefinitionV2["groups"]=recipe.matrix.groups.map(g=>({id:groupId(g.id),label:g.label,parentId:null,zIndex:Math.min(...g.members.map(m=>recipe.scene.layers.find(l=>l.id===m.layerId)!.zIndex)),x:g.transform.x,y:g.transform.y,width:W,height:H,rotation:g.transform.rotationDeg,opacity:1,scale:1}));
  const mediaIds=new Set(recipe.matrix.media.map(m=>m.layerId)),textIds=new Set(units.flatMap(u=>u.layerIds));
  for(const l of recipe.scene.layers){
    const group=recipe.matrix.groups.find(g=>g.members.some(m=>m.layerId===l.id)),angle=(group?.transform.rotationDeg??0)*Math.PI/180;
    const lx=l.x-(group?.transform.x??0),ly=l.y-(group?.transform.y??0),font=fontMap.get(`${l.fontFamily}:${l.fontWeight}`);
    if(l.kind==="text" && !font)throw new Error(`Fonte da camada não resolvida:${l.id}`);
    const unit=units.find(u=>u.layerIds.includes(l.id)),fragmentIndex=unit?.layerIds.indexOf(l.id)??0;
    const piece=arsenalPieceSchema.parse({kind:mediaIds.has(l.id)?"media":l.kind,fill:l.fill,stroke:l.strokeColor,strokeWidth:l.strokeWidth,
      cornerRadius:recipe.adaptation?.layerStyles.find(s=>s.layerId===l.id)?.cornerRadiusPx??0,points:l.points,
      fontFamily:font?.manifest.family??"Arial",fontAssetId:font?.manifest.id??null,fontSize:l.fontSize,
      fontWeight:font?.adjustment?.startsWith("Peso declarado")?font.resolvedWeight:l.fontWeight,align:l.align,lineHeight:l.lineHeight,letterSpacing:l.letterSpacing,
      ...(record.referenceId==="chromatic-block"&&l.id.startsWith("cd-sticker-rot")?{fill:"#9B1F16"}:{}),
      fixedText:l.kind==="text"&&!textIds.has(l.id)?l.text:null,...(l.kind==="text"&&!textIds.has(l.id)?{fixedTextRole:"ornament"}:{}),
      ...(unit&&unit.layerIds.length>1?{contentFragment:{index:fragmentIndex,count:unit.layerIds.length,unit:"words",weights:unit.weights}}:{}),
      ...(l.extrusion?{extrusion:l.extrusion}:{})});
    const pieceHash=arsenalHash(piece);pieces[pieceHash]=piece;
    instances.push({id:l.id,pieceHash,parentId:group?groupId(group.id):null,zIndex:l.zIndex,x:lx*Math.cos(angle)+ly*Math.sin(angle),y:-lx*Math.sin(angle)+ly*Math.cos(angle),width:Math.max(1,l.width),height:Math.max(1,l.height),rotation:l.rotationDeg-(group?.transform.rotationDeg??0),opacity:l.opacity});
    if(unit)relations.push({id:`fit-${l.id}`,kind:"textFit",version:1,enabled:true,inputs:[],outputs:[{targetId:l.id,properties:["x","width","height","fontSize"]}],parameters:{anchor:l.align,maxWidth:Math.max(1,l.width),maxHeight:Math.max(1,l.height),minFontSize:l.fontSize*unit.minScale}});
  }
  units.forEach((u,i)=>bindings.push({id:`authored-${i}`,label:`${u.role}: ${u.fields.join(", ")}`,source:u.source,kind:"text",required:u.required,targetIds:u.layerIds,cardinality:null,prefix:"",gap:0}));
  for(const m of recipe.matrix.media)bindings.push({id:m.id,label:m.label,source:"media.primary",kind:"media",required:false,targetIds:[m.layerId],cardinality:null,prefix:"",gap:0});
  const variantKey=`${aspectRatio.replace(":","x")}-${record.fileHash.slice(0,12)}`;
  const mediaSlots=recipe.matrix.media.map(m=>({id:m.layerId,label:m.label,function:"user-replaceable-image",prompt:completeDesignOnly?`Imagem para ${m.label}, respeitando a área de mídia do design ${record.title}.`:"",deferred:true,policy:"cover" as const}));
  const limitations=["Rascunho de componentes: revisão visual humana e publicação pendentes.","Geometria autorada preservada. Encaixe limitado às caixas de origem; overflow deve permanecer explícito.","Fragmentos distribuem palavras completas por capacidade declarada; quebra intrapalavra do exemplo não é reutilizada.","Fotos de demonstração permanecem apenas no snapshot de origem; slots aguardam mídia do usuário."];
  if(record.referenceId==="chromatic-block")limitations.push("Label do sticker recebe cor autorada #9B1F16 para contraste; dimensão/fundo preservados, original #D92E1E intacto no snapshot. Aprovação própria pendente.");
  const adjacentLineBoxes:Record<string,[string,string][]>= {f65e1862777e3c9e201442396155f3fa:[["line1","line2"],["line2","line3"]],"6da56cf3eb349b1ef42ab98eaf610f05":[["lista-1","lista-2"],["lista-2","lista-3"]]};
  const lineBoxOverlaps=adjacentLineBoxes[record.referenceId]?.map(([a,b])=>({a,b,maxOverlapFraction:.25,singleLineOnly:true as const}));
  const full=arsenalVariantSchema.parse({variantKey,aspectRatio,compilerVersion:ARSENAL_VARIABLE_COMPILER,artboard:{width:W,height:H,background:recipe.scene.artboard.background},instances,groups,bindings,relations,assetIds:assetFiles.map(f=>f.manifest.id),capabilities:["text","rect","line","polygon","media","groups","relations","content-fragments","extrusion"],intentionalOverlaps:[],limitations,...(mediaSlots.length?{mediaSlots}:{}),...(lineBoxOverlaps?{lineBoxOverlaps}:{})});
  const source={kind:"recipe" as const,recipeHash:arsenalHash(recipe),fileHash:record.fileHash,referenceId:record.referenceId,variantKey};
  const components:ComponentDefinitionV1[]=[];
  if(completeDesignOnly){
    if(record.destination!=="composition")throw new Error("A referência não é uma composição reutilizável");
    if(!units.some(u=>u.role==="headline"))throw new Error("Design completo sem campo de título autorado");
    const definition=authoredComponent({schemaVersion:1,id:UUID(`${source.recipeHash}:complete`),kind:"content",
      completeDesign:{family:record.referenceId,colors:Array.from(new Set([full.artboard.background,...Object.values(pieces).map(p=>p.fill)])).filter(c=>/^#[a-f\d]{6}$/i.test(c)).slice(0,100)},label:record.title,
      description:"Design completo: fundo, fontes, camadas, grupos e slots nativos. Personalizar somente os campos declarados.",
      source,roles:["static","cover","development","example","closing"],densities:["balanced"],aspectRatios:[aspectRatio],
      fragment:full,pieces,assets:assetFiles.map(f=>f.manifest),
      colorRoles:Object.fromEntries(instances.map(i=>[i.id,"preserve" as const]))});
    const p:ComponentPackage={format:"postspark.component-arsenal.package",schemaVersion:1,source:{...record,recipeHash:source.recipeHash},
      status:"draft",automaticGenerationEligible:false,sourceSnapshot:{recipe:structuredClone(recipe),previewPath:record.previewPath},
      components:[definition],assetFiles:assetFiles.map(({bytes,...f})=>f),authorship:{version:"complete-design-v1",units,limitations}};
    const portrait=portraitAdaptations(p);p.components.push(...portrait.components);
    if(portrait.provenance.length)p.authorship.formatAdaptations=portrait.provenance;
    return {package:p,assetFiles};
  }
  const backgroundIds=new Set(instances.filter(i=>!textIds.has(i.id)&&!mediaIds.has(i.id)&&/^(grade[-_]|grid[-_]|grid$|bg[-_]|background|photo-scrim|scrim)/i.test(i.id)).map(i=>i.id));
  const select=(kind:"background"|"content"|"typography"|"media"|"ornament",ids:Set<string>)=>{
    const selected=instances.filter(i=>ids.has(i.id)),groupIds=new Set(selected.map(i=>i.parentId).filter(Boolean));
    const fragment={...full,instances:selected,groups:groups.filter(g=>groupIds.has(g.id)),bindings:bindings.map(b=>({...b,targetIds:b.targetIds.filter(id=>ids.has(id))})).filter(b=>b.targetIds.length),relations:relations.filter(r=>r.outputs.every(o=>ids.has(o.targetId))&&r.inputs.every(id=>ids.has(id))),...(mediaSlots.length?{mediaSlots:mediaSlots.filter(m=>ids.has(m.id))}: {})};
    if(fragment.lineBoxOverlaps){fragment.lineBoxOverlaps=fragment.lineBoxOverlaps.filter(pair=>ids.has(pair.a)&&ids.has(pair.b));if(!fragment.lineBoxOverlaps.length)delete fragment.lineBoxOverlaps;}
    const usedPieces=Object.fromEntries(selected.map(i=>[i.pieceHash,pieces[i.pieceHash]]));
    const usedAssets=new Set(Object.values(usedPieces).map(p=>p.fontAssetId).filter(Boolean));fragment.assetIds=assetFiles.filter(f=>usedAssets.has(f.manifest.id)).map(f=>f.manifest.id);
    const colorRoles=Object.fromEntries(selected.map(i=>[i.id,kind==="background"?"background":pieces[i.pieceHash].kind==="text"?"preserve":"preserve"]));
    components.push(authoredComponent({schemaVersion:1,id:UUID(`${source.recipeHash}:${kind}:${variantKey}`),kind,label:`${record.title} · ${kind}`,description:`Componente da receita curada ${record.referenceId}; autoria ${AUTHORING_VERSION}.`,source,
      roles:kind==="content"?["static","cover","example"]:["static","cover","development","list","comparison","example","closing"],densities:["balanced","expressive"],aspectRatios:[aspectRatio],fragment,pieces:usedPieces,assets:assetFiles.filter(f=>usedAssets.has(f.manifest.id)).map(f=>f.manifest),decorativeIntensity:kind==="content"?.8:kind==="background"?.35:0,colorRoles:colorRoles as Record<string,"background"|"preserve">}));
  };
  if(record.destination==="composition"){
    if(!backgroundIds.size){
      const p=arsenalPieceSchema.parse({kind:"rect",fill:full.artboard.background,stroke:null,strokeWidth:0,cornerRadius:0,points:[],fontFamily:"Arial",fontAssetId:null,fontSize:12,fontWeight:400,align:"left",lineHeight:1,letterSpacing:0,fixedText:null});
      const hash=arsenalHash(p);pieces[hash]=p;instances.push({id:"authored-solid-background",pieceHash:hash,parentId:null,zIndex:-1000,x:0,y:0,width:W,height:H,rotation:0,opacity:1});backgroundIds.add("authored-solid-background");
    }
    select("background",backgroundIds);
    select("content",new Set(instances.filter(i=>!backgroundIds.has(i.id)&&!mediaIds.has(i.id)).map(i=>i.id)));
    const headlineIds=new Set(units.filter(u=>u.role==="headline").flatMap(u=>u.layerIds));if(headlineIds.size)select("typography",headlineIds);
    // Explicit quiet adaptation for development/closing. This is a new draft, never source approval.
    const quietUnits=[...units.filter(u=>u.role==="headline").slice(0,1),...units.filter(u=>u.role==="body").slice(0,2),...units.filter(u=>u.role==="callToAction").slice(0,1)];
    if(!quietUnits.some(u=>u.role==="body")){
      const style=units[0];quietUnits.splice(1,0,{...style,role:"body",fields:[],source:"block:body:0:text",sampleText:"Uma ideia clara ajuda a organizar as informações e escolher o próximo passo.",required:false});
    }
    if(!quietUnits.some(u=>u.role==="callToAction")){
      const style=units.find(u=>u.role==="body")??units[0];
      quietUnits.push({...style,role:"callToAction",fields:[],source:"block:callToAction:0:text",sampleText:"Conheça as opções e escolha o próximo passo.",required:false});
    }
    const quietPieces:Record<string,PieceDefinitionV2>={},quietInstances:ResolvedVariantDefinitionV2["instances"]=[],quietBindings:ResolvedVariantDefinitionV2["bindings"]=[],quietRelations:ResolvedVariantDefinitionV2["relations"]=[];
    const rgb=full.artboard.background.slice(1).match(/../g)!.map(s=>parseInt(s,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4),light=rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
    let y=H*.12;
    for(const [i,u]of quietUnits.entries()){
      const original=instances.find(l=>l.id===u.layerIds[0])!,basePiece=pieces[original.pieceHash];
      const target=aspectRatioDimensions[aspectRatio],projectionScale=Math.min(target.width/W,target.height/H);
      const id=`quiet-${i}`,headline=u.role==="headline",isLongPortrait=record.referenceId==="19025ac85b33580e27126420174e7514",fontSize=Math.max(headline?W*.078:isLongPortrait?W*.026:W*.031,projectionScale<1?36.4/projectionScale:0);
      const {contentFragment:unusedFragment,extrusion:unusedExtrusion,textFragments:unusedRuns,...style}=basePiece;
      const p=arsenalPieceSchema.parse({...style,fontSize,lineHeight:headline?1.12:1.35,fill:light>.179?"#000000":"#FFFFFF",stroke:null,strokeWidth:0,align:"left",letterSpacing:0,fixedText:null});
      const pieceHash=arsenalHash(p);quietPieces[pieceHash]=p;
      const maxHeight=headline?(record.referenceId==="data-punch"&&aspectRatio==="1:1"?H*.34:H*.22):u.role==="callToAction"?H*.15:isLongPortrait?H*.62:H*.25;
      quietInstances.push({id,pieceHash,parentId:null,zIndex:i,x:W*.14,y,width:W*.72,height:maxHeight,rotation:0,opacity:1});
      quietBindings.push({id:`quiet-binding-${i}`,label:`${u.role} — adaptação sem ornamentos`,kind:"text",source:u.source,required:u.required,targetIds:[id],cardinality:null,prefix:"",gap:0});
      quietRelations.push({id:`quiet-fit-${i}`,kind:"textFit",version:1,enabled:true,inputs:[],outputs:[{targetId:id,properties:["x","width","height","fontSize"]}],parameters:{anchor:"left",maxWidth:W*.72,maxHeight,minFontSize:fontSize*.82}});
      y+=maxHeight+H*.035;
    }
    quietRelations.push({id:"quiet-flow",kind:"verticalFlow",version:1,enabled:true,inputs:quietInstances.map(i=>i.id),outputs:quietInstances.map(i=>({targetId:i.id,properties:["y"]})),parameters:{startY:H*.12,gap:H*.055}});
    const identity=authorQuietIdentity(record,full,pieces,quietPieces,quietInstances,quietRelations);
    const quietAssetIds=new Set(Object.values(quietPieces).map(p=>p.fontAssetId).filter(Boolean));
    const quietAssets=assetFiles.filter(f=>quietAssetIds.has(f.manifest.id)).map(f=>f.manifest);
    const {lineBoxOverlaps:unusedLineExceptions,...quietBase}=full;
    const quietFragment=arsenalVariantSchema.parse({...quietBase,variantKey:`${variantKey}-quiet`,instances:quietInstances,groups:[],bindings:quietBindings,relations:quietRelations,assetIds:quietAssets.map(a=>a.id),mediaSlots:[],limitations:[...limitations,"Adaptação quiet autorada para leitura; conserva fontes e responsabilidades, reduz superfícies, rotações e extrusões. Requer aprovação própria."]});
    components.push(authoredComponent({schemaVersion:1,id:UUID(`${source.recipeHash}:content-quiet:${variantKey}`),kind:"content",label:`${record.title} · ${identity??"leitura"}`,description:"Adaptação de desenvolvimento/encerramento com título, até dois blocos de leitura, CTA opcional e suporte visual real quando autorado, vinculados ao fluxo.",source:{...source,variantKey:quietFragment.variantKey},roles:["static","cover","development","example","closing"],densities:["quiet","balanced"],aspectRatios:[aspectRatio],fragment:quietFragment,pieces:quietPieces,assets:quietAssets,decorativeIntensity:identity?.18:0,colorRoles:Object.fromEntries(quietInstances.map(i=>[i.id,quietPieces[i.pieceHash].kind==="text"?"text" as const:"preserve" as const]))}));
  }
  if(mediaIds.size)select("media",mediaIds);
  const p:ComponentPackage={format:"postspark.component-arsenal.package",schemaVersion:1,source:{...record,recipeHash:source.recipeHash},status:"draft",automaticGenerationEligible:false,sourceSnapshot:{recipe:structuredClone(recipe),previewPath:record.previewPath},components,
    assetFiles:assetFiles.map(({bytes,...f})=>f),authorship:{version:AUTHORING_VERSION,units,limitations}};
  const semantic=semanticComponents(p);p.components.push(...semantic.components);if(semantic.samples.length)p.authorship.semanticSamples=semantic.samples;
  p.components.push(...ornamentComponents(p),...carouselIdentityComponents(p));
  const portrait=portraitAdaptations(p);p.components.push(...portrait.components);if(portrait.provenance.length)p.authorship.formatAdaptations=portrait.provenance;
  p.components.push(...curatedArtComponents(p));
  return {package:p,assetFiles};
}
