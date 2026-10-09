import {arsenalHash} from "../../shared/arsenalContent";
import {arsenalPieceSchema,type PieceDefinitionV2,type ResolvedVariantDefinitionV2} from "../../shared/designArsenal";
import type {SourceRecord} from "./inventory";

/** Reuse actual support surfaces, simplifying the decorative set without inventing source fidelity. */
export function authorQuietIdentity(record:SourceRecord,source:ResolvedVariantDefinitionV2,sourcePieces:Record<string,PieceDefinitionV2>,pieces:Record<string,PieceDefinitionV2>,instances:ResolvedVariantDefinitionV2["instances"],relations:ResolvedVariantDefinitionV2["relations"]):string|null{
  const window=record.referenceId==="1c2fb00a82a764bab2f4374d03f67886",paper=record.referenceId==="0623fb1c14937cd1e67e980b566710ba";
  if(!window&&!paper)return null;
  const W=source.artboard.width,H=source.artboard.height,textIds=instances.map(i=>i.id),mainSource=source.instances.find(i=>i.id===(window?"titulo-janela":"papel-principal"))!;
  const mainPiece=sourcePieces[mainSource.pieceHash],rgb=mainPiece.fill.slice(1).match(/../g)!.map(s=>parseInt(s,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4),lum=rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
  for(const i of instances){const p=arsenalPieceSchema.parse({...pieces[i.pieceHash],fill:lum>.179?"#000000":"#FFFFFF"}),hash=arsenalHash(p);pieces[hash]=p;i.pieceHash=hash;}
  const add=(id:string,sourceId:string,zIndex:number,geometry:{x:number;y:number;width:number;height:number})=>{
    const original=source.instances.find(i=>i.id===sourceId)!;if(sourcePieces[original.pieceHash].kind!=="rect")throw new Error("Superfície adaptativa exige rect real; polygon mantém limite explícito");
    const piece=sourcePieces[original.pieceHash];pieces[original.pieceHash]=piece;
    instances.push({id,pieceHash:original.pieceHash,parentId:null,zIndex,...geometry,rotation:0,opacity:original.opacity});
  };
  add("quiet-support",mainSource.id,-10,{x:W*.10,y:H*.075,width:W*.80,height:H*.60});
  relations.push({id:"quiet-support-fit",kind:"surfaceFit",version:1,enabled:true,inputs:textIds,outputs:[{targetId:"quiet-support",properties:["x","y","width","height"]}],parameters:{padding:{left:W*.04,right:W*.04,top:H*(window?.055:.04),bottom:H*.035},minWidth:W*.80,minHeight:H*.12}});
  if(paper){
    add("quiet-paper-shadow","sombra-papel",-11,{x:W*.106,y:H*.081,width:W*.80,height:H*.60});
    relations.push({id:"quiet-shadow-fit",kind:"surfaceFit",version:1,enabled:true,inputs:["quiet-support"],outputs:[{targetId:"quiet-paper-shadow",properties:["width","height"]}],parameters:{padding:{left:0,right:0,top:0,bottom:0},minWidth:1,minHeight:1}});
    for(const axis of ["x","y"] as const)relations.push({id:`quiet-shadow-${axis}`,kind:"anchor",version:1,enabled:true,inputs:["quiet-support"],outputs:[{targetId:"quiet-paper-shadow",properties:[axis]}],parameters:{axis,referenceEdge:"start",targetEdge:"start",offset:W*.006}});
  }else{
    for(let n=0;n<3;n++){
      const id=`quiet-window-control-${n}`;add(id,`janela-foto-controle-${n}`,-9,{x:W*(.12+n*.024),y:H*.083,width:W*.015,height:W*.015});
      relations.push({id:`quiet-control-x-${n}`,kind:"anchor",version:1,enabled:true,inputs:["quiet-support"],outputs:[{targetId:id,properties:["x"]}],parameters:{axis:"x",referenceEdge:"start",targetEdge:"start",offset:W*(.02+n*.024)}});
      relations.push({id:`quiet-control-y-${n}`,kind:"anchor",version:1,enabled:true,inputs:["quiet-support"],outputs:[{targetId:id,properties:["y"]}],parameters:{axis:"y",referenceEdge:"start",targetEdge:"start",offset:H*.009}});
    }
  }
  const used=new Set(instances.map(i=>i.pieceHash));for(const hash of Object.keys(pieces))if(!used.has(hash))delete pieces[hash];
  return window?"janela de leitura":"papel de leitura";
}
