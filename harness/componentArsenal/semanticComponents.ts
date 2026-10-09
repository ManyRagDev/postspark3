import {arsenalHash} from "../../shared/arsenalContent";
import {arsenalPieceSchema,type PieceDefinitionV2,type ResolvedVariantDefinitionV2} from "../../shared/designArsenal";
import {createComponentDefinition,type ComponentDefinitionV1} from "../../shared/componentAssembly";
import type {VariableContent} from "../../shared/variableContent";
import type {ComponentPackage} from "./extract";
import {sha256} from "./inventory";
import {aspectRatioDimensions} from "../../shared/aspectRatios";

export type SemanticPreview={componentId:string;mode:"list"|"comparison";presentation:"source"|"quiet";content:VariableContent};
function immutableComponent(input:Omit<ComponentDefinitionV1,"hash">):ComponentDefinitionV1{
  const {id:ignored,...d}=input,h=sha256(arsenalHash(d));
  const id=`${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;
  return createComponentDefinition({...d,id});
}
function prepared(base:ComponentDefinitionV1,fragment:ResolvedVariantDefinitionV2,pieces:Record<string,PieceDefinitionV2>,label:string,description:string):ComponentDefinitionV1{
  const usedPieces=Object.fromEntries(fragment.instances.map(i=>[i.pieceHash,pieces[i.pieceHash]]));
  const usedAssetIds=new Set(Object.values(usedPieces).map(p=>p.fontAssetId).filter(Boolean)),assets=base.assets.filter(a=>usedAssetIds.has(a.id));
  const {hash:unusedHash,...definition}=base;
  const role=fragment.bindings.some(b=>b.kind==="list")?"list" as const:"comparison" as const;
  return immutableComponent({...definition,label,description,roles:["static",role,"example"],source:{...base.source,variantKey:fragment.variantKey},fragment:{...fragment,assetIds:assets.map(a=>a.id)},pieces:usedPieces,assets,colorRoles:Object.fromEntries(fragment.instances.map(i=>[i.id,usedPieces[i.pieceHash].kind==="text"?"text" as const:"preserve" as const])),removableElementIds:[]});
}
export function semanticComponents(p:ComponentPackage):{components:ComponentDefinitionV1[];samples:SemanticPreview[]}{
  const components:ComponentDefinitionV1[]=[],samples:SemanticPreview[]=[];
  const source=p.source.referenceId;
  if(source!=="1c2fb00a82a764bab2f4374d03f67886"&&source!=="f659cc876f6d0cce3745e91bf2ca5454")return{components,samples};
  const units=p.authorship.units;
  for(const presentation of ["source","quiet"] as const){
    const parent=p.components.find(c=>c.kind==="content"&&(presentation==="quiet"?c.fragment.variantKey.endsWith("-quiet"):!c.fragment.variantKey.endsWith("-quiet")))!;
    const f=structuredClone(parent.fragment),pieces=structuredClone(parent.pieces);
    const unit=units.find(u=>source.startsWith("1c2")?u.fields.includes("lista"):u.fields.includes("left"))!;
    const targetBinding=f.bindings.find(b=>b.source===unit.source);if(!targetBinding)throw new Error("Unidade semântica de lista/comparação ausente");
    const ids=targetBinding.targetIds,original=f.instances.find(i=>i.id===ids[0])!;
    const {contentFragment:unusedContentFragment,...pieceStyle}=pieces[original.pieceHash];
    const sampleUnits=units.filter(u=>u.source!==unit.source&&f.bindings.some(b=>b.source===u.source));
    const content:VariableContent={schemaVersion:3,blocks:sampleUnits.map((u,i)=>({id:`text-${i}`,type:"text",role:u.role,text:u.sampleText})),caption:"Ensaio semântico, revisão pendente.",hashtags:[]};
    if(f.bindings.some(b=>b.source==="block:callToAction:0:text")&&!sampleUnits.some(u=>u.role==="callToAction"))content.blocks.push({id:"authored-cta",type:"text",role:"callToAction",text:"Conheça as opções e escolha o próximo passo."});
    f.bindings=f.bindings.filter(b=>b.id!==targetBinding.id);
    if(source.startsWith("1c2")){
      const removed=new Set(ids.slice(1));f.instances=f.instances.filter(i=>!removed.has(i.id));f.relations=f.relations.filter(r=>r.outputs.every(o=>!removed.has(o.targetId))&&r.inputs.every(id=>!removed.has(id)));
      const piece=arsenalPieceSchema.parse({...pieceStyle,fixedText:null}),ph=arsenalHash(piece);pieces[ph]=piece;original.pieceHash=ph;
      const gap=presentation==="quiet"?f.artboard.height*.023:Math.max(8,(parent.fragment.instances.find(i=>i.id===ids[1])?.y??original.y+original.height+12)-original.y-original.height);
      f.bindings.push({...targetBinding,kind:"list",source:"block:list:0:items",targetIds:[original.id],cardinality:{min:1,max:6},gap,label:"Lista de conteúdo — itens reais"});
      if(presentation==="quiet"){
        original.x=f.artboard.width*.10;original.width=f.artboard.width*.80;
        original.height=f.artboard.height*.045;
        const fit=f.relations.find(r=>r.kind==="textFit"&&r.outputs.some(o=>o.targetId===original.id));if(fit?.kind==="textFit"){fit.parameters.maxHeight=f.artboard.height*.14;fit.parameters.maxWidth=original.width;}
        const flow=f.relations.find(r=>r.kind==="verticalFlow");if(flow?.kind==="verticalFlow")flow.parameters.gap=f.artboard.height*.012;
        if(f.instances.some(i=>i.id==="quiet-support")){
          const old=removed;for(const r of f.relations)r.inputs=r.inputs.filter(id=>!old.has(id));
        }
        const panelPiece=arsenalPieceSchema.parse({...pieceStyle,kind:"rect",fill:f.artboard.background,stroke:"#A8A29E",strokeWidth:1,cornerRadius:8,fontFamily:"Arial",fontAssetId:null,fixedText:null}),panelHash=arsenalHash(panelPiece);pieces[panelHash]=panelPiece;
        const panelId="quiet-list-panel";
        f.instances.push({...original,id:panelId,pieceHash:panelHash,zIndex:-1,x:original.x-24,y:original.y-20,width:original.width+48,height:original.height+40});
        f.relations.push({id:"quiet-list-surface",kind:"surfaceFit",version:1,enabled:true,inputs:[original.id],outputs:[{targetId:panelId,properties:["x","y","width","height"]}],parameters:{padding:{left:24,right:24,top:20,bottom:20},minWidth:original.width+48,minHeight:original.height+40}});
      }else{
        f.relations.push({id:"typed-list-flow",kind:"verticalFlow",version:1,enabled:true,inputs:[original.id],outputs:[{targetId:original.id,properties:["y"]}],parameters:{startY:original.y,gap}});
        // Authored support panel follows the repeated items, not the example's four fixed rows.
        const panel=f.instances.find(i=>i.id==="cartao-conteudo");
        if(panel)f.relations.push({id:"typed-list-surface",kind:"surfaceFit",version:1,enabled:true,inputs:[original.id],outputs:[{targetId:panel.id,properties:["x","y","width","height"]}],parameters:{padding:{left:24,right:24,top:72,bottom:24},minWidth:panel.width,minHeight:panel.height}});
      }
      const text=unit.sampleText.split(/\s*[-•]\s+/).map(s=>s.trim()).filter(Boolean);
      content.blocks.push({id:"real-list",type:"list",items:(text.length?text:["Observe o contexto","Escolha a mensagem","Revise o resultado"]).map((text,i)=>({id:`item-${i}`,text}))});
      f.variantKey+=`-typed-list-${presentation}`;
      const c=prepared(parent,f,pieces,`${p.source.title} · lista ${presentation}`,"Lista tipada e editável, com itens independentes e superfície vinculada; referência original preservada.");
      components.push(c);samples.push({componentId:c.id,mode:"list",presentation,content});
    }else{
      const comparison={id:"real-comparison",type:"comparison" as const,left:{label:"ANTES",text:"We make"},right:{label:"DEPOIS",text:"You clear"}};
      content.blocks.push(comparison);
      if(presentation==="source"){
        for(const [index,id]of ids.entries()){
          const instance=f.instances.find(i=>i.id===id)!,{contentFragment:oldFragment,...style}=pieces[instance.pieceHash],piece=arsenalPieceSchema.parse(style),ph=arsenalHash(piece);pieces[ph]=piece;instance.pieceHash=ph;
          f.bindings.push({...targetBinding,id:`typed-side-${index}`,source:`block:comparison:0:${index===0?"left":"right"}.text`,targetIds:[id],label:index===0?"Comparação — esquerda":"Comparação — direita"});
          const labelId=`source-compare-label-${index}`,labelPiece=arsenalPieceSchema.parse({...style,fontSize:style.fontSize*.62,fixedText:null}),labelHash=arsenalHash(labelPiece);pieces[labelHash]=labelPiece;
          f.instances.push({...instance,id:labelId,pieceHash:labelHash,y:instance.y-labelPiece.fontSize*1.8,height:labelPiece.fontSize*1.4});
          f.bindings.push({...targetBinding,id:`typed-label-${index}`,source:`block:comparison:0:${index===0?"left":"right"}.label`,targetIds:[labelId],label:index===0?"Comparação — rótulo esquerdo":"Comparação — rótulo direito"});
          f.relations.push({id:`fit-${labelId}`,kind:"textFit",version:1,enabled:true,inputs:[],outputs:[{targetId:labelId,properties:["x","width","height","fontSize"]}],parameters:{anchor:"left",maxWidth:instance.width,maxHeight:labelPiece.fontSize*1.4,minFontSize:labelPiece.fontSize*.85}});
        }
      }else{
        f.instances=f.instances.filter(i=>!ids.includes(i.id));f.relations=f.relations.filter(r=>!r.outputs.some(o=>ids.includes(o.targetId)));
        for(const r of f.relations)r.inputs=r.inputs.filter(id=>!ids.includes(id));
        const heading=f.bindings.find(b=>b.source.includes("headline"))!.targetIds[0],W=f.artboard.width,H=f.artboard.height;
        const target=aspectRatioDimensions[f.aspectRatio],scale=Math.min(target.width/W,target.height/H);
        for(const [column,side]of ["left","right"].entries())for(const part of ["label","text"] as const){
          const id=`compare-${side}-${part}`,piece=arsenalPieceSchema.parse({...pieceStyle,fontSize:Math.max(part==="label"?W*.034:W*.03,scale<1?36.4/scale:0),fixedText:null}),ph=arsenalHash(piece);pieces[ph]=piece;
          f.instances.push({...original,id,pieceHash:ph,x:W*(column===0?.10:.55),y:H*(part==="label"?.39:.47),width:W*.35,height:H*(part==="label"?.08:.42),zIndex:column*2+(part==="label"?1:2)});
          f.bindings.push({...targetBinding,id:`binding-${id}`,source:`block:comparison:0:${side}.${part}`,targetIds:[id],label:`Comparação ${side} ${part}`});
          f.relations.push({id:`fit-${id}`,kind:"textFit",version:1,enabled:true,inputs:[],outputs:[{targetId:id,properties:["x","width","height","fontSize"]}],parameters:{anchor:"left",maxWidth:W*.35,maxHeight:H*(part==="label"?.08:.42),minFontSize:piece.fontSize*.85}});
          f.relations.push({id:`anchor-${id}`,kind:"anchor",version:1,enabled:true,inputs:[part==="label"?heading:`compare-${side}-label`],outputs:[{targetId:id,properties:["y"]}],parameters:{axis:"y",referenceEdge:"end",targetEdge:"start",offset:H*(part==="label"?.09:.025)}});
        }
        const panelId="quiet-comparison-surface",panelPiece=arsenalPieceSchema.parse({...pieceStyle,kind:"rect",fill:f.artboard.background,stroke:pieceStyle.fill,strokeWidth:1,cornerRadius:8,fontFamily:"Arial",fontAssetId:null,fixedText:null}),panelHash=arsenalHash(panelPiece);pieces[panelHash]=panelPiece;
        f.instances.push({...original,id:panelId,pieceHash:panelHash,x:W*.08,y:H*.37,width:W*.84,height:H*.45,zIndex:-1});
        f.relations.push({id:"quiet-comparison-fit",kind:"surfaceFit",version:1,enabled:true,inputs:["compare-left-label","compare-left-text","compare-right-label","compare-right-text"],outputs:[{targetId:panelId,properties:["x","y","width","height"]}],parameters:{padding:{left:W*.02,right:W*.02,top:H*.02,bottom:H*.02},minWidth:W*.84,minHeight:H*.15}});
        const cta=f.bindings.find(b=>b.source==="block:callToAction:0:text")?.targetIds[0];
        if(cta){
          const flow=f.relations.find(r=>r.kind==="verticalFlow");if(flow){flow.inputs=flow.inputs.filter(id=>id!==cta);flow.outputs=flow.outputs.filter(o=>o.targetId!==cta);}
          f.relations.push({id:"quiet-comparison-cta",kind:"anchor",version:1,enabled:true,inputs:[panelId],outputs:[{targetId:cta,properties:["y"]}],parameters:{axis:"y",referenceEdge:"end",targetEdge:"start",offset:H*.045}});
        }
      }
      f.variantKey+=`-typed-comparison-${presentation}`;
      const c=prepared(parent,f,pieces,`${p.source.title} · comparação ${presentation}`,"Comparação canônica com lados independentes; campos não são concatenados nem repetidos.");
      components.push(c);samples.push({componentId:c.id,mode:"comparison",presentation,content});
    }
  }
  return{components,samples};
}
