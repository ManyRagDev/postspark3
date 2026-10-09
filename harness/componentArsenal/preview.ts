import { assemblyIdentity,materializeAssemblyPlan,compositionFromAssemblyBundle,type ComponentDefinitionV1 } from "../../shared/componentAssembly";
import { readArsenalComposition,type ArsenalComposition } from "../../shared/designArsenal";
import { resolveArsenalGeometry,type ArsenalTextMeasurer,arsenalWorldGeometry } from "../../shared/arsenalGeometry";
import type { ComponentPackage } from "./extract";
import type { ReferenceReconstructionSpecV2 } from "../../shared/referenceReconstruction";

export function buildDraftPreview(p:ComponentPackage,mode:"original"|"quiet",measureText:ArsenalTextMeasurer,texts:Record<string,string>={},componentId?:string) {
  const content=p.components.find(c=>c.kind==="content"&&(componentId?c.id===componentId:mode==="quiet"?c.fragment.variantKey.endsWith("-quiet"):!c.fragment.variantKey.endsWith("-quiet")));
  if(!content)throw new Error("Este registro não é uma composição gráfica.");
  const sources=new Set(content.fragment.bindings.map(b=>b.source));
  const units=p.authorship.units.filter(u=>sources.has(u.source));
  const blocks=units.map((u,i)=>({id:`draft-${i}`,type:"text" as const,role:u.role,text:texts[u.source]??u.sampleText}));
  if(content.fragment.bindings.some(b=>b.source==="block:body:0:text")&&!units.some(u=>u.role==="body"))blocks.push({id:"authored-body",type:"text",role:"body",text:texts["block:body:0:text"]??"Uma ideia clara ajuda a organizar as informações e escolher o próximo passo."});
  if(content.fragment.bindings.some(b=>b.source==="block:callToAction:0:text")&&!units.some(u=>u.role==="callToAction"))blocks.push({id:"authored-cta",type:"text",role:"callToAction",text:texts["block:callToAction:0:text"]??"Conheça as opções e escolha o próximo passo."});
  const selected:ComponentDefinitionV1[]=mode==="quiet"?[content]:p.components.filter(c=>c.fragment.aspectRatio===content.fragment.aspectRatio&&c.fragment.variantKey.endsWith("-portrait4x5")===content.fragment.variantKey.endsWith("-portrait4x5")&&c.kind!=="typography"&&c.kind!=="ornament"&&(c.kind!=="content"||c.id===content.id));
  const contentDoc={schemaVersion:3 as const,blocks,caption:"Prévia de curadoria, não publicada.",hashtags:[]};
  const palette={background:p.sourceSnapshot.recipe.scene.artboard.background,text:Object.values(content.pieces).find(p=>p.kind==="text")?.fill??"#171717",accent:"#5740B4"};
  const variations=[0,1,2].map(i=>({id:`draft-${i}`,direction:{label:"Prévia de conversão",palette,typographyComponentId:null},caption:contentDoc.caption,hashtags:[],slides:[{id:`slide-${i}`,role:"static" as const,density:"balanced" as const,content:contentDoc,components:selected.map(c=>({id:c.id,hash:c.hash})),mediaPrompts:[]}]}));
  const bundle=materializeAssemblyPlan({schemaVersion:1,postMode:"static",aspectRatio:content.fragment.aspectRatio,variations},selected,{traceId:assemblyIdentity([p.source.fileHash,"local-preview-trace"]),runId:assemblyIdentity([p.source.fileHash,"local-preview-run"]),experimental:true}).variations[0].slides[0].bundle;
  const composition=readArsenalComposition(resolveArsenalGeometry(compositionFromAssemblyBundle(bundle),{measureText,allowReduction:false}));
  return {composition,selected,units};
}

export function buildSemanticPreview(p:ComponentPackage,componentId:string,measureText:ArsenalTextMeasurer,scenario:"short"|"medium"|"long"|"literal"="short") {
  const sample=p.authorship.semanticSamples?.find(s=>s.componentId===componentId),component=p.components.find(c=>c.id===componentId);
  if(!sample||!component)throw new Error("Amostra semântica ausente");
  const content=structuredClone(sample.content),literal="Literal: 50% & <div> “aspas” — texto completo.";
  for(const block of content.blocks){
    if(block.type==="list")block.items=Array.from({length:scenario==="short"?2:scenario==="medium"?4:6},(_,i)=>({id:`item-${i}`,text:scenario==="literal"?literal:scenario==="long"?`Item ${i+1}: observe o contexto e preserve todas as informações relevantes ao explicar esta ideia com clareza.`:scenario==="medium"?`Item ${i+1}: escolha uma mensagem clara e revise o resultado.`:`Item ${i+1}: observe.`}));
    if(block.type==="comparison"){
      block.left.text=scenario==="literal"?literal:scenario==="short"?"Sem direção.":scenario==="medium"?"A mensagem mistura ideias e deixa a decisão em aberto.":"Uma explicação extensa apresenta todas as condições, exemplos e consequências sem eliminar palavras ou esconder detalhes do pedido.";
      block.right.text=scenario==="literal"?literal:scenario==="short"?"Com intenção.":scenario==="medium"?"A mensagem organiza as ideias e mostra o próximo passo.":"Uma alternativa extensa mantém cada informação e diferencia os resultados com critérios claros, mantendo a comparação completa e editável.";
    }
  }
  const palette={background:p.sourceSnapshot.recipe.scene.artboard.background,text:Object.values(component.pieces).find(p=>p.kind==="text")?.fill??"#171717",accent:"#5740B4"};
  const variations=[0,1,2].map(i=>({id:`semantic-${i}`,direction:{label:"Ensaio de lista/comparação",palette,typographyComponentId:null},caption:content.caption,hashtags:[],slides:[{id:`slide-${i}`,role:"static" as const,density:"balanced" as const,content,components:[{id:component.id,hash:component.hash}],mediaPrompts:[]}]}));
  const bundle=materializeAssemblyPlan({schemaVersion:1,postMode:"static",aspectRatio:component.fragment.aspectRatio,variations},[component],{traceId:assemblyIdentity([component.id,"semantic-trace"]),runId:assemblyIdentity([component.id,scenario]),experimental:true}).variations[0].slides[0].bundle;
  const composition=readArsenalComposition(resolveArsenalGeometry(compositionFromAssemblyBundle(bundle),{measureText,allowReduction:false}));
  return{composition,content,sample};
}

/** A diagnostic Stage scene of the compiled result; does not claim product save/reopen validation. */
export function diagnosticFromComposition(p:ComponentPackage,c:ArsenalComposition):ReferenceReconstructionSpecV2 {
  const source=p.sourceSnapshot.recipe.scene;
  const fonts=p.assetFiles.map(f=>{
    const original=source.fonts.find(font=>font.sha256===f.manifest.sha256)!;
    return {...original,family:f.manifest.family!,weight:f.manifest.weight!,dataUrl:original.dataUrl};
  });
  for(const e of c.elements.filter(e=>e.kind==="text")){
    const f=fonts.find(f=>f.family===e.fontFamily);if(f&&!fonts.some(f=>f.family===e.fontFamily&&f.weight===e.fontWeight))fonts.push({...f,weight:e.fontWeight});
  }
  return {...source,source:{...source.source,widthPx:c.artboard.width,heightPx:c.artboard.height},artboard:{background:c.artboard.background},fonts,
    layers:c.elements.map(e=>{
      const w=arsenalWorldGeometry(e,c.groups),kind=e.kind==="media"?"rect":e.kind;
      return {id:e.id,kind,role:e.bindingId??"decoration",zIndex:e.zIndex,x:w.x,y:w.y,width:e.width*w.scale,height:e.height*w.scale,text:e.kind==="text"?e.text:null,fontFamily:e.fontFamily,fontWeight:e.fontWeight,fontSize:e.fontSize*w.scale,lineHeight:e.lineHeight,letterSpacing:e.letterSpacing*w.scale,align:e.align,fill:e.fill,strokeColor:e.stroke,strokeWidth:e.strokeWidth*w.scale,rotationDeg:w.rotation,opacity:e.opacity,points:e.points.map(n=>n*w.scale),arc:null,extrusion:e.extrusion?{...e.extrusion,offsetX:e.extrusion.offsetX*w.scale,offsetY:e.extrusion.offsetY*w.scale}:null,confidenceScore:1,provenance:"curator",support:"supported",uncertainty:null};
    })};
}
